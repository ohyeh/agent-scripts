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
# claim-evidence-gate runs through its own branch below (beforeSubmitPrompt + stop).
# tmux-assign-host-gate IS registered: parent Shell has no subagent_id →
# agent_type ABSENT → deny. Task-hosted Shell with subagent_id passes.
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

# claim-evidence-gate: Cursor stop carries no reply text and its transcript has
# no timestamps. beforeSubmitPrompt stamps the human-prompt time; stop hands the
# gate that stamp as a one-line transcript plus the turn's last assistant text,
# and maps {decision:block} to Cursor's {followup_message}. The ledger is the
# one context-ledger already writes from postToolUse tool_output.
if [ "$NAME" = claim-evidence-gate ]; then
  ev="$(printf '%s' "$IN" | jq -r '.hook_event_name // ""' 2>/dev/null)"
  sid="$(printf '%s' "$IN" | jq -r '.conversation_id // .session_id // ""' 2>/dev/null)"
  state="$HOME/.local/state/agent-hooks/${sid:-unknown}"; mkdir -p "$state"
  case "$ev" in
    beforeSubmitPrompt)
      printf '{"type":"user","timestamp":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$state/cursor-prompt.jsonl"
      printf '%s\n' '{"continue":true}'; exit 0 ;;
    stop)
      trx="$(printf '%s' "$IN" | jq -r '.transcript_path // ""')"
      last=""
      [ -f "$trx" ] && last="$(jq -rs '(map(.role) | rindex("user")) as $u | .[(($u // -1) + 1):]
        | map(select(.role == "assistant") | [.message.content[]? | select(.type == "text") | .text] | join(""))
        | map(select(. != "")) | last // ""' "$trx" 2>/dev/null)"
      out="$(jq -cn --arg sid "$sid" --arg t "$state/cursor-prompt.jsonl" --arg m "$last" \
          --argjson again "$(printf '%s' "$IN" | jq '(.loop_count // 0) > 0')" \
          '{hook_event_name:"Stop", session_id:$sid, transcript_path:$t, stop_hook_active:$again, last_assistant_message:$m}' \
        | "$HOOK" 2>/dev/null)"
      if [ "$(printf '%s' "$out" | jq -r '.decision // ""' 2>/dev/null)" = block ]; then
        printf '%s' "$out" | jq -c '{followup_message: .reason}'
      else printf '%s\n' '{}'; fi
      exit 0 ;;
  esac
  emit_ok; exit 0
fi

# Heredoc owns python stdin, so the Cursor payload cannot be piped. File argv.
in_file="$(mktemp)"
printf '%s' "$IN" > "$in_file"
mkdir -p "$HOME/.local/state/agent-scripts"
cp "$in_file" "$HOME/.local/state/agent-scripts/last-cursor-pretool.json" 2>/dev/null || true
printf '%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$HOME/.local/state/agent-scripts/last-cursor-pretool-append.jsonl" 2>/dev/null || true
cat "$in_file" >> "$HOME/.local/state/agent-scripts/last-cursor-pretool-append.jsonl" 2>/dev/null || true
printf '\n' >> "$HOME/.local/state/agent-scripts/last-cursor-pretool-append.jsonl" 2>/dev/null || true
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
        "run_in_background": bool(
            ti.get("run_in_background", False)
            or (isinstance(ti.get("block_until_ms"), (int, float)) and int(ti.get("block_until_ms")) == 0)
            or str(ti.get("block_until_ms", "")).strip() == "0"
            or (isinstance(ti.get("timeout"), (int, float)) and int(ti.get("timeout")) == 0)
            or str(ti.get("timeout", "")).strip() == "0"
            # Cursor/Grok Shell: block_until_ms=0 omits tool_input.timeout entirely
            or ("command" in ti and "timeout" not in ti)
        ),
    },
    "session_id": sid,
    "hook_event_name": event_out,
    "agent_id": aid,
    "agent_type": agent_type,
    "transcript_path": src.get("transcript_path") or "",
    "stop_hook_active": bool(src.get("stop_hook_active", False)),
}
# context-ledger reads tool_response. Cursor postToolUse sends tool_output, and for
# Shell it is a JSON string {"output","exitCode"} (live 2026-09-26) — without this
# every Cursor ledger line had evidence:[] and the claim gate could never match.
resp = src.get("tool_output")
if isinstance(resp, str):
    try:
        resp = json.loads(resp)
    except json.JSONDecodeError:
        pass
if isinstance(resp, dict) and "output" in resp:
    text = str(resp.get("output") or "")
    if resp.get("exitCode") is not None:
        text += f"\nexit code {resp.get('exitCode')}"
    resp = {"stdout": text}
if resp is not None:
    out["tool_response"] = resp
json.dump(out, sys.stdout, separators=(",", ":"))
PY
)" || {
  rm -f "$in_file"
  printf '%s\n' '{"agent_message":"cursor-adapt: remap failed"}'
  exit 1
}
rm -f "$in_file"

# deny-replay-gate reads prior hook denies as Claude tool_use/tool_result pairs;
# Cursor's transcript has no tool results, so every deny below is also logged in
# that shape and the gate reads the log instead.
DENY_LOG="$HOME/.local/state/agent-hooks/$(printf '%s' "$mapped" | jq -r '.session_id // "unknown"')/cursor-denies.jsonl"
if [ "$NAME" = deny-replay-gate ]; then
  mapped="$(printf '%s' "$mapped" | jq -c --arg t "$DENY_LOG" '.transcript_path = $t')"
fi

stderr_file="$(mktemp)"
stdout_file="$(mktemp)"
trap 'rm -f "$stderr_file" "$stdout_file"' EXIT
set +e
printf '%s' "$mapped" | "$HOOK" >"$stdout_file" 2>"$stderr_file"
ec=$?
set -e

if [ "$ec" -eq 2 ]; then
  msg="$(cat "$stderr_file")"
  mkdir -p "$(dirname "$DENY_LOG")"
  id="cursor-deny-$(date +%s)-$$"
  printf '%s' "$mapped" | jq -c --arg id "$id" '{type:"assistant",message:{content:[{type:"tool_use",id:$id,name:.tool_name,input:.tool_input}]}}' >> "$DENY_LOG"
  jq -cn --arg id "$id" --arg m "$msg" '{type:"user",message:{content:[{type:"tool_result",tool_use_id:$id,content:$m}]}}' >> "$DENY_LOG"
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
