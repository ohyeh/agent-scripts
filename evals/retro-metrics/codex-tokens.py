#!/usr/bin/env python3
"""每週 retro：Codex rollout token 加總（7d mtime，~/.codex/sessions/**/*.jsonl）。
每個 rollout 檔的 token_count.info.total_token_usage 是該 session 累計值 → 取每檔最後一筆。
turns = 使用者訊息數（response_item role=user，排除 AGENTS.md/environment_context 注入）。無定價表 → 只印 token（UNPRICED）。"""
import json, os, sys, time, glob, socket
days = int(sys.argv[1]) if len(sys.argv) > 1 else 7
cut = time.time() - days * 86400
files = [f for f in glob.glob(os.path.expanduser("~/.codex/sessions/**/*.jsonl"), recursive=True) if os.path.getmtime(f) >= cut]
F = ("input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens")
tot = dict.fromkeys(F, 0); sessions = 0; turns = 0; models = {}
for f in files:
    last = None; model = None
    with open(f, errors="replace") as fh:
        for l in fh:
            if '"token_count"' in l:
                try: last = json.loads(l)["payload"]["info"]["total_token_usage"]
                except Exception: pass
            elif '"role":"user"' in l and '# AGENTS.md' not in l and 'environment_context' not in l: turns += 1
            elif model is None and '"model"' in l:
                try: model = json.loads(l)["payload"].get("model")
                except Exception: pass
    if last:
        sessions += 1
        for k in F: tot[k] += last.get(k, 0) or 0
        models[model or "?"] = models.get(model or "?", 0) + 1
print(json.dumps({"host": socket.gethostname(), "files_scanned": len(files), "sessions": sessions, "turns": turns, **tot, "models": models}, indent=1))
