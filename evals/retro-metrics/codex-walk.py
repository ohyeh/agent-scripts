#!/usr/bin/env python3
"""Codex ctx walk rate: ctx_* calls / (ctx_* + exec_command) in a window, read from ~/.codex sessions.

Codex runs in code-mode: tool calls sit inside a `custom_tool_call name=exec` body as
`tools.<name>(...)`, so they are counted by call site, not by a top-level function_call.
  python3 codex-walk.py --since ISO --until ISO      # run on each host
  python3 codex-walk.py --self-test
"""
import argparse, glob, json, os, re, collections

T = re.compile(r"tools\.([A-Za-z0-9_]+)\s*\(")


def count(lines, lo, hi, c):
    for l in lines:
        if '"custom_tool_call"' not in l and '"function_call"' not in l:
            continue
        try:
            d = json.loads(l)
        except ValueError:
            c["bad_json"] += 1; continue
        if not (lo <= d.get("timestamp", "")[:19] < hi):
            continue
        p = d.get("payload", {})
        if p.get("type") == "custom_tool_call" and p.get("name") == "exec":
            for n in T.findall(p.get("input", "")):
                c["ctx" if "__ctx_" in n else n] += 1
        elif p.get("type") == "function_call" and p.get("name") in ("exec_command", "shell"):
            c["exec_command"] += 1
        elif p.get("type") == "function_call" and "ctx_" in (p.get("name") or ""):
            c["ctx"] += 1
    return c


def result(c, files):
    r = c["ctx"] / max(1, c["ctx"] + c["exec_command"])
    return {"files": files, "ctx": c["ctx"], "exec_command": c["exec_command"], "walk_pct": round(100 * r, 2), "bad_json": c["bad_json"]}


def self_test():
    ts = lambda t: f'"timestamp":"{t}"'
    lines = [
        '{%s,"payload":{"type":"custom_tool_call","name":"exec","input":"await tools.mcp__context_mode__ctx_execute({}); tools.exec_command({})"}}' % ts("2026-10-08T09:30:00Z"),
        '{%s,"payload":{"type":"function_call","name":"exec_command"}}' % ts("2026-10-15T12:30:00Z"),
        '{"type":"custom_tool_call" broken',
    ]
    r = result(count(lines, "2026-10-08T09:30:00", "2026-10-15T12:30:00", collections.Counter()), 1)
    assert (r["ctx"], r["exec_command"], r["walk_pct"], r["bad_json"]) == (1, 1, 50.0, 1), r
    print("self-test ok")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--since"); ap.add_argument("--until"); ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        self_test(); raise SystemExit
    if not (a.since and a.until):
        ap.error("--since and --until are required")
    lo, hi = (s.replace("Z", "")[:19] for s in (a.since, a.until))
    fs = glob.glob(os.path.expanduser("~/.codex/sessions/*/*/*/*.jsonl")) + glob.glob(os.path.expanduser("~/.codex/archived_sessions/*.jsonl"))
    c = collections.Counter()
    for f in fs:
        with open(f, errors="replace") as fh:
            count(fh, lo, hi, c)
    print(json.dumps(result(c, len(fs))))
