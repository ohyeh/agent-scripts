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

for name in bol-prompt-gate subagent-concurrency-gate host-load-gate subagent-ledger bash-read-audit agent-device-target-gate tmux-assign-host-gate rm-home-gate context-ledger claim-evidence-gate deny-replay-gate; do
  [ -x "${HOOK_DIR}/fleet-${name}.sh" ] || say_fail "wrapper missing: \$HOME/.cursor/hooks/fleet-${name}.sh"
done

if [ -f "$JSON" ]; then
  if out="$(python3 - "$JSON" "$HOOK_DIR" <<'PY'
import json, sys
path = sys.argv[1]
hook_dir = sys.argv[2]
data = json.loads(open(path).read())
hooks = data.get("hooks") or {}
want = {
    "subagentStart": [f"bash {hook_dir}/fleet-bol-prompt-gate.sh", f"bash {hook_dir}/fleet-subagent-concurrency-gate.sh", f"bash {hook_dir}/fleet-host-load-gate.sh", f"bash {hook_dir}/fleet-subagent-ledger.sh"],
    "subagentStop": [f"bash {hook_dir}/fleet-subagent-ledger.sh"],
    "preToolUse": [f"bash {hook_dir}/fleet-bash-read-audit.sh", f"bash {hook_dir}/fleet-agent-device-target-gate.sh", f"bash {hook_dir}/fleet-tmux-assign-host-gate.sh", f"bash {hook_dir}/fleet-rm-home-gate.sh", f"bash {hook_dir}/fleet-host-load-gate.sh", f"bash {hook_dir}/fleet-bol-prompt-gate.sh", f"bash {hook_dir}/fleet-deny-replay-gate.sh"],
    "postToolUse": [f"bash {hook_dir}/fleet-context-ledger.sh"],
    "beforeSubmitPrompt": [f"bash {hook_dir}/fleet-claim-evidence-gate.sh"],
    "stop": [f"bash {hook_dir}/fleet-claim-evidence-gate.sh"],
}
errors = []
for event, cmds in want.items():
    have = [i.get("command") for i in (hooks.get(event) or []) if isinstance(i, dict)]
    for cmd in cmds:
        if cmd not in have:
            errors.append(f"{event} missing {cmd}")
forbidden = set()
for sentinel in ("fleet-claude-version-sentinel.sh", "fleet-session-title-sentinel.sh"):
    forbidden |= {
        f"./hooks/{sentinel}",
        f"bash ./hooks/{sentinel}",
        f"{hook_dir}/{sentinel}",
        f"bash {hook_dir}/{sentinel}",
    }
for event, arr in hooks.items():
    if not isinstance(arr, list):
        continue
    for item in arr:
        if not isinstance(item, dict):
            continue
        cmd = item.get("command")
        if cmd in forbidden:
            errors.append(f"{event} has skipped hook {cmd}")
        elif isinstance(cmd, str) and cmd.startswith(("bash ./hooks/", "./hooks/")):
            errors.append(f"{event} has relative hook path {cmd}")
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
