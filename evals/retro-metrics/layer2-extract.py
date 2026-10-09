#!/usr/bin/env python3
"""Layer 2 素材抽取：top-level Claude transcript 中行內 timestamp 落在 [since, until) 的列，抽 (a) 使用者糾正句 + 其前一則 assistant 文字，
(b) assistant done-claim 且前 6 行無證據 token 的句子。窗口前的列仍作為前文（證據、前一則 assistant）。輸出 JSON 行。正則沿用 cmli agent-sessions v4。
用法：python3 layer2-extract.py [--since ISO] [--until ISO] [--self-test]（無時區＝UTC；預設最近 7 天）"""
import argparse, json, os, glob, re, socket
from datetime import datetime, timedelta, timezone
CORR = re.compile(r"不對|不是這樣|我說的是|你改壞|別再|又錯|重來|不要這樣")
DONE = re.compile(r"\b(done|fixed|verified|complete[d]?|all tests pass(?:ing|ed)?|PASS)\b", re.I)
EVID = re.compile(r"(exit\s*(?:code|=)|\$\?|\bexit\s+0\b|\d+\s+(?:tests?|pass(?:ing|ed))|# tests \d|\bpass \d+\b|\d+\/\d+ pass(?:ed|es)?|\d+ passes|PASS \[|DEPLOY OK|READBACK:|VERDICT: (?:PASS|BLOCK))", re.I)

def window(since, until):
    """ISO date/datetime → ('YYYY-MM-DDTHH:MM:SS' UTC, same) ; date-only --until includes that day."""
    def p(s, end=False):
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if end and len(s) == 10: d += timedelta(days=1)
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    u = p(until, True) if until else datetime.now(timezone.utc)
    s = p(since) if since else u - timedelta(days=7)
    f = lambda d: d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    return f(s), f(u)

def texts(m):
    c = m.get("content")
    if isinstance(c, str): return [c]
    return [b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text"] if isinstance(c, list) else []

def extract(lines, S, U, proj, sid, host=""):
    """One transcript → items whose own row timestamp is in [S, U)."""
    # shortcut: compares ts[:19] as text, so rows must carry UTC 'Z' stamps (Claude does); parse if another offset appears.
    rows = []; items = []
    for l in lines:
        try: r = json.loads(l)
        except Exception: continue
        if r.get("type") in ("user", "assistant"): rows.append((r.get("type"), r.get("timestamp") or "", " ".join(texts(r.get("message") or {})), l))
    last_asst = ""; n_done = 0
    for i, (ty, ts, tx, raw) in enumerate(rows):
        inw = S <= ts[:19] < U
        if ty == "assistant":
            if inw and DONE.search(tx) and n_done < 3:
                ctx = "".join(x[3] for x in rows[max(0, i - 6):i])
                if not EVID.search(raw) and not EVID.search(ctx):
                    n_done += 1
                    m = DONE.search(tx); s = max(0, m.start() - 160)
                    items.append({"host": host, "proj": proj, "sid": sid, "ts": ts[:16], "kind": "done_no_evidence", "snippet": tx[s:m.end() + 120].replace("\n", " ")})
            if tx.strip(): last_asst = tx
        elif inw and ty == "user" and tx and CORR.search(tx) and "tool_result" not in raw[:200]:
            items.append({"host": host, "proj": proj, "sid": sid, "ts": ts[:16], "kind": "correction", "user": tx[:300].replace("\n", " "), "prev_assistant": last_asst[-300:].replace("\n", " ")})
    return items

def self_test():
    S, U = window("2026-10-01T12:00:00Z", "2026-10-08T09:30:00Z")
    row = lambda ty, ts, tx: json.dumps({"type": ty, "timestamp": ts, "message": {"content": tx}}, ensure_ascii=False)
    lines = [row("assistant", "2026-09-30T00:00:00.000Z", "context before window"),
             row("user", "2026-10-01T11:59:59.000Z", "不對，重來"),            # before window: out
             row("user", "2026-10-01T12:00:00.000Z", "不對，我說的是 A"),      # at since: in, prev assistant from before window
             row("assistant", "2026-10-02T00:00:00.000Z", "all done"),       # in, no evidence
             row("user", "2026-10-08T09:30:00.000Z", "又錯")]                 # at until: out
    it = extract(lines, S, U, "p", "s")
    assert [(x["kind"], x["ts"]) for x in it] == [("correction", "2026-10-01T12:00"), ("done_no_evidence", "2026-10-02T00:00")], it
    assert it[0]["prev_assistant"] == "context before window", it
    print("self-test ok")

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--since"); ap.add_argument("--until"); ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    if a.self_test: self_test(); raise SystemExit
    S, U = window(a.since, a.until)
    cut = datetime.fromisoformat(S + "+00:00").timestamp()
    items = []
    for f in glob.glob(os.path.expanduser("~/.claude/projects/*/*.jsonl")):
        # mtime is an upper bound on a file's row timestamps, so mtime < since cannot hold in-window rows; mtime > until still is read.
        if os.path.getmtime(f) < cut: continue
        with open(f, errors="replace") as fh: items += extract(fh, S, U, f.split("/")[-2], os.path.basename(f)[:8], socket.gethostname())
    print(json.dumps(items, ensure_ascii=False))
