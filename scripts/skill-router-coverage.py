#!/usr/bin/env python3
"""Replayable coverage measure for the skill router table (read-only, stdlib only).

For each real typed owner prompt in the last 14 days of Claude Code main-session
transcripts, ground truth = skills/recipes the agent actually used in that turn.
The router table is applied with the hook's own tool (grep -Eiq), so the match
semantics are identical. Prompt text is printed to stdout only (examples), never stored.

Usage: skill-router-coverage.py [--today YYYY-MM-DD] [--table FILE] [--examples N]
       skill-router-coverage.py --self-test
Windows: 14 days ending --today; the oldest 10 are "fit", the newest 4 "held-out".
Limit: the ground truth includes skills the hook itself nudged, so recall of rows
that already exist is a floor-biased view; read the unrouted list for new rows.
"""
import argparse, collections, datetime as dt, glob, json, os, re, shutil
import subprocess, sys, tempfile
from pathlib import Path

HOME = Path.home()
ROOT = Path(__file__).resolve().parent.parent
TABLE = ROOT / ".agents/hooks/skill-router-table.tsv"
PASTE = re.compile(r"<pasted_content[^>]*>[\s\S]*?</pasted_content[^>]*>")
# Same skip as the hook, plus test-harness and non-typed rows.
SKIP = re.compile(r"teammate-message|^Another Claude session|Ran [0-9]+ shell|^\[skill-router\]"
                  r"|^<(task-notification|system-reminder|command-|local-command)"
                  r"|^\[Request interrupted|^Run Bash command|^Stop hook feedback|_TURN_\d"
                  # Machine-made prompts (compaction summary, /security-review, worker briefs).
                  r"|^(Review this change for security|This session is being continued|<artifact-content"
                  r"|You previously flagged|Your task is in the file|Owner before|Reply with the single word)")
SKILL_PATH = re.compile(r"/skills/([^/]+)/SKILL\.md$")
SLASH = re.compile(r"<command-name>/([^<\s]+)</command-name>\s*(?:<command-message>.*?</command-message>)?"
                   r"\s*(?:<command-args>([\s\S]*?)</command-args>)?")
BASE_DIR = re.compile(r"Base directory for this skill: (\S+)")


def user_text(m):
    c = m.get("content")
    if isinstance(c, str):
        return c
    return "\n".join(b.get("text", "") for b in c or [] if isinstance(b, dict) and b.get("type") == "text")


def used_in(rec):
    """(loaded, acted) sets for one assistant record: loaded = Skill/Workflow/Read(SKILL.md);
    acted = domain tool/script actions that verify the prompt matched the owner's job even when SKILL.md was not loaded."""
    out, acted = set(), set()
    for b in (rec.get("message") or {}).get("content") or []:
        if not (isinstance(b, dict) and b.get("type") == "tool_use"):
            continue
        n, i = b.get("name"), b.get("input") or {}
        if n == "Skill" and i.get("skill"):
            out.add(i["skill"].lstrip("/"))
        elif n == "Workflow":
            p = i.get("name") or os.path.basename(i.get("scriptPath") or "")
            if p:
                # Inline workflows get a generated name "<recipe>-wf_<id>.js".
                out.add(re.sub(r"(-wf_[\w-]+)?\.(workflow\.)?js$", "", p))
        elif n == "Read":
            fp = i.get("file_path") or ""
            mm = SKILL_PATH.search(fp)
            # Skip repo checkouts: reading a skill there is maintenance, not use.
            if mm and "/github/" not in fp:
                out.add(mm.group(1))
        elif n in ("Agent", "mcp__tmux-agent__assign", "mcp__tmux-agent__tell"):
            acted.add("delegation-templates")
        elif n and n.startswith("mcp__codex-cu__"):
            acted.add("codex-cu")
        elif n == "Bash":
            cmd = i.get("command") or ""
            if re.search(r"\b(create_handoff|resume_pack|validate_handoff)\.py\b", cmd):
                acted.add("session-handoff")
            if re.search(r"\b(agent-tmux|tmux-agent-\w+)\b", cmd):
                acted.add("delegation-templates")
            if "agent-browser" in cmd and ("39231" in cmd or "GROK_BOT" in cmd):
                acted.add("using-grok-bot-app")
    return out, acted | out


