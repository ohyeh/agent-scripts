#!/usr/bin/env python3
"""Build cited reading packs from Claude Code and Codex JSONL logs."""

import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


# Exact RESUME Step 3b filters from session-handoff/SKILL.md.
# `capture(re) // {}` is the jq 1.7 spelling of `capture(re)?.field`: `)?.` does not parse on jq 1.7.
CLAUDE_USER = r'''def txt: if type=="string" then . else (map(if .type=="text" then .text elif .type=="image" then "[image]" else empty end)|join(" ")) end;
     def slash: ((capture("<command-name>(?<c>[^<]*)</command-name>") // {}) | .c // "") + " " + ((capture("<command-args>(?<a>[^<]*)</command-args>") // {}) | .a // "");
     [inputs | select(.origin.kind!="plugin" and .isMeta!=true) | .timestamp as $ts
      | (if (.toolUseResult|type)=="object" and (.toolUseResult|has("answers")) then (.toolUseResult as $r | [$r.answers|to_entries[] | "Q: \(.key[0:60])… → A: \(.value|tostring)\(($r.annotations[.key].notes? // "") as $n | if $n!="" then " (note: \($n))" else "" end)"] | join("  ||  "))
         elif .type=="user" and ((.message.content|type)=="string" or (.message.content|map(.type)|index("tool_result"))==null) then .message.content|txt
         elif .type=="attachment" and .attachment.type=="queued_command" then .attachment.prompt|txt
         else empty end) as $t
      | select($t|test("^\\s*<(?!pasted_content|command-|!-- attach)|^Base directory for this skill|^Stop hook feedback|^This session is being continued|^Another Claude session sent a message|^The .+ plugin sent a message")|not)
      | "\($ts[0:19])  \(if ($t|test("^\\s*<command-")) then ($t|slash) else $t end | gsub("[\\r\\n\\t]+";" "))"]
     | (.[]), "COUNT \(length)"'''
CODEX_USER = r'''[inputs | select(.type=="response_item" and .payload.type=="message" and .payload.role=="user")
     | ([.payload.content[]? | if .type=="input_text" then .text elif .type=="input_image" then "[image]" else empty end] | join(" ")) as $t
     | select($t|test("^\\s*(# AGENTS\\.md instructions|<(?!image)[a-z_]+[ >])")|not)
     | "\(.timestamp[0:19])  \($t|gsub("[\\r\\n\\t]+";" "))"] | (.[]), "COUNT \(length)"'''
USER_FILTERS = {"claude-code": CLAUDE_USER, "codex": CODEX_USER}
CALL_TYPES = {"function_call", "custom_tool_call", "local_shell_call"}
TARGET_KEYS = "command file_path path pattern url description query skill prompt code message brief text name".split()
KEEP_WHOLE = {"Agent", "Task", "SendMessage", "AskUserQuestion", "Workflow"}
SLICE_BYTES = 256 * 1024


def run(command, data=None):
    result = subprocess.run(command, input=data, capture_output=True)
    if result.returncode:
        raise ValueError(f"{command[0]} exited {result.returncode}: "
                         f"{result.stderr.decode('utf-8', errors='replace').strip()}")
    return result.stdout


def serialized(value):
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)


def result_text(value):
    if isinstance(value, list):
        return "\n".join(result_text(item) for item in value)
    if isinstance(value, dict) and isinstance(value.get("text"), str):
        metadata = {k: v for k, v in value.items() if k != "text"}
        return serialized(metadata) + "\n" + value["text"]
    return serialized(value)


def object_args(value):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return {}
    return value if isinstance(value, dict) else {}


def blocks(row):
    content = row.get("message", {}).get("content", [])
    return [b for b in content if isinstance(b, dict)] if isinstance(content, list) else []


