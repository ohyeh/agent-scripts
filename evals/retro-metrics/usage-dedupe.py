#!/usr/bin/env python3
"""三口徑 token 加總（行內 timestamp 切窗口 [since, until)，~/.claude/projects 全部 *.jsonl 含 subagents/ 與 subagents/workflows/）：
naive = 每筆 message.usage 直接相加；
reqkey = analyzer 口徑（key = requestId || msg.id(msg_0…) || uuid，取 output_tokens 最大者）；
midkey = 依 message.id 去重，取 output_tokens 最大者。
用法：python3 usage-dedupe.py [--since ISO] [--until ISO] [--self-test]（無時區＝UTC；預設最近 7 天）"""
import argparse, json, os, glob, socket
from datetime import datetime, timedelta, timezone
F = ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens")
def z(): return dict.fromkeys(F, 0)

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

def collect(sources, S, U):
    """sources: iterable of (path, lines). Rows count only when S <= row timestamp < U."""
    # shortcut: compares ts[:19] as text, so rows must carry UTC 'Z' stamps (Claude does); parse if another offset appears.
    naive = z(); req = {}; mid = {}; rows = 0; partial = 0; noreq = 0
    for f, lines in sources:
        for l in lines:
            if '"usage"' not in l: continue
            try: r = json.loads(l)
            except Exception: continue
            m = r.get("message") or {}; u = m.get("usage")
            if not isinstance(u, dict): continue
            if not (S <= (r.get("timestamp") or "")[:19] < U): continue
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
    return {"usage_rows": rows, "rows_without_requestId": noreq, "partial_rows(no cache_read,no output)": partial,
            "naive": naive, "reqkey": {"n": len(req), **tot(req)}, "midkey": {"n": len(mid), **tot(mid)}}

def self_test():
    S, U = window("2026-10-01T12:00:00Z", "2026-10-08T09:30:00Z")
    assert (S, U) == ("2026-10-01T12:00:00", "2026-10-08T09:30:00")
    assert window("2026-10-01", "2026-10-07") == ("2026-10-01T00:00:00", "2026-10-08T00:00:00")
    row = lambda ts, rid, out: json.dumps({"timestamp": ts, "requestId": rid, "message": {"id": "msg_0" + rid * 3, "usage": {"input_tokens": 1, "output_tokens": out}}})
    lines = [row("2026-10-01T11:59:59.999Z", "a", 5),   # before window
             row("2026-10-01T12:00:00.000Z", "b", 1),   # at since: in
             row("2026-10-01T12:00:00.500Z", "b", 3),   # same request, larger output: in, replaces
             row("2026-10-08T09:30:00.000Z", "c", 7)]   # at until: out
    o = collect([("f", lines)], S, U)
    assert o["usage_rows"] == 2 and o["naive"]["output_tokens"] == 4, o
    assert o["reqkey"] == {"n": 1, "input_tokens": 1, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0, "output_tokens": 3}, o
    print("self-test ok")

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--since"); ap.add_argument("--until"); ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    if a.self_test: self_test(); raise SystemExit
    S, U = window(a.since, a.until)
    cut = datetime.fromisoformat(S + "+00:00").timestamp()
    P = os.path.expanduser("~/.claude/projects")
    # mtime is an upper bound on a file's row timestamps, so mtime < since cannot hold in-window rows; mtime > until still is read.
    files = [f for f in glob.glob(P + "/**/*.jsonl", recursive=True) if os.path.getmtime(f) >= cut and "scratchpad-probe" not in f]
    def src():
        for f in files:
            with open(f, errors="replace") as fh: yield f, fh
    print(json.dumps({"host": socket.gethostname(), "since": S + "Z", "until": U + "Z", "files": len(files), **collect(src(), S, U)}, indent=1))
