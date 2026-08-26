#!/usr/bin/env bash
# Self-check for .agents/hooks/cursor-adapt.sh against Cursor-shaped stdin.
cd "$(dirname "$0")/.." || exit 1
set -u
ADAPT=.agents/hooks/cursor-adapt.sh
chmod +x "$ADAPT" .agents/hooks/*.sh 2>/dev/null || true
fail=0

TMPHOME="$(mktemp -d)"
trap 'rm -rf "$TMPHOME"' EXIT
export HOME="$TMPHOME"
export CURSOR_ADAPT_HOOKS_DIR="$PWD/.agents/hooks"
mkdir -p "$HOME/.agents/hooks" "$HOME/.local/state/agent-hooks"
# bol-prompt-gate looks for the validator next to itself, then repo scripts/.
install -m 0755 scripts/check-bol-prompt.sh "$HOME/.agents/hooks/check-bol-prompt.sh"
# Copy fleet hooks into fake HOME so wrapper-style paths work if a test uses them.
install -m 0755 .agents/hooks/cursor-adapt.sh "$HOME/.agents/hooks/cursor-adapt.sh"
install -m 0755 .agents/hooks/bol-prompt-gate.sh "$HOME/.agents/hooks/bol-prompt-gate.sh"
install -m 0755 .agents/hooks/subagent-ledger.sh "$HOME/.agents/hooks/subagent-ledger.sh"
install -m 0755 .agents/hooks/bash-read-audit.sh "$HOME/.agents/hooks/bash-read-audit.sh"
install -m 0755 .agents/hooks/agent-device-target-gate.sh "$HOME/.agents/hooks/agent-device-target-gate.sh"
install -m 0755 .agents/hooks/context-ledger.sh "$HOME/.agents/hooks/context-ledger.sh"
install -m 0755 .agents/hooks/tmux-assign-host-gate.sh "$HOME/.agents/hooks/tmux-assign-host-gate.sh"
export CURSOR_ADAPT_HOOKS_DIR="$HOME/.agents/hooks"

t() {
  # $1 name $2 want_exit $3 hook $4 json
  got_out="$(printf '%s' "$4" | "$HOME/.agents/hooks/cursor-adapt.sh" "$3" 2>/dev/null)"
  got=$?
  if [ "$got" = "$2" ]; then
    printf 'ok   %-36s exit=%s\n' "$1" "$got"
  else
    printf 'FAIL %-36s want=%s got=%s out=%s\n' "$1" "$2" "$got" "$got_out"
    fail=1
  fi
}

json_ok() {
  printf '%s' "$1" | python3 -c 'import json,sys; json.loads(sys.stdin.read())' >/dev/null 2>&1
}

# --- Shell remap: device gate ---
DEVICE_BAD='{"hook_event_name":"preToolUse","tool_name":"Shell","conversation_id":"c1","tool_input":{"command":"agent-device open MyApp --platform ios"}}'
DEVICE_OK='{"hook_event_name":"preToolUse","tool_name":"Shell","conversation_id":"c1","tool_input":{"command":"agent-device open MyApp --platform ios --device phone"}}'
t "device deny Shell" 2 agent-device-target-gate "$DEVICE_BAD"
t "device allow with --device" 0 agent-device-target-gate "$DEVICE_OK"
t "unrelated Shell allow" 0 agent-device-target-gate '{"hook_event_name":"preToolUse","tool_name":"Shell","conversation_id":"c1","tool_input":{"command":"git status"}}'

# stdout must be JSON even on allow
out="$(printf '%s' "$DEVICE_OK" | "$HOME/.agents/hooks/cursor-adapt.sh" agent-device-target-gate)"
ec=$?
if [ "$ec" = 0 ] && json_ok "$out"; then
  printf 'ok   %-36s json stdout\n' "allow emits JSON"
else
  printf 'FAIL %-36s json stdout ec=%s out=%s\n' "allow emits JSON" "$ec" "$out"
  fail=1
fi
out="$(printf '%s' "$DEVICE_BAD" | "$HOME/.agents/hooks/cursor-adapt.sh" agent-device-target-gate)"
ec=$?
if [ "$ec" = 2 ] && printf '%s' "$out" | python3 -c 'import json,sys; d=json.loads(sys.stdin.read()); assert d.get("permission")=="deny"'; then
  printf 'ok   %-36s deny JSON\n' "deny emits permission"
else
  printf 'FAIL %-36s deny JSON ec=%s out=%s\n' "deny emits permission" "$ec" "$out"
  fail=1
fi

# --- bol-prompt-gate on subagentStart ---
BOL_BAD='{"hook_event_name":"subagentStart","subagent_id":"s1","subagent_type":"generalPurpose","task":"do the thing","parent_conversation_id":"c1"}'
BOL_OK='{"hook_event_name":"subagentStart","subagent_id":"s1","subagent_type":"generalPurpose","task":"GOAL: x\nACCEPTANCE: y\nREPORT: z","parent_conversation_id":"c1"}'
BOL_EXPLORE='{"hook_event_name":"subagentStart","subagent_id":"s2","subagent_type":"explore","task":"where is auth","parent_conversation_id":"c1"}'
t "bol deny missing GOAL" 2 bol-prompt-gate "$BOL_BAD"
t "bol allow full brief" 0 bol-prompt-gate "$BOL_OK"
t "bol explore exempt" 0 bol-prompt-gate "$BOL_EXPLORE"

# --- ledger start/stop share derived id ---
export XDG_STATE_HOME="$HOME/.local/state"
START='{"hook_event_name":"subagentStart","subagent_id":"real-id","subagent_type":"generalPurpose","task":"GOAL: a\nACCEPTANCE: b\nREPORT: c","parent_conversation_id":"sessA"}'
STOP='{"hook_event_name":"subagentStop","subagent_type":"generalPurpose","task":"GOAL: a\nACCEPTANCE: b\nREPORT: c","parent_conversation_id":"sessA","status":"completed"}'
t "ledger start" 0 subagent-ledger "$START"
# marker lives under session_id = parent_conversation_id
marker_dir="$HOME/.local/state/agent-hooks/sessA/subagents"
n_start="$(find "$marker_dir" -type f 2>/dev/null | wc -l | tr -d ' ')"
t "ledger stop" 0 subagent-ledger "$STOP"
n_stop="$(find "$marker_dir" -type f 2>/dev/null | wc -l | tr -d ' ')"
if [ "$n_start" = 1 ] && [ "$n_stop" = 0 ]; then
  printf 'ok   %-36s start=1 stop=0\n' "ledger derived id roundtrip"
else
  printf 'FAIL %-36s start=%s stop=%s dir=%s\n' "ledger derived id roundtrip" "$n_start" "$n_stop" "$marker_dir"
  fail=1
fi

# --- bash-read-audit: Shell cat is logged, session_id from conversation_id ---
t "read-audit cat" 0 bash-read-audit '{"hook_event_name":"preToolUse","tool_name":"Shell","conversation_id":"sessB","tool_input":{"command":"cat README.md"}}'
audit="$HOME/.local/state/agent-hooks/sessB/read-audit.jsonl"
if [ -f "$audit" ]; then
  printf 'ok   %-36s wrote audit\n' "read-audit uses conversation_id"
else
  printf 'FAIL %-36s missing %s\n' "read-audit uses conversation_id" "$audit"
  fail=1
fi

# --- context-ledger ---
t "context-ledger" 0 context-ledger '{"hook_event_name":"postToolUse","tool_name":"Read","conversation_id":"sessC","tool_input":{"path":"a.ts"}}'
ledger="$HOME/.local/state/agent-hooks/sessC/ledger.jsonl"
if [ -f "$ledger" ]; then
  printf 'ok   %-36s wrote ledger\n' "context-ledger session remap"
else
  printf 'FAIL %-36s missing %s\n' "context-ledger session remap" "$ledger"
  fail=1
fi

# --- tmux-assign-host-gate via adapter ---
ASSIGN='{"hook_event_name":"preToolUse","tool_name":"Shell","conversation_id":"c1","tool_input":{"command":"agent-tmux cursor assign job /tmp /p.md"}}'
ASSIGN_CHILD='{"hook_event_name":"preToolUse","tool_name":"Shell","subagent_id":"s1","subagent_type":"generalPurpose","conversation_id":"c1","tool_input":{"command":"agent-tmux cursor assign job /tmp /p.md"}}'
ASSIGN_BG='{"hook_event_name":"preToolUse","tool_name":"Shell","conversation_id":"c1","tool_input":{"command":"agent-tmux cursor assign job /tmp /p.md","run_in_background":true}}'
t "assign parent deny" 2 tmux-assign-host-gate "$ASSIGN"
t "assign Task-hosted allow" 0 tmux-assign-host-gate "$ASSIGN_CHILD"
t "assign background allow" 0 tmux-assign-host-gate "$ASSIGN_BG"
out="$(printf '%s' "$ASSIGN" | "$HOME/.agents/hooks/cursor-adapt.sh" tmux-assign-host-gate)"
ec=$?
if [ "$ec" = 2 ] && printf '%s' "$out" | python3 -c 'import json,sys; d=json.loads(sys.stdin.read()); assert d.get("permission")=="deny"'; then
  printf 'ok   %-36s deny JSON\n' "assign parent deny JSON"
else
  printf 'FAIL %-36s deny JSON ec=%s out=%s\n' "assign parent deny JSON" "$ec" "$out"
  fail=1
fi

bash -n "$ADAPT" && echo "ok   bash -n adapter"
bash -n scripts/install-cursor-hooks.sh && echo "ok   bash -n install"
bash -n scripts/check-cursor-hooks.sh && echo "ok   bash -n check"
exit $fail
