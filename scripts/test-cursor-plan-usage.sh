#!/usr/bin/env bash
# Cursor usage is a snapshot file. A Claude rate_limits payload must not touch it.
cd "$(dirname "$0")/.." || exit 1
set -euo pipefail

TMPHOME="$(mktemp -d)"
trap 'rm -rf "$TMPHOME"' EXIT
export HOME="$TMPHOME"
mkdir -p "$HOME/.cursor"
now_ms="$(python3 -c 'import time; print(int(time.time()*1000))')"
cat > "$HOME/.cursor/statusline-usage-cache.json" <<EOF
{"percent":65,"auto":64,"api":100,"fetchedAt":${now_ms},"resets_at":"2026-10-25T13:50:11Z"}
EOF

cursor_out="$(printf '%s' '{"session_id":"abc"}' | python3 scripts/cursor-plan-usage.py)"
python3 - "$HOME/.cursor/statusline-usage-snapshot.json" "$cursor_out" <<'PY'
import json, sys
snap = json.load(open(sys.argv[1]))
stdout = json.loads(sys.argv[2])
assert "rate_limits" not in stdout, stdout
assert stdout["session_id"] == "abc"
windows = snap["model_scoped"]
assert [w["display_name"] for w in windows] == ["plan", "auto", "api"], windows
assert [w["utilization"] for w in windows] == [65, 64, 100]
assert snap["updated_at"].endswith("Z")
assert windows[0]["resets_at"] == "2026-10-25T13:50:11Z"
print("ok cursor snapshot")
PY

before="$(cat "$HOME/.cursor/statusline-usage-snapshot.json")"
claude_out="$(printf '%s' '{"session_id":"claude","rate_limits":{"five_hour":{"used_percentage":9}}}' | python3 scripts/cursor-plan-usage.py)"
after="$(cat "$HOME/.cursor/statusline-usage-snapshot.json")"
python3 - "$before" "$after" "$claude_out" <<'PY'
import json, sys
assert sys.argv[1] == sys.argv[2], "claude payload rewrote the snapshot"
stdout = json.loads(sys.argv[3])
assert stdout["rate_limits"]["five_hour"]["used_percentage"] == 9
assert stdout["session_id"] == "claude"
print("ok claude passthrough")
PY
