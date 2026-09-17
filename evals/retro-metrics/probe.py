#!/usr/bin/env python3
"""每週 retro 機器層探針（retro-agenda §8）。唯讀；每個值帶 method。用法：python3 probe.py [days]
可經 ssh stdin 送到遠端：ssh host 'python3 - 7' < probe.py"""
import json, os, sys, glob, time, hashlib, subprocess, socket, re
days = int(sys.argv[1]) if len(sys.argv) > 1 else 7
cut = time.time() - days * 86400
H = os.path.expanduser
def sh(cmd):
    try: return subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=20).stdout.strip()
    except Exception as e: return f"ERR {type(e).__name__}"
def digest(p, algo="md5"):
    try: return getattr(hashlib, algo)(open(H(p), "rb").read()).hexdigest()[:8]
    except Exception: return None
def grep1(p, pat):
    try:
        for l in open(H(p), errors="replace"):
            m = re.search(pat, l)
            if m: return m.group(1)
    except Exception: return None
def jsonl_window(p, tskey="timestamp"):
    n = tot = 0
    try:
        for l in open(H(p)):
            tot += 1
            try: d = json.loads(l)
            except Exception: continue
            ts = str(d.get(tskey, ""))
            if ts[:10] >= time.strftime("%Y-%m-%d", time.gmtime(cut)): n += 1
    except FileNotFoundError: return None
    return {"window": n, "total": tot}
def last_jsonl(p):
    try:
        lines = [l for l in open(H(p)) if l.strip()]
        return json.loads(lines[-1]) if lines else None
    except FileNotFoundError: return None
    except Exception as e: return {"ERR": str(e)[:60]}
def pending(d):
    fs = glob.glob(H(d) + "/*")
    if not fs: return {"count": 0, "oldest_days": None} if os.path.isdir(H(d)) else "store absent"
    old = min(os.path.getmtime(f) for f in fs)
    return {"count": len(fs), "oldest_days": round((time.time() - old) / 86400)}
out = {"host": socket.gethostname(), "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "days": days,
 "kernel": {"version": grep1("~/.claude/CLAUDE.md", r"^Version:\s*(\S+)"), "md5_claude": digest("~/.claude/CLAUDE.md"),
            "md5_codex": digest("~/.codex/AGENTS.md"), "identical": digest("~/.claude/CLAUDE.md") == digest("~/.codex/AGENTS.md"),
            "grok_version": grep1("~/.grok/AGENTS.md", r"^Version:\s*(\S+)"), "method": "grep ^Version + md5 of ~/.claude/CLAUDE.md, ~/.codex/AGENTS.md"},
 "cli_versions": {"claude": sh("claude --version 2>/dev/null | head -1"), "codex": sh("codex --version 2>/dev/null | head -1"),
                  "agy": sh("agy --version 2>/dev/null | head -1"), "cursor_agent": sh("cursor-agent --version 2>/dev/null | head -1"), "node": sh("node --version"),
                  "method": "<cli> --version | head -1"},
 "skill_lock": {"sha256": (hashlib.sha256(open(H("~/.agents/.skill-lock.json"), "rb").read()).hexdigest()[:8] if os.path.exists(H("~/.agents/.skill-lock.json")) else None),
                "keys": (len(json.load(open(H("~/.agents/.skill-lock.json"))).get("skills", {})) if os.path.exists(H("~/.agents/.skill-lock.json")) else None),
                "skills_dir_is_symlink": os.path.islink(H("~/.claude/skills")), "method": "sha256 ~/.agents/.skill-lock.json; len(.skills)"},
 "agent_tmux": {"version": sh("agent-tmux --version 2>/dev/null"), "sha": digest(sh("command -v agent-tmux") or "/nonexistent"), "method": "agent-tmux --version; md5 of resolved binary"},
 "deploy_log_last": last_jsonl("~/.local/state/agent-scripts/deploy-log.jsonl"),
 "agent_scripts_clone": (sh("git -C ~/git/agent-scripts log -1 --format=%h 2>/dev/null") or None),
 "collector": {"cmli_bin": sh("command -v context-mode-local-insight"), "schema": (grep1("~/git/context-mode-local-insight/bin/agent-sessions.mjs", r'AGENT_SESSIONS_SCHEMA = "([^"]+)"') if os.path.isdir(H("~/git/context-mode-local-insight")) else None),
               "head": sh("git -C ~/git/context-mode-local-insight log -1 --format=%h 2>/dev/null") or None, "method": "grep AGENT_SESSIONS_SCHEMA in clone; git log -1"},
 "shared_memory_pending": pending("~/.agents/shared-memory-inbox/pending"),
 "hook_stats_7d": {k: jsonl_window(f"~/.local/share/agent-hooks/{k}.jsonl") for k in ("claim-evidence-stats", "bol-prompt-stats", "deny-replay-stats", "skill-router-stats")},
 "claim_evidence_blocked_7d": (lambda p: (sum(1 for l in open(H(p)) if '"blocked":true' in l and l[14:24] >= time.strftime("%Y-%m-%d", time.gmtime(cut))) if os.path.exists(H(p)) else None))("~/.local/share/agent-hooks/claim-evidence-stats.jsonl"),
 "context_mode_sessions_7d": {"db_files": len([f for f in glob.glob(H("~/.claude/context-mode/sessions/**/*.db"), recursive=True) if os.path.getmtime(f) >= cut]),
                              "kept_out_pct": "本週未量測（需 cmli analytics-core，遠端無 MCP sdk）", "method": "count *.db mtime in window"},
 "lessons": {"path": "~/.agents/rules/lessons.md", "sha256": (hashlib.sha256(open(H("~/.agents/rules/lessons.md"), "rb").read()).hexdigest()[:8] if os.path.exists(H("~/.agents/rules/lessons.md")) else None),
             "entries": len(re.findall(r"^## \d{4}-\d{2}-\d{2}", open(H("~/.agents/rules/lessons.md")).read(), re.M)) if os.path.exists(H("~/.agents/rules/lessons.md")) else None},
}
print(json.dumps(out, ensure_ascii=False, indent=1))
