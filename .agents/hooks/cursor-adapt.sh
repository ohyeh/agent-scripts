#!/usr/bin/env bash
# Cursor → Claude payload adapter for fleet hooks in ~/.agents/hooks/.
#
# Cursor native stdin (Shell / conversation_id / subagentStart.task) is not
# what the fleet scripts parse (Bash / session_id / tool_input.prompt). This
# wrapper remaps, execs the named hook, and always emits valid JSON — Cursor
# treats empty stdout as an invalid hook response.
#
# SKIPPED on Cursor (not a bug — missing fields or Claude-only):
#   claude-version-sentinel  — Claude CLI version tripwire
#   session-title-sentinel   — Stop output is Claude {decision:block}; Cursor
#                              stop wants followup_message, and greps Claude jsonl
#   tmux-assign-host-gate    — keyed on agent_type, which Cursor preToolUse
#                              Shell does not send (would deny Task-hosted assign)
set -u

HOOKS_DIR="${CURSOR_ADAPT_HOOKS_DIR:-$HOME/.agents/hooks}"
NAME="${1:-}"
NAME="${NAME#fleet-}"
NAME="${NAME%.sh}"
if [ -z "$NAME" ]; then
  printf '%s\n' '{"agent_message":"cursor-adapt: missing hook name"}'
  exit 1
fi
HOOK="${HOOKS_DIR}/${NAME}.sh"
IN="$(cat)"

emit_ok() {
  printf '%s\n' '{"agent_message":""}'
}

if ! command -v python3 >/dev/null 2>&1; then
  printf '%s\n' '{"agent_message":"cursor-adapt: python3 missing"}'
  exit 1
fi
if [ ! -x "$HOOK" ]; then
  printf '%s\n' "{\"agent_message\":\"cursor-adapt: missing $NAME.sh\"}"
  exit 1
fi

# Heredoc owns python stdin, so the Cursor payload cannot be piped. File argv.
in_file="$(mktemp)"
printf '%s' "$IN" > "$in_file"
mapped="$(python3 - "$in_file" <<'PY'
import hashlib, json, sys

raw = open(sys.argv[1]).read()
try:
    src = json.loads(raw) if raw.strip() else {}
except json.JSONDecodeError:
    src = {}
if not isinstance(src, dict):
    src = {}

EVENT_MAP = {
    "subagentStart": "SubagentStart",
    "subagentStop": "SubagentStop",
    "preToolUse": "PreToolUse",
    "postToolUse": "PostToolUse",
    "stop": "Stop",
    "sessionStart": "SessionStart",
}
TOOL_MAP = {"Shell": "Bash", "Task": "Agent"}
# Cursor subagent_type is lowercase; bol-prompt-gate exempts Explore|Plan.
TYPE_MAP = {"explore": "Explore", "plan": "Plan"}

def map_type(value):
    if not value:
        return "unknown"
    return TYPE_MAP.get(str(value).lower(), str(value))

ti = src.get("tool_input")
if not isinstance(ti, dict):
    ti = {}

event_in = str(src.get("hook_event_name") or "")
event_out = EVENT_MAP.get(event_in, event_in)
task = src.get("task") or ti.get("task") or ti.get("prompt") or ti.get("description") or ""
st_raw = src.get("subagent_type") or ti.get("subagent_type") or src.get("agent_type") or ""
st = map_type(st_raw)
sid = src.get("session_id") or src.get("conversation_id") or src.get("parent_conversation_id") or ""

# subagentStop docs omit subagent_id; derive a stable id from type+task so
# start and stop share a ledger marker.
derived = "cursor-" + hashlib.sha256(f"{st}\t{task}".encode()).hexdigest()[:16]
aid = src.get("agent_id") or src.get("subagent_id") or (derived if (st != "unknown" or task) else "")

tool_in = str(src.get("tool_name") or "")
if event_in == "subagentStart" or tool_in == "Task":
    tool_out = "Agent"
else:
    tool_out = TOOL_MAP.get(tool_in, tool_in)

prompt = ti.get("prompt") or ti.get("description") or task or ""
if event_in == "subagentStart" and not prompt:
    prompt = str(task)

# Parent Shell calls have no subagent_id → ABSENT (tmux-assign-host-gate).
if src.get("agent_type"):
    agent_type = str(src.get("agent_type"))
elif src.get("subagent_id") or event_in in ("subagentStart", "subagentStop"):
    agent_type = st
else:
    agent_type = "ABSENT"

# Ledger identity: prefer derived on subagent events so Stop can find Start.
if event_in in ("subagentStart", "subagentStop"):
    aid = derived

out = {
    "tool_name": tool_out,
    "tool_input": {
        **ti,
        "command": ti.get("command") or "",
        "prompt": prompt,
        "subagent_type": st,
        "run_in_background": bool(ti.get("run_in_background", False)),
    },
    "session_id": sid,
    "hook_event_name": event_out,
    "agent_id": aid,
    "agent_type": agent_type,
    "transcript_path": src.get("transcript_path") or "",
    "stop_hook_active": bool(src.get("stop_hook_active", False)),
}
json.dump(out, sys.stdout, separators=(",", ":"))
PY
)" || {
  rm -f "$in_file"
  printf '%s\n' '{"agent_message":"cursor-adapt: remap failed"}'
  exit 1
}
rm -f "$in_file"

stderr_file="$(mktemp)"
stdout_file="$(mktemp)"
trap 'rm -f "$stderr_file" "$stdout_file"' EXIT
set +e
printf '%s' "$mapped" | "$HOOK" >"$stdout_file" 2>"$stderr_file"
ec=$?
set -e

if [ "$ec" -eq 2 ]; then
  msg="$(cat "$stderr_file")"
  python3 -c 'import json,sys; m=sys.stdin.read(); print(json.dumps({"permission":"deny","agent_message":m,"user_message":m}))' <<<"$msg"
  exit 2
fi
if [ "$ec" -ne 0 ]; then
  msg="$(cat "$stderr_file")"
  python3 -c 'import json,sys; m=sys.stdin.read(); print(json.dumps({"agent_message":m or "cursor-adapt: hook failed"}))' <<<"$msg"
  exit "$ec"
fi
emit_ok
exit 0