def load(log):
    raw = log.read_bytes()
    data = run(["zstd", "-dcf", str(log)]) if log.suffix == ".zst" else raw
    try:
        # _ln: the row's 1-based line in the log, so a footprint cites the transcript itself.
        rows = [dict(json.loads(line), _ln=n) for n, line in enumerate(data.splitlines(), 1) if line.strip()]
    except ValueError as exc:
        raise ValueError(f"unsupported CLI: {log} (invalid JSONL)") from exc
    if not all(isinstance(r, dict) for r in rows):
        raise ValueError(f"unsupported CLI: {log}")
    if any(r.get("type") == "session_meta" and isinstance(r.get("payload"), dict)
           and r["payload"].get("id") for r in rows) or any(
               r.get("type") == "response_item" and isinstance(r.get("payload"), dict)
               and r["payload"].get("type") in CALL_TYPES | {"message"} for r in rows):
        cli = "codex"
        sid = next((r["payload"]["id"] for r in rows
                    if r.get("type") == "session_meta" and r.get("payload", {}).get("id")), None)
        if not sid:
            match = re.search(r"([0-9a-f]{8}-[0-9a-f-]{27,})\.jsonl", log.name)
            sid = match[1] if match else log.stem
    elif any(r.get("type") in {"user", "assistant"}
             and isinstance(r.get("message"), dict) for r in rows):
        cli = "claude-code"
        sid = next((r["sessionId"] for r in rows if r.get("sessionId")), log.stem)
    else:
        raise ValueError(f"unsupported CLI: {log}")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", str(sid)):
        raise ValueError(f"invalid session ID: {log}")
    return data, rows, cli, str(sid)[:8], hashlib.sha256(raw).hexdigest()


def tool_calls(rows, cli):
    calls, results = [], {}
    for row in rows:
        timestamp = row.get("timestamp", "")
        if cli == "claude-code":
            for block in blocks(row):
                kind = block.get("type", "")
                if row.get("type") == "assistant" and kind in {"tool_use", "server_tool_use"}:
                    calls.append((timestamp, block.get("name", kind), block.get("id"),
                                  block.get("input", {}), row["_ln"]))
                if row.get("type") in {"user", "assistant"} and kind.endswith("tool_result"):
                    results.setdefault(block.get("tool_use_id"), []).append(block)
        elif row.get("type") == "response_item":
            p = row.get("payload", {})
            kind = p.get("type", "")
            if kind in CALL_TYPES:
                value = p.get("arguments", p.get("input", p.get("action", {})))
                calls.append((timestamp, p.get("name", kind), p.get("call_id", p.get("id")), value, row["_ln"]))
            elif kind in {t + "_output" for t in CALL_TYPES}:
                results.setdefault(p.get("call_id"), []).append(p)
    return calls, results


def is_error(value):
    if isinstance(value, dict):
        return (bool(value.get("is_error")) or bool(value.get("error"))
                or value.get("status") in {"error", "failed"}
                or value.get("exit_code", 0) not in (None, 0)
                or str(value.get("type", "")).endswith("_error")
                or any(is_error(v) for v in value.values()))
    if isinstance(value, list):
        return any(is_error(v) for v in value)
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
        except ValueError:
            decoded = None
        return ((decoded is not None and not isinstance(decoded, str) and is_error(decoded))
                or bool(re.search(r"(?im)(?:^|\n)(?:error\b|traceback\b|.*(?:exited with code|exit code|Process exited with code)\s*[:=]?\s*[1-9]\d*)", value)))
    return False


def call_text(call, results):
    timestamp, name, call_id, value = call[:4]
    encoded = serialized(value).encode("utf-8")
    text = encoded[:2000].decode("utf-8", errors="ignore")
    if len(encoded) > 2000:
        text += f"\n[… {len(encoded) - 2000} input bytes cut]"
    lines = [f"CALL {call_id} {timestamp} {name}", "INPUT", *text.splitlines(), "RESULT"]
    matched = results.get(call_id, []) if call_id is not None else []
    if not matched:
        lines.append("[no matching result recorded]")
    for result in matched:
        # Keep metadata as well as the body so exit status and error flags remain visible.
        body = dict(result)
        content = body.pop("content", body.pop("output", ""))
        output = (json.dumps(body, ensure_ascii=False) + "\n" + result_text(content)).splitlines()
        if name not in KEEP_WHOLE and not name.startswith("mcp__tmux-agent__") and not is_error(result) and len(output) > 40:
            output = output[:20] + [f"[… {len(output) - 40} lines cut]"] + output[-20:]
        lines.extend(output)
    return lines + [""]