def parse_file(path):
    """Yield turn dicts {ts, text, used} for one main-session transcript."""
    turn = None
    for line in open(path, encoding="utf-8", errors="replace"):
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if d.get("isSidechain"):
            continue
        t = d.get("type")
        if t == "user":
            if d.get("isMeta") or d.get("toolUseResult") is not None:
                if d.get("isMeta") and turn is not None:  # slash-skill expansion row
                    for p in BASE_DIR.findall(user_text(d.get("message") or {})):
                        turn["expanded"].add(os.path.basename(p.rstrip("/")))
                continue
            origin = d.get("origin")
            if origin and origin.get("kind") != "human":
                continue
            text = user_text(d.get("message") or {})
            if turn is not None:
                yield turn
            turn = None
            slash = SLASH.search(text) if text.lstrip().startswith("<command-") else None
            if slash:
                text = "/" + slash.group(1) + " " + (slash.group(2) or "")
            if not text.strip():
                continue
            turn = {"ts": d.get("timestamp", ""), "text": text, "used": set(), "acted": set(),
                    "slash": slash.group(1).split(":")[-1] if slash else None, "expanded": set()}
        elif t == "assistant" and turn is not None:
            u, a = used_in(d)
            turn["used"] |= u
            turn["acted"] |= a
    if turn is not None:
        yield turn


def finish(turn):
    """Apply the owner-prompt filter and finalize ground truth; None = not a typed prompt."""
    text = PASTE.sub("", turn["text"])[:2000]
    if not text.strip() or SKIP.search(text):
        return None
    used = set(turn["used"])
    acted = set(turn.get("acted") or used)
    # A typed /x counts only when the harness expanded it into a skill; other
    # slash commands (/compact, /model, ...) are not skill prompts.
    if turn["slash"]:
        if turn["slash"] not in turn["expanded"]:
            return None
        used.add(turn["slash"])
        acted.add(turn["slash"])
    return {"ts": turn["ts"], "text": text, "used": used, "acted": acted, "slash": bool(turn["slash"])}


def load_table(path):
    rows = []
    for ln in open(path, encoding="utf-8"):
        ln = ln.rstrip("\n")
        if not ln or ln.startswith("#"):
            continue
        re_, kind, owner = ln.split("\t")[:3]
        p = (HOME / ".agents/skills" / owner / "SKILL.md") if kind == "skill" \
            else (HOME / ".claude/workflows" / f"{owner}.workflow.js")
        rows.append((re_, kind, owner, p.exists()))
    return rows


def first_match(texts, rows):
    """Per text: owner of the first matching row whose owner file exists (hook order)."""
    grep = shutil.which("grep", path="/usr/bin:/bin") or "grep"
    hit = [None] * len(texts)
    with tempfile.TemporaryDirectory() as td:
        files = []
        for i, tx in enumerate(texts):
            f = os.path.join(td, str(i))
            with open(f, "w", encoding="utf-8") as fh:
                fh.write(tx)  # no trailing newline, like printf '%s'
            files.append(f)
        for re_, _kind, owner, exists in rows:
            if not exists:
                continue
            for k in range(0, len(files), 500):
                r = subprocess.run([grep, "-Eil", "--", re_] + files[k:k + 500],
                                   capture_output=True, text=True)
                for f in r.stdout.splitlines():
                    i = int(os.path.basename(f))
                    if hit[i] is None:
                        hit[i] = owner
    return hit


def collect(today, days=14, base=None):
    lo = today - dt.timedelta(days=days - 1)
    turns = []
    for f in glob.glob(str((base or HOME / ".claude/projects") / "*/*.jsonl")):
        for t in parse_file(f):
            r = finish(t)
            if not r:
                continue
            try:
                day = dt.date.fromisoformat(r["ts"][:10])
            except ValueError:
                continue
            if lo <= day <= today:
                r["split"] = "heldout" if (today - day).days < 4 else "fit"
                turns.append(r)
    return turns


