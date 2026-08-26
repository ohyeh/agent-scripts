#!/usr/bin/env bash
# Fail closed if a present runtime is not pinned to the Claude context-mode
# store. Plugin upgrades rewrite MCP env and drop CONTEXT_MODE_DIR; this
# check is the poke-yoke. Paths are $HOME-relative — never hard-code a user.
#
# Canonical store: $HOME/.claude/context-mode  (sessions/ + content/)
# Usage: scripts/check-context-mode-dir.sh   (exit 0 = PASS)
set -euo pipefail

CANON="${HOME}/.claude/context-mode"
fail=0

say_fail() { echo "FAIL [context-mode-dir] $*" >&2; fail=1; }
say_pass() { echo "PASS [context-mode-dir] $*"; }
say_warn() { echo "WARN [context-mode-dir] $*" >&2; }

want_assignment() {
  local file="$1" label="$2"
  [ -f "$file" ] || return 0
  python3 - "$file" "$CANON" "$label" <<'PY'
import pathlib, re, sys
path, canon, label = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
text = path.read_text()
# Assignments only (toml / export / json string). Ignore comments.
hits = []
for i, line in enumerate(text.splitlines(), 1):
    stripped = line.strip()
    if stripped.startswith("#") or stripped.startswith("//"):
        continue
    if "CONTEXT_MODE_DIR" not in stripped:
        continue
    m = re.search(r'CONTEXT_MODE_DIR\s*=\s*"([^"]+)"', stripped)
    if not m:
        m = re.search(r'"CONTEXT_MODE_DIR"\s*:\s*"([^"]+)"', stripped)
    if m:
        hits.append((i, m.group(1)))
if not hits:
    print(f"missing CONTEXT_MODE_DIR in {label} ({path})")
    sys.exit(2)
bad = [(i, v) for i, v in hits if v != canon]
if bad:
    print(f"wrong CONTEXT_MODE_DIR in {label}: " + ", ".join(f"L{i}={v}" for i, v in bad) + f" want {canon}")
    sys.exit(2)
print(f"{label} ({len(hits)} assignment(s))")
PY
}

if [ -f "${HOME}/.codex/config.toml" ]; then
  if out="$(want_assignment "${HOME}/.codex/config.toml" "codex config.toml")"; then
    say_pass "$out"
  else
    say_fail "$out"
  fi
  if grep -q '^\[mcp_servers\.context-mode\]' "${HOME}/.codex/config.toml" \
     && ! grep -q '^\[mcp_servers\.context-mode.env\]' "${HOME}/.codex/config.toml"; then
    say_fail "codex has [mcp_servers.context-mode] but no .env section"
  fi
fi

if [ -d "${HOME}/.cursor" ]; then
  if [ -f "${HOME}/.cursor/mcp.json" ]; then
    if out="$(want_assignment "${HOME}/.cursor/mcp.json" "cursor mcp.json")"; then
      say_pass "$out"
    else
      say_fail "$out"
    fi
  else
    say_fail "Cursor present but ~/.cursor/mcp.json missing CONTEXT_MODE_DIR pin"
  fi
  if [ -L "${HOME}/.cursor/context-mode" ]; then
    target="$(readlink "${HOME}/.cursor/context-mode")"
    if [ "$target" = "$CANON" ]; then
      say_pass "cursor context-mode symlink -> $CANON"
    else
      say_fail "cursor context-mode symlink -> $target (want $CANON)"
    fi
  elif [ -e "${HOME}/.cursor/context-mode" ]; then
    say_fail "~/.cursor/context-mode exists and is not a symlink to $CANON"
  else
    say_fail "Cursor present but ~/.cursor/context-mode symlink missing"
  fi
fi

if [ -f "${HOME}/.gemini/settings.json" ]; then
  if out="$(want_assignment "${HOME}/.gemini/settings.json" "gemini settings.json")"; then
    say_pass "$out"
  else
    say_fail "$out"
  fi
fi

if [ -f "${HOME}/.zshrc" ]; then
  if out="$(want_assignment "${HOME}/.zshrc" "zshrc")"; then
    say_pass "$out"
  else
    say_fail "$out"
  fi
fi

# Leftover adapter trees are archives, not the live pin. Warn so hooks that
# ignore env are visible; do not fail deploy (historical session DBs stay).
for leftover in "${HOME}/.codex/context-mode" "${HOME}/.gemini/context-mode"; do
  if [ -d "$leftover" ] && [ ! -L "$leftover" ]; then
    say_warn "leftover real directory $leftover (live pin is $CANON)"
  fi
done

if [ "$fail" -ne 0 ]; then
  exit 1
fi
echo "PASS [context-mode-dir] canonical store $CANON"
