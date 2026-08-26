#!/usr/bin/env bash
# Idempotent: register fleet hooks in ~/.cursor/hooks.json via the Cursor
# adapter. User-hook cwd is ~/.cursor/, so commands are relative
# ./hooks/fleet-*.sh wrappers (Cursor docs). Does not touch plugin-declared
# hooks (context-mode lives in the plugin, not this file).
#
# Usage: scripts/install-cursor-hooks.sh
# Then:  scripts/check-cursor-hooks.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADAPT_SRC="${ROOT}/.agents/hooks/cursor-adapt.sh"
ADAPT_DST="${HOME}/.agents/hooks/cursor-adapt.sh"
CURSOR_DIR="${HOME}/.cursor"
HOOK_DIR="${CURSOR_DIR}/hooks"
JSON="${CURSOR_DIR}/hooks.json"

if [ ! -f "$ADAPT_SRC" ]; then
  echo "FAIL [cursor-hooks] missing adapter: $ADAPT_SRC" >&2
  exit 1
fi

mkdir -p "${HOME}/.agents/hooks" "$HOOK_DIR"
install -m 0755 "$ADAPT_SRC" "$ADAPT_DST"

wrapper_body=$'#!/usr/bin/env bash\nexec "$HOME/.agents/hooks/cursor-adapt.sh" "$(basename "$0" .sh | sed "s/^fleet-//")"\n'

# name|event|matcher|failClosed
# matcher empty = all tools / no filter
REGISTRY=$'
bol-prompt-gate|subagentStart||true
subagent-ledger|subagentStart||false
subagent-ledger|subagentStop||false
bash-read-audit|preToolUse|Shell|false
agent-device-target-gate|preToolUse|Shell|true
context-ledger|postToolUse||false
'

while IFS='|' read -r name event matcher fail_closed; do
  [ -n "${name:-}" ] || continue
  wrap="${HOOK_DIR}/fleet-${name}.sh"
  printf '%s' "$wrapper_body" > "$wrap"
  chmod 0755 "$wrap"
done <<< "$(printf '%s' "$REGISTRY" | sed '/^[[:space:]]*$/d')"

[ -f "$JSON" ] || printf '%s\n' '{"version":1,"hooks":{}}' > "$JSON"

tmp="$(mktemp)"
python3 - "$JSON" "$tmp" "$REGISTRY" <<'PY'
import json, sys
path, dest, registry = sys.argv[1], sys.argv[2], sys.argv[3]
data = json.loads(open(path).read() or "{}")
if not isinstance(data, dict):
    data = {}
data["version"] = 1
hooks = data.setdefault("hooks", {})
if not isinstance(hooks, dict):
    hooks = {}
    data["hooks"] = hooks

wanted = []
for line in registry.splitlines():
    line = line.strip()
    if not line:
        continue
    name, event, matcher, fail_closed = line.split("|")
    cmd = f"./hooks/fleet-{name}.sh"
    entry = {
        "command": cmd,
        "timeout": 10,
        "failClosed": fail_closed == "true",
    }
    if matcher:
        entry["matcher"] = matcher
    wanted.append((event, cmd, entry))

for event, cmd, entry in wanted:
    arr = hooks.get(event) or []
    if not isinstance(arr, list):
        arr = []
    replaced = False
    new_arr = []
    for item in arr:
        if isinstance(item, dict) and item.get("command") == cmd:
            new_arr.append(entry)
            replaced = True
        else:
            new_arr.append(item)
    if not replaced:
        new_arr.append(entry)
    hooks[event] = new_arr

open(dest, "w").write(json.dumps(data, indent=2) + "\n")
PY
mv "$tmp" "$JSON"

echo "PASS [cursor-hooks] $JSON"