def report(turns, rows, examples):
    hits = first_match([t["text"] for t in turns], rows)
    for t, h in zip(turns, hits):
        t["hit"] = h
    for split in ("fit", "heldout"):
        ts = [t for t in turns if t["split"] == split]
        gt = [t for t in ts if t["used"]]
        ok = [t for t in gt if t["hit"] in t["used"]]
        # Organic = used skills the owner did not name in the prompt (no "/x", no "x skill").
        org = [(t, {u for u in t["used"] if u.split(":")[-1] not in t["text"].lower()}) for t in gt]
        org = [(t, u) for t, u in org if u]
        ok_org = [t for t, u in org if t["hit"] in u]
        matched = [t for t in ts if t["hit"]]
        false = [t for t in matched if t["hit"] not in t["used"]]
        pct = lambda a, b: f"{100 * a / b:.1f}%" if b else "n/a"
        print(f"== {split}: typed turns {len(ts)}, with ground truth {len(gt)}")
        print(f"   recall {len(ok)}/{len(gt)} = {pct(len(ok), len(gt))}"
              f"\n   organic recall {len(ok_org)}/{len(org)} = {pct(len(ok_org), len(org))}"
              " (skill not named by the owner in the prompt)")
        named = [t for t in false if t["hit"].split(":")[-1] in t["text"].lower()]
        print(f"   false-hit {len(false)}/{len(matched)} matched = {pct(len(false), len(matched))}"
              f"  ({pct(len(false), len(ts))} of all typed turns); owner named in the prompt: {len(named)}")
        used_n, ok_n, hit_n = collections.Counter(), collections.Counter(), collections.Counter()
        for t in gt:
            for u in t["used"]:
                used_n[u] += 1
                ok_n[u] += t["hit"] == u
        for t in matched:
            hit_n[t["hit"]] += 1
        print("   per-owner (routed-owners only): owner used correct-route fired")
        for o in dict.fromkeys(r[2] for r in rows):
            print(f"     {o:34} {used_n[o]:3} {ok_n[o]:3} {hit_n[o]:3}")
        acted_only = [t for t in false if t["hit"] in t.get("acted", set())]
        print(f"   nudge-read {len(matched) - len(false)}/{len(matched)} matched "
              "(loaded in same turn as modeled match; order unverified)")
        print(f"   route-evidence acted-without-read {len(acted_only)}; "
              f"unclassified {len(false) - len(acted_only)}")
        acted_n = collections.Counter(t["hit"] for t in acted_only)
        print("   per-owner route-evidence: owner acted-without-read unclassified")
        for o in dict.fromkeys(r[2] for r in rows):
            print(f"     {o:34} {acted_n[o]:3} {hit_n[o] - ok_n[o] - acted_n[o]:3}")
        miss = collections.Counter()
        for t in gt:
            if t["hit"] not in t["used"]:
                miss.update(t["used"])
        if examples:
            print(f"   top missed used skills (turns where the used skill was not the routed owner):")
            for s, n in miss.most_common(12):
                print(f"     {s}: {n}")
                shown = 0
                for t in gt:
                    if s in t["used"] and t["hit"] != s and shown < examples:
                        print("        > " + t["text"][:110].replace("\n", " "))
                        shown += 1