MUTATING = {"Edit", "Write", "MultiEdit", "NotebookEdit", "apply_patch", "Artifact"}
DELEGATING = {"Agent", "Task", "Workflow", "mcp__tmux-agent__assign", "mcp__tmux-agent__tell"}
STATE_COMMAND = re.compile(r"\bgit\s+(?:-C\s+\S+\s+)?(?:commit|push|tag|rebase|reset|merge)\b|\bgh\s+(?:pr|release)\b"
                           r"|\bplugin\s+(?:install|update)\b|\bdeploy\b|\brm\s+-|\bmv\s")


def turn_start(row, cli):
    """The person's prompt (or a hook/plugin message in its place) opens a turn; a tool result does not."""
    if cli == "codex":
        p = row.get("payload", {})
        if row.get("type") == "response_item" and p.get("type") == "message" and p.get("role") == "user":
            return " ".join(c.get("text", "") for c in p.get("content", []) if isinstance(c, dict))
        return None
    if row.get("type") != "user" or row.get("isMeta"):
        return None
    content = row.get("message", {}).get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list) and not any(b.get("type") == "tool_result" for b in blocks(row)):
        return " ".join(b.get("text", "") for b in blocks(row) if b.get("type") == "text")
    return None


def said(row, cli):
    """The agent's own words in a row: what the turn stop ends on."""
    if cli == "codex":
        p = row.get("payload", {})
        if p.get("type") == "message" and p.get("role") == "assistant":
            return " ".join(c.get("text", "") for c in p.get("content", []) if isinstance(c, dict))
        return ""
    return " ".join(b.get("text", "") for b in blocks(row) if b.get("type") == "text") if row.get("type") == "assistant" else ""


def footprints(rows, cli, calls, results, where, log_sha):
    """One block per turn: the prompt, the agent's closing words (its account), and a pointer per
    call that changed state, delegated or failed (the evidence). Pointers only: content stays in
    the slices (S<NN>:<line>) and the log (L<line>), so a footprint is checked by opening them."""
    one = lambda t, n: re.sub(r"\s+", " ", t).strip()[:n]
    by_line = {c[4]: c for c in calls}
    turns, cur = [], None
    for row in rows:
        prompt = turn_start(row, cli)
        if prompt is not None and not prompt.lstrip().startswith("<local-command"):
            cur = dict(ln=row["_ln"], ts=row.get("timestamp", "")[:19], prompt=one(prompt, 160), last="", marks=[], first=None, end=None)
            turns.append(cur)
            continue
        if cur is None:
            continue
        text = said(row, cli)
        if text.strip():
            cur["last"] = text
        for call in [c for c in calls if c[4] == row["_ln"]] if row["_ln"] in by_line else []:
            _, name, call_id, value = call[:4]
            t, at = where[call_id]
            cur["first"] = cur["first"] or t
            cur["end"] = t
            args = object_args(value)
            cmd = str(args.get("command", args.get("cmd", "")))
            failed = any(is_error(r) for r in results.get(call_id, []))
            kind = ("fail" if failed else "edit" if name in MUTATING else "state" if STATE_COMMAND.search(cmd)
                    else "delegate" if name in DELEGATING else None)
            if kind:
                target = next((args[k] for k in TARGET_KEYS if k in args), value)
                cur["marks"].append(f"  T{t:04} {at} L{call[4]} {kind:8} {name} {one(serialized(target), 100)}")
    out = [f"LOG sha256={log_sha}  (L<n> = line n of the log; S<NN>:<n> = slice line; T<n> = tools.txt row)"]
    for i, t in enumerate(turns, 1):
        span = f"T{t['first']:04}-T{t['end']:04}" if t["first"] else "no calls"
        out += [f"TURN {i} {t['ts']} L{t['ln']} {span}", f"  asked: {t['prompt']}", f"  said:  {one(t['last'], 200) or '(no closing words)'}", *t["marks"]]
    return "\n".join(out + [f"TURNS {len(turns)}", ""])


