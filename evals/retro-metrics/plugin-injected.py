#!/usr/bin/env python3
"""每週 retro：數 plugin 注入的 transcript row，從 collector 輪數扣除。
用法：python3 plugin-injected.py <start ISO> <end ISO>（UTC，例：2026-09-24T12:00:00 2026-10-01T12:00:00）
      python3 plugin-injected.py --self-test
判定：row 的 `origin.kind == "plugin"`，按 `origin.name` 分組（W41 mods-review §2.3 同法）。
worker brief（mod 送進 worker / subagent 的文字）沒有 plugin origin，所以不算。
以行內 timestamp 切窗口；row `uuid` 去重；掃 ~/.claude/projects/**/*.jsonl 與 projects_archived/**/*.jsonl.gz。"""
import gzip, json, sys
from collections import Counter
from pathlib import Path


def rows():
    root = Path.home() / ".claude"
    files = [*(root / "projects").rglob("*.jsonl"), *(root / "projects_archived").rglob("*.jsonl.gz")]
    for f in files:
        with (gzip.open if f.suffix == ".gz" else open)(f, "rt", errors="replace") as fh:
            for line in fh:
                if '"plugin"' not in line: continue
                try: yield json.loads(line)
                except ValueError: continue


def count(rows, a, b):
    by_name, seen = Counter(), set()
    for d in rows:
        o = d.get("origin")
        if not isinstance(o, dict) or o.get("kind") != "plugin": continue
        if not (a <= d.get("timestamp", "")[:19] < b): continue
        if d.get("uuid") in seen: continue
        seen.add(d.get("uuid"))
        by_name[o.get("name")] += 1
    return {"by_name": dict(by_name), "plugin_total": sum(by_name.values())}


def self_test():
    P = "The tmux-agent plugin sent a message"
    tagged = {"origin": {"kind": "plugin", "name": "tmux-agent"}}
    rs = [
        {**tagged, "uuid": "1", "timestamp": "2026-09-25T00:00:00Z", "message": {"content": "/reload-plugins"}},
        {**tagged, "uuid": "1", "timestamp": "2026-09-25T00:00:00Z"},  # same row in a resumed session copy
        {"uuid": "2", "timestamp": "2026-09-25T00:00:00Z", "message": {"content": P + " (no origin)"}},
        {"uuid": "3", "timestamp": "2026-09-25T00:00:00Z", "isSidechain": True, "message": {"content": "GOAL: ...\nACCEPTANCE: ..."}},
        {"uuid": "4", "timestamp": "2026-09-25T00:00:00Z", "origin": {"kind": "human"}, "message": {"content": "GOAL: brief typed into a worker"}},
        {**tagged, "uuid": "5", "timestamp": "2026-10-01T12:00:00Z"},  # end bound is exclusive
        {"uuid": "6", "timestamp": "2026-09-25T00:00:00Z", "origin": {"kind": "plugin", "name": "grok-bot-watch"}},
    ]
    r = count(rs, "2026-09-24T12:00:00", "2026-10-01T12:00:00")
    assert r["by_name"].get("tmux-agent") == 1, r
    assert r == {"by_name": {"tmux-agent": 1, "grok-bot-watch": 1}, "plugin_total": 2}, r
    print("self-test ok")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]: self_test()
    else: print(json.dumps(count(rows(), sys.argv[1], sys.argv[2])))
