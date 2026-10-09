#!/usr/bin/env python3
"""每週 retro：Codex rollout token 加總（行內 timestamp 切窗口 [since, until)；
讀 ~/.codex/sessions/**/*.jsonl 與 ~/.codex/archived_sessions/*.jsonl[.zst]，.zst 用 zstd CLI 解）。
token_count.info.total_token_usage 是 session 累計值 → 每檔窗口 delta = 窗口內最後一筆 − 窗口前最後一筆（無則 0）。
turns = 窗口內使用者訊息數（response_item role=user，排除 AGENTS.md/environment_context 注入）。無定價表 → 只印 token（UNPRICED）。
用法：python3 codex-tokens.py [--since ISO] [--until ISO] [--self-test]（無時區＝UTC；預設最近 7 天）"""
import argparse, json, os, glob, shutil, socket, subprocess, sys
from datetime import datetime, timedelta, timezone
F = ("input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens")

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
    """One rollout → (delta dict or None, in-window turns, model). delta = last in-window cumulative − last before-window cumulative."""
    # shortcut: compares ts[:19] as text, so rows must carry UTC 'Z' stamps (Codex does); parse if another offset appears.
    before = None; last = None; turns = 0; model = None
    for l in lines:
        if '"token_count"' in l:
            try: r = json.loads(l); t = r["payload"]["info"]["total_token_usage"]
            except Exception: continue
            ts = (r.get("timestamp") or "")[:19]
            if ts < S: before = t
            elif ts < U: last = t
        elif '"role":"user"' in l and '# AGENTS.md' not in l and 'environment_context' not in l:
            try: ts = (json.loads(l).get("timestamp") or "")[:19]
            except Exception: continue
            if S <= ts < U: turns += 1
        elif model is None and '"model"' in l:
            try: model = json.loads(l)["payload"].get("model")
            except Exception: pass
    if not last: return None, turns, model
    return {k: (last.get(k, 0) or 0) - ((before or {}).get(k, 0) or 0) for k in F}, turns, model

def lines_of(f):
    if not f.endswith(".zst"): return open(f, errors="replace").read().splitlines()
    p = subprocess.run(["zstd", "-dcq", f], capture_output=True, text=True, errors="replace")
    if p.returncode: raise RuntimeError(f"zstd exit {p.returncode} on {os.path.basename(f)}: {p.stderr.strip()[:200]}")
    return p.stdout.splitlines()

def self_test():
    S, U = window("2026-10-01T12:00:00Z", "2026-10-08T09:30:00Z")
    tc = lambda ts, n: json.dumps({"timestamp": ts, "type": "event_msg", "payload": {"type": "token_count", "info": {"total_token_usage": {"input_tokens": n, "total_tokens": n}}}})
    us = lambda ts: json.dumps({"timestamp": ts, "type": "response_item", "payload": {"role": "user"}}, separators=(",", ":"))
    lines = [tc("2026-09-30T00:00:00.000Z", 100), us("2026-09-30T00:00:01.000Z"),   # before window: baseline
             tc("2026-10-01T12:00:00.000Z", 150), us("2026-10-02T00:00:00.000Z"),   # at since: in
             tc("2026-10-05T00:00:00.000Z", 400),                                      # last in window
             tc("2026-10-08T09:30:00.000Z", 900), us("2026-10-08T09:30:00.000Z")]   # at until: out
    d, turns, _ = session(lines, S, U)
    assert d["input_tokens"] == 300 and d["total_tokens"] == 300 and turns == 1, (d, turns)
    assert session(lines[:2], S, U)[0] is None   # nothing in window → not a session
    print("self-test ok")

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--since"); ap.add_argument("--until"); ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    if a.self_test: self_test(); raise SystemExit
    S, U = window(a.since, a.until)
    cut = datetime.fromisoformat(S + "+00:00").timestamp()
    C = os.path.expanduser("~/.codex")
    srcs = {"live": glob.glob(C + "/sessions/**/*.jsonl", recursive=True),
            "archived": glob.glob(C + "/archived_sessions/*.jsonl") + glob.glob(C + "/archived_sessions/*.jsonl.zst")}
    if any(f.endswith(".zst") for f in srcs["archived"]) and not shutil.which("zstd"):
        sys.exit("zstd CLI not found: cannot read archived .jsonl.zst rollouts")
    out = {"host": socket.gethostname(), "since": S + "Z", "until": U + "Z"}
    allt = dict.fromkeys(F, 0); alls = allturns = allfiles = 0; models = {}
    for name, fs in srcs.items():
        # mtime is an upper bound on a file's row timestamps, so mtime < since cannot hold in-window rows; mtime > until still is read.
        fs = [f for f in fs if os.path.getmtime(f) >= cut]
        tot = dict.fromkeys(F, 0); n = turns = 0
        for f in fs:
            d, t, model = session(lines_of(f), S, U)
            turns += t
            if d:
                n += 1; models[model or "?"] = models.get(model or "?", 0) + 1
                for k in F: tot[k] += d[k]
        out[name] = {"files_scanned": len(fs), "sessions": n, "turns": turns, **tot}
        allfiles += len(fs); alls += n; allturns += turns
        for k in F: allt[k] += tot[k]
    print(json.dumps({**out, "files_scanned": allfiles, "sessions": alls, "turns": allturns, **allt, "models": models}, indent=1))