def prepare(log, relative):
    data, rows, cli, sid, digest = load(log)
    user = run(["jq", "-rn", USER_FILTERS[cli]], data).decode("utf-8")
    count = int(user.splitlines()[-1].removeprefix("COUNT "))
    calls, results = tool_calls(rows, cli)
    tools, slices, lines = [], [], []
    where = {}  # call id → (T number, its CALL line in the slices)
    size = 0
    for call in calls:
        timestamp, name, call_id, value = call[:4]
        args = object_args(value)
        target = next((args[k] for k in TARGET_KEYS if k in args), value)
        tools.append(f"{timestamp}  {name}  " + re.sub(r"[\r\n\t]+", " ", serialized(target))[:120])
        chunk = call_text(call, results)
        n = len(slices) + 1
        # Prefix overhead counts toward the target; never split a call.
        chunk_size = sum(len(f"S{n:02}:{len(lines) + i}:".encode()) + len(line.encode()) + 1
                         for i, line in enumerate(chunk, 1))
        if lines and size + chunk_size > SLICE_BYTES:
            slices.append(lines)
            lines, size = [], 0
        where[call_id] = (len(tools), f"S{len(slices) + 1:02}:{len(lines) + 1}")
        lines.extend(chunk)
        size += chunk_size
    if lines:
        slices.append(lines)
    names = [f"slices/S{i:02}.txt" for i in range(1, len(slices) + 1)]
    width = max(1, math.ceil(len(names) / 10))
    groups = [{"range": f"{Path(names[i]).stem}-{Path(names[min(i + width, len(names)) - 1]).stem}",
               "slices": names[i:i + width]} for i in range(0, len(names), width)]
    manifest = dict(log=str(log), sha256=digest, cli=cli, count=count,
                    tools=len(calls), slices=names, scout_groups=groups)
    files = {"user.txt": user, "tools.txt": "\n".join(tools + [f"TOOLS {len(calls)}", ""]),
             "footprints.txt": footprints(rows, cli, calls, results, where, digest)}
    for i, (name, content) in enumerate(zip(names, slices), 1):
        files[name] = "".join(f"S{i:02}:{j}:{line}\n" for j, line in enumerate(content, 1))
    files["manifest.json"] = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    return relative or Path(sid), files, manifest


def build(logs, out, subagents=False):
    pending, seen = [], set()
    for log in logs:
        log = log.expanduser().resolve()
        if log in seen:
            continue
        _, _, cli, sid, _ = load(log)
        pending.append((log, Path(sid)))
        seen.add(log)
        if cli == "claude-code" and subagents:
            for sub in sorted(log.with_suffix("").glob("subagents/*.jsonl")):
                if sub in seen:
                    continue
                agent = sub.stem.removeprefix("agent-")
                pending.append((sub, Path(sid) / f"sub-{agent}"))
                seen.add(sub)
    # Preflight all logs and extraction before creating any output directories.
    packs = [prepare(log, relative) for log, relative in pending]
    destinations = [out / relative for relative, _, _ in packs]
    if len(set(destinations)) != len(destinations):
        raise ValueError("session prefix collision in output directories")
    for dest in destinations:
        if dest.exists():
            raise ValueError(f"output already exists: {dest}")
    for (relative, files, manifest), dest in zip(packs, destinations):
        dest.mkdir(parents=True)
        for name, content in files.items():
            path = dest / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        print(f"{relative.parts[0]} COUNT {manifest['count']} TOOLS {manifest['tools']} "
              f"slices {len(manifest['slices'])} groups {len(manifest['scout_groups'])} -> {dest}")
    return destinations


PAGE_BYTES = 16 * 1024  # Claude Code keeps a tool result whole only up to ~30 KB, then shows a 2 KB preview.


def pages_of(text):  # claim-evidence-gate.sh read_whole repeats this paging; change both
    """Split at line boundaries into pages of at most PAGE_BYTES; a longer line (a pasted message)
    is cut into 4,000-character pieces first, so no page outgrows the transcript's limit."""
    pages, page, size = [], [], 0
    for line in (piece for whole in text.splitlines() for piece in (whole[i:i + 4000] for i in range(0, max(len(whole), 1), 4000))):
        n = len(line.encode("utf-8")) + 1
        if page and size + n > PAGE_BYTES:
            pages.append(page)
            page, size = [], 0
        page.append(line)
        size += n
    return pages + [page] if page else pages or [[]]


