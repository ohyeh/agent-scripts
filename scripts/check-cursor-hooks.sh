#!/usr/bin/env bash
# Fail closed if Cursor user hooks are missing the fleet adapter wiring.
# Paths are $HOME-relative — never hard-code a user.
#
# Usage: scripts/check-cursor-hooks.sh   (exit 0 = PASS)
set -euo pipefail

JSON="${HOME}/.cursor/hooks.json"
ADAPT="${HOME}/.agents/hooks/cursor-adapt.sh"
HOOK_DIR="${HOME}/.cursor/hooks"
fail=0

say_fail() { echo "FAIL [cursor-hooks] $*" >&2; fail=1; }
say_pass() { echo "PASS [cursor-hooks] $*"; }

[ -x "$ADAPT" ] || say_fail "adapter not executable: \$HOME/.agents/hooks/cursor-adapt.sh"
[ -f "$JSON" ] || say_fail "missing \$HOME/.cursor/hooks.json"

for name in bol-prompt-gate subagent-ledger bash-read-audit agent-device-target-gate context-ledger; do
  [ -x "${HOOK_DIR}/fleet-${name}.sh" ] || say_fail "wrapper missing: \$HOME/.cursor/hooks/fleet-${name}.sh"
done

if [ -f "$JSON" ]; then
  if out="$(python3 - "$JSON" <<'PY'
import json, sys
path = sys.argv[1]
data = json.loads(open(path).read())
hooks = data.get("hooks") or {}
want = {
    "subagentStart": ["./hooks/fleet-bol-prompt-gate.sh", "./hooks/fleet-subagent-ledger.sh"],
    "subagentStop": ["./hooks/fleet-subagent-ledger.sh"],
    "preToolUse": ["./hooks/fleet-bash-read-audit.sh", "./hooks/fleet-agent-device-target-gate.sh"],
    "postToolUse": ["./hooks/fleet-context-ledger.sh"],
}
errors = []
for event, cmds in want.items():
    have = [i.get("command") for i in (hooks.get(event) or []) if isinstance(i, dict)]
    for cmd in cmds:
        if cmd not in have:
            errors.append(f"{event} missing {cmd}")
forbidden = {
    "./hooks/fleet-claude-version-sentinel.sh",
    "./hooks/fleet-session-title-sentinel.sh",
    "./hooks/fleet-tmux-assign-host-gate.sh",
}
for event, arr in hooks.items():
    if not isinstance(arr, list):
        continue
    for item in arr:
        if isinstance(item, dict) and item.get("command") in forbidden:
            errors.append(f"{event} has skipped hook {item.get('command')}")
if errors:
    sys.stderr.write("\n".join(errors) + "\n")
    sys.exit(2)
print("registry ok")
PY
)"; then
    say_pass "$out"
  else
    say_fail "registry mismatch"
  fi
fi

if [ "$fail" -ne 0 ]; then
  exit 1
fi
say_pass "adapter + wrappers + registry"
