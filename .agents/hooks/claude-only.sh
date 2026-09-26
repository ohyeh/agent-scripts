#!/usr/bin/env bash
# claude-only.sh <hook> — run a ~/.claude/settings.json hook on Claude Code only.
# Cursor's Third-Party Imports also runs settings.json hooks, with the raw Cursor
# payload, next to the adapted ~/.cursor/hooks.json copies (live dump 2026-09-26):
# every gate ran twice and the extra ledger line had no evidence. A raw Cursor
# payload carries top-level cursor_version; the adapter output does not. There,
# print nothing at all so the native copy's reply is the only one.
payload="$(cat)"
if jq -e 'type == "object" and has("cursor_version")' >/dev/null 2>&1 <<<"$payload"; then
  exit 0
fi
printf '%s' "$payload" | "$@"
