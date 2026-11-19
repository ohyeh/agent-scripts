#!/usr/bin/env bash
# SessionStart hook: detect a Claude Code CLI upgrade and remind the model that
# probed (undocumented) interfaces need re-verification. The probed-interface
# inventory lives in ~/.agents/rules/harness-diagnosis.md §Interface trust tiers.
# stdout from a SessionStart hook is injected as context for the model.
set -u

# ponytail: latest installed version dir as proxy for the running CLI; good
# enough for an upgrade tripwire, swap to probing the parent process if it drifts.
VER="$(ls ~/.local/share/claude/versions 2>/dev/null | sort -V | tail -1)"
[ -n "$VER" ] || exit 0

STATE_DIR="${HOME}/.local/state/agent-hooks"
mkdir -p "$STATE_DIR"
LAST_FILE="$STATE_DIR/claude-version"
LAST="$(cat "$LAST_FILE" 2>/dev/null || true)"
printf '%s' "$VER" > "$LAST_FILE"

[ -z "$LAST" ] || [ "$LAST" = "$VER" ] && exit 0

cat <<EOF
Claude Code upgraded: $LAST -> $VER. Probed (undocumented) interfaces were last
verified on an older CLI and may have changed — re-verify before relying on
them: hook stdin agent_type, the session rename endpoint
(PUT /v1/code/sessions/<cse_id>), and the claude-agent-sdk local rename.
Inventory: ~/.agents/rules/harness-diagnosis.md "Interface trust tiers".
EOF
exit 0
