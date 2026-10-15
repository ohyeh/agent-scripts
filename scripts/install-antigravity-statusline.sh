#!/usr/bin/env bash
# Deploy dedicated Antigravity CLI statusline script and wire settings.json.
#
# Usage: scripts/install-antigravity-statusline.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT}/scripts/antigravity-statusline.sh"
AGY_DIR="${HOME}/.gemini/antigravity-cli"
DST="${AGY_DIR}/statusline.sh"
SETTINGS="${AGY_DIR}/settings.json"

if [ ! -f "$SRC" ]; then
  echo "FAIL [agy-statusline] missing source $SRC" >&2
  exit 1
fi

if [ ! -d "$AGY_DIR" ]; then
  echo "SKIP [agy-statusline] $AGY_DIR absent (agy not installed)"
  exit 0
fi

mkdir -p "$AGY_DIR"
install -m 0755 "$SRC" "$DST"

src_md5="$(md5 -q "$SRC")"
dst_md5="$(md5 -q "$DST")"
if [ "$src_md5" != "$dst_md5" ]; then
  echo "FAIL [agy-statusline] md5 mismatch after install" >&2
  exit 1
fi

if [ -f "$SETTINGS" ]; then
  tmp="$(mktemp)"
  jq '
    .statusLine = ((.statusLine // {}) + {
      type: "command",
      command: "bash ~/.gemini/antigravity-cli/statusline.sh",
      enabled: true
    })
  ' "$SETTINGS" > "$tmp" && mv "$tmp" "$SETTINGS"
  echo "PASS [agy-statusline] statusLine wired in settings.json"
fi

echo "PASS [agy-statusline] $DST (md5=$dst_md5)"
