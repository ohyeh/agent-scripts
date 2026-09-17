#!/usr/bin/env python3
"""三口徑 token 加總（7d mtime，~/.claude/projects 全部 *.jsonl 含 subagents/ 與 subagents/workflows/）：
naive = 每筆 message.usage 直接相加；
reqkey = analyzer 口徑（key = requestId || msg.id(msg_0…) || uuid，取 output_tokens 最大者）；
midkey = 依 message.id 去重，取 output_tokens 最大者。"""
import json, os, sys, time, glob, socket
days = int(sys.argv[1]) if len(sys.argv) > 1 else 7
cut = time.time() - days * 86400
P = os.path.expanduser("~/.claude/projects")
files = [f for f in glob.glob(P + "/**/*.jsonl", recursive=True) if os.path.getmtime(f) >= cut and "scratchpad-probe" not in f]
F = ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens")
def z(): return dict.fromkeys(F, 0)
naive = z(); req = {}; mid = {}; rows = 0; partial = 0; noreq = 0
for f in files:
    with open(f, errors="replace") as fh:
        for l in fh:
            if '"usage"' not in l: continue
            try: r = json.loads(l)
            except Exception: continue
            m = r.get("message") or {}; u = m.get("usage")
            if not isinstance(u, dict): continue
            rows += 1
            if not u.get("cache_read_input_tokens") and not u.get("output_tokens"): partial += 1
            for k in F: naive[k] += u.get(k, 0) or 0
            rid = r.get("requestId"); i = m.get("id")
            if not rid: noreq += 1
            k1 = rid or (i if (i and str(i).startswith("msg_0") and len(str(i)) > 10) else None) or f + ":" + str(r.get("uuid"))
            for d, k in ((req, k1), (mid, i or k1)):
                p = d.get(k)
                if not p or (u.get("output_tokens", 0) or 0) >= (p.get("output_tokens", 0) or 0): d[k] = u
def tot(d):
    o = z()
    for u in d.values():
        for k in F: o[k] += u.get(k, 0) or 0
    return o
out = {"host": socket.gethostname(), "files": len(files), "usage_rows": rows, "rows_without_requestId": noreq,
       "partial_rows(no cache_read,no output)": partial,
       "naive": naive, "reqkey": {"n": len(req), **tot(req)}, "midkey": {"n": len(mid), **tot(mid)}}
print(json.dumps(out, indent=1))