def read_page(path, number):
    """Print one page of a pack file, then the stamp the claim gate checks: the page's lines come
    before it, so `| tail -1` leaves a stamp with no body, and the sha binds the file on disk."""
    path = path.expanduser().resolve()
    raw = path.read_bytes()
    pages = pages_of(raw.decode("utf-8"))
    if not 1 <= number <= len(pages):
        raise ValueError(f"{path}: page {number} is outside 1-{len(pages)}")
    first = sum(len(p) for p in pages[:number - 1]) + 1
    body = pages[number - 1]
    # body= binds the stamp to the lines printed above it: padding plus `| tail -1` does not match.
    text = "\n".join(body)
    return "\n".join(body + [f"READ {path} page {number}/{len(pages)} lines {first}-{first + len(body) - 1} "
                             f"body={hashlib.sha256(text.encode('utf-8')).hexdigest()} "
                             f"sha256={hashlib.sha256(raw).hexdigest()}"])


def self_test():
    with tempfile.TemporaryDirectory(prefix="resume-pack-test-") as tmp:
        root = Path(tmp)
        paged = root / "paged.txt"
        paged.write_text("".join(f"{i:05d} " + "y" * 100 + "\n" for i in range(400)), encoding="utf-8")
        one, last = read_page(paged, 1).splitlines(), read_page(paged, 3).splitlines()
        assert one[-1].startswith(f"READ {paged.resolve()} page 1/3 lines 1-") and " body=" in one[-1] and len("\n".join(one).encode()) < 30000
        assert last[-1].split(" lines ")[1].split("-")[1].startswith("400 ")
        assert sum(len(read_page(paged, n).splitlines()) - 1 for n in (1, 2, 3)) == 400
        paged.write_text("短" * 20000 + "\nend\n", encoding="utf-8")  # one 60 KB pasted line
        assert all(len(read_page(paged, n).encode()) < 30000 for n in range(1, 6)) and "page 5/5" in read_page(paged, 5)

        def fixture(path, rows):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
            return path

        def claude(kind, content, **extra):
            return dict(type=kind, sessionId="cccccccc-session", timestamp="2026-11-06T00:00:00Z",
                        message={"content": content}, **extra)

        long = "\n".join(f"line-{i}" for i in range(60))
        main = fixture(root / "cccccccc-session.jsonl", [
            claude("user", "hello"), claude("user", "hidden", isMeta=True),
            claude("assistant", [{"type": "tool_use", "id": "a", "name": "Read", "input": {"path": "file"}},
                                  {"type": "server_tool_use", "id": "b", "name": "Agent", "input": {"prompt": "é" * 1200}}]),
            claude("user", [{"type": "tool_result", "tool_use_id": "b", "content": long},
                             {"type": "tool_result", "tool_use_id": "a", "content": long}])])
        fixture(main.with_suffix("") / "subagents/agent-test.jsonl", [claude("user", "subagent")])
        rows = [{"type": "session_meta", "payload": {"id": "dddddddd-session"}},
                {"type": "response_item", "timestamp": "2026-11-06", "payload": {
                    "type": "message", "role": "user", "content": [{"type": "input_text", "text": "hello"}]}}]
        for i, kind in enumerate(sorted(CALL_TYPES)):
            rows.append({"type": "response_item", "payload": {"type": kind, "call_id": str(i),
                         "name": "exec", "arguments": '[1,2]' if i == 0 else 'null'}})
        for i, kind in reversed(list(enumerate(sorted(CALL_TYPES)))):
            rows.append({"type": "response_item", "payload": {"type": kind + "_output", "call_id": str(i),
                         "output": "Error: failure\n" + long}})
        plain = fixture(root / "codex.jsonl", rows)
        zipped = root / "codex.jsonl.zst"
        zipped.write_bytes(run(["zstd", "-q", "-c", str(plain)]))
        assert len(build([main], root / "mainonly")) == 1  # subagents are opt-in
        dirs = build([main, plain], root / "pack", subagents=True)
        compressed = build([zipped], root / "compressed")[0]
        assert len(dirs) == 3
        assert (dirs[0] / "user.txt").read_text().endswith("COUNT 1\n")
        foot = (dirs[0] / "footprints.txt").read_text()
        assert "TURN 1 " in foot and "T0001-T0002" in foot and "asked: hello" in foot and foot.endswith("TURNS 1\n")
        assert " L3 delegate Agent " in foot and "S01:1 " not in foot  # Agent is call 2: its CALL line is past S01:1
        assert " fail " in (dirs[2] / "footprints.txt").read_text()
        assert (dirs[1] / "user.txt").read_text().endswith("COUNT 1\n")
        content = (dirs[0] / "slices/S01.txt").read_text()
        assert content.count(":CALL ") == 2 and "[… 21 lines cut]" in content
        assert "414 input bytes cut" in content and content.count("line-30") == 1
        assert result_text([{"type": "text", "text": long}]).count("\n") == 60
        for name in KEEP_WHOLE | {"mcp__tmux-agent__wait"}:
            assert "line-30" in "\n".join(call_text(("", name, "a", {}), {
                "a": [{"content": long}]}))
        for result in [{"is_error": True, "content": long},
                       {"output": json.dumps({"exit_code": 1, "text": long})},
                       {"output": "Process exited with code 2\n" + long}]:
            assert is_error(result)
            assert "lines cut" not in "\n".join(call_text(("", "Read", "a", {}), {"a": [result]}))
        assert "no matching result recorded" in "\n".join(call_text(("", "Read", "missing", {}), {}))
        for directory in [dirs[2], compressed]:
            manifest = json.loads((directory / "manifest.json").read_text())
            assert manifest['tools'] == 3 and manifest['count'] == 1
            text = (directory / "slices/S01.txt").read_text()
            assert text.count(":CALL ") == 3 and text.count("line-30") == 3
        for directory in dirs:
            manifest = json.loads((directory / "manifest.json").read_text())
            assert [s for g in manifest['scout_groups'] for s in g['slices']] == manifest['slices']
            for name in manifest['slices']:
                for n, line in enumerate((directory / name).read_text().splitlines(), 1):
                    assert line.startswith(f"{Path(name).stem}:{n}:")
        assert (dirs[2] / "user.txt").read_bytes() == (compressed / "user.txt").read_bytes()
        # Large preserved results force >10 slices; groups must still cover every call once.
        large_rows = [claude("assistant", [{"type": "tool_use", "id": str(i), "name": "Task", "input": {}}])
                      for i in range(12)]
        large_rows += [claude("user", [{"type": "tool_result", "tool_use_id": str(i), "content": "x" * SLICE_BYTES}])
                       for i in range(12)]
        large = fixture(root / "large.jsonl", large_rows)
        _, files, manifest = prepare(large, Path("large"))
        assert len(manifest['slices']) == 12 and len(manifest['scout_groups']) <= 10
        assert sum(files[s].count(":CALL ") for s in manifest['slices']) == 12
        unknown = fixture(root / "unknown.jsonl", [{"role": "user", "content": "other CLI"}])
        for inputs in [[plain, unknown], [main, unknown]]:
            try:
                build(inputs, root / "unsupported")
            except ValueError as exc:
                assert str(exc).startswith("unsupported CLI:")
            else:
                raise AssertionError("unsupported log accepted")
            assert not (root / "unsupported").exists()
    print("self-test ok")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--subagents", action="store_true",
                        help="also pack each Claude subagent log; off by default, as the main log holds each agent's report")
    parser.add_argument("--read", type=Path, help="print one page of a pack file with its READ stamp")
    parser.add_argument("--page", type=int, default=1)
    parser.add_argument("logs", nargs="*", type=Path)
    args = parser.parse_args()
    if args.read:
        try:
            print(read_page(args.read, args.page))
        except (OSError, ValueError, UnicodeDecodeError) as exc:
            print(str(exc), file=sys.stderr)
            return 1
        return 0
    if args.self_test and (args.out or args.logs):
        parser.error("--self-test cannot be combined with --out or LOG")
    if not args.self_test and (not args.out or not args.logs):
        parser.error("expected --out DIR LOG [LOG...]")
    try:
        # jq filters every log. zstd is only for a .zst log (load) and --self-test's compressed fixture.
        if not shutil.which("jq"):
            raise ValueError("missing binary: jq")
        needs_zstd = args.self_test or any(
            log.expanduser().resolve().suffix == ".zst" for log in args.logs)
        if needs_zstd and not shutil.which("zstd"):
            raise ValueError("missing binary: zstd")
        if args.self_test:
            self_test()
        else:
            build(args.logs, args.out.expanduser().resolve(), args.subagents)
    except (OSError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
