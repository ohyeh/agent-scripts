#!/usr/bin/env python3
"""每週 retro 定額訊號（retro-agenda §2–4）：Claude top-level session 逐場 turns 與 midkey 去重 token，
輸出 (a) turns==0 且 total>1M 的場、(b) total 前 10 名。turns = type=user 且非 tool_result、非續接摘要。
用法：python3 session-outliers.py [days]"""
import json, os, sys, glob, time, socket
days = int(sys.argv[1]) if len(sys.argv) > 1 else 7
cut = time.time() - days * 86400
F = ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens")
rows = []
for f in glob.glob(os.path.expanduser("~/.claude/projects/*/*.jsonl")):
    if os.path.getmtime(f) < cut: continue
    turns = 0; mid = {}; first_user = ""
    with open(f, errors="replace") as fh:
        for l in fh:
            if '"usage"' not in l and '"type":"user"' not in l: continue
            try: r = json.loads(l)
            except Exception: continue
            m = r.get("message") or {}
            if r.get("type") == "user":
                c = m.get("content")
                txt = c if isinstance(c, str) else " ".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text") if isinstance(c, list) else ""
                if txt and "tool_result" not in l[:200] and not txt.startswith("This session is being continued"):
                    turns += 1; first_user = first_user or txt[:80].replace("\n", " ")
            u = m.get("usage")
            if isinstance(u, dict):
                k = m.get("id") or r.get("requestId") or r.get("uuid")
                p = mid.get(k)
                if not p or (u.get("output_tokens", 0) or 0) >= (p.get("output_tokens", 0) or 0): mid[k] = u
    tot = sum((u.get(k, 0) or 0) for u in mid.values() for k in F)
    rows.append({"proj": f.split("/")[-2].replace("-Users-paul-yeh-git-", "").replace("-Users-paul-yeh-github-", ""), "sid": os.path.basename(f)[:8], "turns": turns, "total": tot, "first_user": first_user})
rows.sort(key=lambda r: -r["total"])
print(json.dumps({"host": socket.gethostname(), "sessions": len(rows),
 "turns0_over_1M": [r for r in rows if r["turns"] == 0 and r["total"] > 1_000_000],
 "top10": rows[:10]}, ensure_ascii=False, indent=1))
