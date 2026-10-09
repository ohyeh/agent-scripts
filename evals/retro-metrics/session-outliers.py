#!/usr/bin/env python3
"""每週 retro 定額訊號（retro-agenda §2–4）：Claude top-level session 逐場 turns 與 midkey 去重 token（行內 timestamp 切窗口 [since, until)），
輸出 (a) turns==0 且 total>1M 的場、(b) total 前 10 名、(c) cache break 數。turns = type=user 且非 tool_result、非續接摘要。
cache break = 去重後單一 call 的 input+cache_creation > 100k（同 session-report analyzer）；session 第一個 call 沒有可破的 cache，不計。
用法：python3 session-outliers.py [--since ISO] [--until ISO] [--self-test]（無時區＝UTC；預設最近 7 天）"""
import argparse, json, os, re, glob, socket
from datetime import datetime, timedelta, timezone
F = ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens")
BREAK = 100_000

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

def session(lines, S, U):
    """One transcript → (turns, total, cache_breaks, first_user, any_in_window). Only rows with S <= timestamp < U count;
    the session's first call (first usage row in file order, even if before the window) is never a cache break."""
    # shortcut: compares ts[:19] as text, so rows must carry UTC 'Z' stamps (Claude does); parse if another offset appears.
    turns = 0; mid = {}; first_user = ""; first_call = None; seen = False
    for l in lines:
        if '"usage"' not in l and '"type":"user"' not in l: continue
        try: r = json.loads(l)
        except Exception: continue
        m = r.get("message") or {}
        u = m.get("usage")
        k = (m.get("id") or r.get("requestId") or r.get("uuid")) if isinstance(u, dict) else None
        if k and first_call is None: first_call = k
        if not (S <= (r.get("timestamp") or "")[:19] < U): continue
        seen = True
        if r.get("type") == "user":
            c = m.get("content")
            txt = c if isinstance(c, str) else " ".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text") if isinstance(c, list) else ""
            if txt and "tool_result" not in l[:200] and not txt.startswith("This session is being continued"):
                turns += 1; first_user = first_user or txt[:80].replace("\n", " ")
        if k:
            p = mid.get(k)
            if not p or (u.get("output_tokens", 0) or 0) >= (p.get("output_tokens", 0) or 0): mid[k] = u
    tot = sum((u.get(f, 0) or 0) for u in mid.values() for f in F)
    breaks = sum(1 for k, u in mid.items() if k != first_call and (u.get("input_tokens", 0) or 0) + (u.get("cache_creation_input_tokens", 0) or 0) > BREAK)
    return turns, tot, breaks, first_user, seen

def self_test():
    S, U = window("2026-10-01T12:00:00Z", "2026-10-08T09:30:00Z")
    call = lambda ts, i, cw: json.dumps({"timestamp": ts, "type": "assistant", "message": {"id": i, "usage": {"input_tokens": 1, "cache_creation_input_tokens": cw, "output_tokens": 1}}})
    user = lambda ts: json.dumps({"timestamp": ts, "type": "user", "message": {"content": "hi"}}, separators=(",", ":"))
    s1 = [user("2026-10-02T00:00:00.000Z"), call("2026-10-02T00:00:01.000Z", "m1", 200_000),   # first call: not a break
          call("2026-10-02T00:01:00.000Z", "m2", 50_000), call("2026-10-02T02:00:00.000Z", "m3", 150_000),   # m3 = break
          call("2026-10-08T09:30:00.000Z", "m4", 300_000)]   # at until: out of window
    turns, tot, breaks, _, seen = session(s1, S, U)
    assert (turns, breaks, seen) == (1, 1, True) and tot == 400_006,(turns, tot, breaks)
    # window starts mid-session: the first in-window call is still a break, the session's first call is before since
    s2 = [call("2026-09-30T00:00:00.000Z", "m1", 200_000), call("2026-10-01T12:00:00.000Z", "m2", 150_000)]
    assert session(s2, S, U)[2] == 1
    assert session(s2[:1], S, U)[4] is False   # no in-window row → session not listed
    print("self-test ok")

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--since"); ap.add_argument("--until"); ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    if a.self_test: self_test(); raise SystemExit
    S, U = window(a.since, a.until)
    cut = datetime.fromisoformat(S + "+00:00").timestamp()
    rows = []
    HOMEKEY = re.sub(r"[^A-Za-z0-9]", "-", os.path.expanduser("~"))  # project-key form of ~
    for f in glob.glob(os.path.expanduser("~/.claude/projects/*/*.jsonl")):
        # mtime is an upper bound on a file's row timestamps, so mtime < since cannot hold in-window rows; mtime > until still is read.
        if os.path.getmtime(f) < cut: continue
        with open(f, errors="replace") as fh: turns, tot, breaks, first_user, seen = session(fh, S, U)
        if not seen: continue
        rows.append({"proj": f.split("/")[-2].replace(HOMEKEY + "-git-", "").replace(HOMEKEY + "-github-", ""), "sid": os.path.basename(f)[:8], "turns": turns, "total": tot, "cache_breaks": breaks, "first_user": first_user})
    rows.sort(key=lambda r: -r["total"])
    print(json.dumps({"host": socket.gethostname(), "since": S + "Z", "until": U + "Z", "sessions": len(rows),
     "cache_breaks_over_100k": sum(r["cache_breaks"] for r in rows),
     "turns0_over_1M": [r for r in rows if r["turns"] == 0 and r["total"] > 1_000_000],
     "top10": rows[:10]}, ensure_ascii=False, indent=1))
