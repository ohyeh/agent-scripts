#!/usr/bin/env bash
# Fail closed if codex-cu is installed but broken. Paths are $HOME-relative —
# never hard-code a user.
#
# Checks, in the order a failure would actually bite:
#   1. both binaries present and executable (the proxy resolves its child as a
#      sibling, so one without the other is a silent breakage)
#   2. the proxy resolves a child that exists
#   3. the injection self-test passes
#   4. every present runtime points at the proxy, not the bare child
#
# SKIP + exit 0 when the Computer Use plugin is absent — same gate as the
# installer, so a host without the ChatGPT app is not a fleet failure.
# Usage: scripts/check-codex-cu.sh   (exit 0 = PASS)
set -euo pipefail

PLUGIN_DIR="${HOME}/.codex/plugins/cache/openai-bundled/unified-computer-use"
BIN="${HOME}/.local/bin"
CHILD="${BIN}/codex-cu-mcp"
PROXY="${BIN}/codex-cu-proxy"
fail=0

say_fail() { echo "FAIL [codex-cu] $*" >&2; fail=1; }
say_pass() { echo "PASS [codex-cu] $*"; }

if [ ! -d "$PLUGIN_DIR" ]; then
  echo "SKIP [codex-cu] no Computer Use plugin at $PLUGIN_DIR"
  exit 0
fi

for f in "$CHILD" "$PROXY"; do
  [ -x "$f" ] || say_fail "missing or not executable: $f"
done
[ "$fail" -eq 0 ] && say_pass "both binaries present and executable"

# The proxy must resolve a child that exists — a stale CU_CHILD or a half
# install would otherwise only show up as a dead MCP server at runtime.
if [ -x "$PROXY" ]; then
  # Load the proxy as a module and read the CHILD it actually computed. The old
  # regex-then-recompute version was tautological: a proxy pointing at a
  # nonexistent child still passed (reviewers reproduced it, 2026-10-05).
  resolved="$(python3 - "$PROXY" <<'PY'
import runpy, sys
mod = runpy.run_path(sys.argv[1], run_name="codex_cu_proxy_check")
print(mod.get("CHILD", ""))
PY
)"
  if [ -n "$resolved" ] && [ -x "$resolved" ]; then
    say_pass "proxy resolves child -> $resolved"
  else
    say_fail "proxy cannot resolve an executable child (got '${resolved:-<none>}')"
  fi

  if python3 "$PROXY" --self-test 2>&1 | grep -q 'self-test ok'; then
    say_pass "proxy self-test ok"
  else
    say_fail "proxy self-test did not pass"
  fi
fi

# Registered at user scope, pointing at the PROXY. Pointing at the bare child
# still works for apps but silently loses the browser surface.
check_json() {
  local file="$1" label="$2" got
  [ -f "$file" ] || return 0
  got="$(jq -r '.mcpServers["codex-cu"].command // ""' "$file" 2>/dev/null || echo "")"
  if [ "$got" = "$PROXY" ]; then
    say_pass "$label -> codex-cu-proxy"
  elif [ -z "$got" ]; then
    say_fail "$label has no codex-cu entry"
  else
    say_fail "$label -> $got (want $PROXY)"
  fi
}

# Registered binaries are useless if no version can be resolved; ask the launcher.
if resolved_version="$(python3 "$CHILD" --resolve 2>&1)"; then
  say_pass "launcher resolves version -> $resolved_version"
else
  say_fail "launcher cannot resolve a usable version: $resolved_version"
fi

check_json "${HOME}/.claude.json" "Claude Code (user scope)"
check_json "${HOME}/.cursor/mcp.json" "Cursor"

if command -v agy >/dev/null 2>&1; then
  if agy mcp list 2>/dev/null | grep -q "codex-cu.*$PROXY"; then
    say_pass "agy -> codex-cu-proxy"
  else
    say_fail "agy has no codex-cu entry pointing at $PROXY"
  fi
fi

exit "$fail"
