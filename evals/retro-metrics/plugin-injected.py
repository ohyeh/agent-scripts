#!/usr/bin/env python3
"""每週 retro：數 tmux-agent plugin 注入的 user 訊息，從 collector 輪數扣除。
用法：python3 plugin-injected.py <start ISO> <end ISO>（UTC，例：2026-09-17T12:15:00 2026-09-24T12:15:00）
以行內 timestamp 切窗口；只掃 ~/.claude/projects/*/*.jsonl（top-level）。
injected = 內容以該句開頭（plugin 送的）；quoted = 使用者訊息中引用該句（算真人輪）。"""
import glob, json, os, sys
PHRASE = "The tmux-agent plugin sent a message"
def count(a, b):
    c = {"injected": 0, "quoted": 0}
    for f in glob.glob(os.path.expanduser("~/.claude/projects/*/*.jsonl")):
        for l in open(f, errors="replace"):
            if PHRASE not in l: continue
            try: d = json.loads(l)
            except ValueError: continue
            if d.get("type") != "user" or not (a <= d.get("timestamp", "")[:19] < b): continue
            m = d.get("message", {}).get("content")
            t = m if isinstance(m, str) else " ".join(x.get("text", "") for x in m if isinstance(x, dict)) if isinstance(m, list) else ""
            c["injected" if t.lstrip().startswith(PHRASE) else "quoted"] += 1
    return c
if __name__ == "__main__":
    print(json.dumps(count(sys.argv[1], sys.argv[2])))