def self_test():
    def rec(**k):
        return json.dumps(k)
    with tempfile.TemporaryDirectory() as td:
        os.makedirs(f"{td}/p")
        lines = [
            rec(type="user", timestamp="2026-11-05T01:00:00Z", message={"content": "do a pdf read of x.pdf <pasted_content_1>skill-creator</pasted_content_1>"}),
            rec(type="assistant", message={"content": [{"type": "tool_use", "name": "Skill", "input": {"skill": "pdf"}}]}),
            rec(type="user", timestamp="2026-11-05T02:00:00Z", toolUseResult={}, message={"content": [{"type": "tool_result"}]}),
            rec(type="user", timestamp="2026-11-05T03:00:00Z", message={"content": "<task-notification>x</task-notification>"}),
            rec(type="user", timestamp="2026-11-05T04:00:00Z", message={"content": "second opinion please"}),
            rec(type="assistant", message={"content": [
                {"type": "tool_use", "name": "Workflow", "input": {"scriptPath": "/a/consensus-gate.workflow.js"}},
                {"type": "tool_use", "name": "Read", "input": {"file_path": "/h/.agents/skills/triage/SKILL.md"}},
                {"type": "tool_use", "name": "Read", "input": {"file_path": "/h/github/r/skills/tdd/SKILL.md"}}]}),
            rec(type="user", timestamp="2026-11-05T05:00:00Z", isSidechain=True, message={"content": "sidechain"}),
            rec(type="user", timestamp="2026-11-05T06:00:00Z", message={"content": "<command-name>/triage</command-name><command-message>triage</command-message><command-args>the issues</command-args>"}),
            rec(type="user", timestamp="2026-11-05T06:00:01Z", isMeta=True, message={"content": [{"type": "text", "text": "Base directory for this skill: /h/.agents/skills/triage"}]}),
            rec(type="user", timestamp="2026-11-05T07:00:00Z", message={"content": "派 sol 審這份 diff"}),
            rec(type="assistant", message={"content": [{"type": "tool_use", "name": "mcp__tmux-agent__assign", "input": {"profile": "sol"}}]}),
        ]
        Path(f"{td}/p/s.jsonl").write_text("\n".join(lines) + "\n")
        turns = collect(dt.date(2026, 11, 6), base=Path(td))
        assert len(turns) == 4, turns  # task-notification, tool result, sidechain dropped
        t = {x["text"][:6]: x for x in turns}
        assert "skill-creator" not in turns[0]["text"] and t["do a p"]["used"] == {"pdf"}
        assert t["second"]["used"] == {"consensus-gate", "triage"}, t["second"]  # repo checkout Read ignored
        assert t["/triag"]["used"] == {"triage"} and t["/triag"]["slash"]
        assert t["派 sol "]["used"] == set() and t["派 sol "]["acted"] == {"delegation-templates"}, t["派 sol "]
        assert all(x["split"] == "heldout" for x in turns)
        rows = [("(read|fill)[^。]{0,10}\\.?pdf\\b", "skill", "pdf", True),
                ("second opinion", "recipe", "consensus-gate", True),
                ("派 sol", "skill", "delegation-templates", True),
                ("pdf", "skill", "absent-owner", False)]
        h = first_match([x["text"] for x in turns], rows)
        assert h == ["pdf", "consensus-gate", None, "delegation-templates"], h
        from contextlib import redirect_stdout
        from io import StringIO
        buf = StringIO()
        turns_for_report = [t["派 sol "], dict(t["派 sol "],
                            text="派 sol 不准用 delegation-templates", acted=set())]
        with redirect_stdout(buf):
            report(turns_for_report, rows, 0)
        output = buf.getvalue()
        assert "false-hit 2/2 matched" in output, output
        assert "nudge-read 0/2 matched" in output, output
        assert "route-evidence acted-without-read 1; unclassified 1" in output, output
    print("self-test OK")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--today", default=dt.datetime.now(dt.timezone.utc).date().isoformat())
    ap.add_argument("--table", default=str(TABLE))
    ap.add_argument("--examples", type=int, default=3)
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    rows = load_table(a.table)
    turns = collect(dt.date.fromisoformat(a.today))
    # The hook skips "<command-…" prompts and the harness already loaded a typed /skill,
    # so a slash turn can never be a routing win in production.
    turns = [t for t in turns if not t["slash"]]
    print(f"today {a.today}; fit = oldest 10 days, held-out = newest 4; table rows {len(rows)}")
    report(turns, rows, a.examples)


if __name__ == "__main__":
    main()
