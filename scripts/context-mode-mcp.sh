#!/usr/bin/env bash
# Force context-mode onto the Claude Code store. Cursor CLI ignores
# mcpServers.env; this file is the MCP command so DIR is in-process.
set -euo pipefail
export CONTEXT_MODE_DIR="${HOME}/.claude/context-mode"
mkdir -p "${CONTEXT_MODE_DIR}/sessions" "${CONTEXT_MODE_DIR}/content"
if [ "$#" -eq 0 ]; then
  exec npx --yes context-mode
fi
exec "$@"
