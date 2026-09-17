#!/usr/bin/env bash
# Installer self-check: wrap Cursor MCP command so CONTEXT_MODE_DIR is in-process.
cd "$(dirname "$0")/.." || exit 1
set -euo pipefail
fail=0
ok() { printf 'ok   %s\n' "$1"; }
bad() { printf 'FAIL %s\n' "$1"; fail=1; }

TMPHOME="$(mktemp -d)"
trap 'rm -rf "$TMPHOME"' EXIT
export HOME="$TMPHOME"

plugin_json="$HOME/.cursor/plugins/cache/context-mode/context-mode/hash/.cursor-plugin/plugin.json"
mkdir -p "$(dirname "$plugin_json")" "$HOME/.cursor" "$HOME/.codex"
cat >"$HOME/.cursor/mcp.json" <<'JSON'
{
  "mcpServers": {
    "context-mode": {
      "command": "npx",
      "args": ["-y", "context-mode"]
    }
  }
}
JSON
cat >"$plugin_json" <<'JSON'
{
  "mcpServers": {
    "context-mode": {
      "command": "npx",
      "args": ["-y", "context-mode"]
    }
  }
}
JSON
cat >"$HOME/.codex/config.toml" <<'TOML'
[mcp_servers.context-mode]
command = "/opt/homebrew/bin/node"
args = ["/tmp/start.mjs"]
cwd = "/tmp"

[mcp_servers.context-mode.env]
CONTEXT_MODE_PLATFORM = "codex"
TOML

bash scripts/install-context-mode-dir.sh >/tmp/ctx-dir-install.out 2>/tmp/ctx-dir-install.err || {
  bad "install exit $? stderr=$(head -c 400 /tmp/ctx-dir-install.err)"
  exit 1
}

wrapper="$HOME/.claude/context-mode-mcp.sh"
if [ -x "$wrapper" ]; then
  ok "wrapper executable"
else
  bad "wrapper missing"
fi

python3 - "$HOME/.cursor/mcp.json" "$wrapper" "$plugin_json" "$HOME/.codex/config.toml" <<'PY' || fail=1
import json, pathlib, sys
mcp, wrapper, plugin, toml = sys.argv[1:]
canon = str(pathlib.Path.home() / ".claude" / "context-mode")
def check(path, label, require_env):
    data = json.loads(pathlib.Path(path).read_text())
    srv = data["mcpServers"]["context-mode"]
    if srv["command"] != wrapper:
        print(f"FAIL {label} command={srv['command']!r}")
        sys.exit(1)
    if srv["args"][:2] != ["npx", "-y"]:
        print(f"FAIL {label} args={srv['args']!r}")
        sys.exit(1)
    if require_env and srv.get("env", {}).get("CONTEXT_MODE_DIR") != canon:
        print(f"FAIL {label} env DIR={srv.get('env')}")
        sys.exit(1)
    print(f"ok   {label} wrapped")
check(mcp, "mcp.json", True)
check(plugin, "plugin.json", False)
text = pathlib.Path(toml).read_text()
if f'command = "{wrapper}"' not in text:
    print("FAIL codex command not wrapped")
    sys.exit(1)
if "/opt/homebrew/bin/node" not in text or "/tmp/start.mjs" not in text:
    print("FAIL codex lost original argv")
    sys.exit(1)
print("ok   codex toml wrapped")
PY

# Idempotent second run
bash scripts/install-context-mode-dir.sh >/dev/null
python3 - "$HOME/.cursor/mcp.json" "$wrapper" <<'PY' || fail=1
import json, pathlib, sys
data = json.loads(pathlib.Path(sys.argv[1]).read_text())
args = data["mcpServers"]["context-mode"]["args"]
if args.count(sys.argv[2]):
    print(f"FAIL double-wrapped args={args}")
    raise SystemExit(1)
if args[:2] != ["npx", "-y"]:
    print(f"FAIL second run args={args}")
    raise SystemExit(1)
print("ok   second run not double-wrapped")
PY

# Wrapper forces DIR even when the parent env is wrong
got="$(HOME="$TMPHOME" CONTEXT_MODE_DIR=/tmp/wrong bash -c 'source "'"$wrapper"'" 2>/dev/null; printf %s "$CONTEXT_MODE_DIR"' 2>/dev/null || true)"
# sourcing would exec npx — instead parse the script
if grep -q 'export CONTEXT_MODE_DIR="${HOME}/.claude/context-mode"' "$wrapper"; then
  ok "wrapper hard-sets Claude store"
else
  bad "wrapper missing DIR export"
fi

bash -n scripts/context-mode-mcp.sh && ok "bash -n wrapper"
bash -n scripts/install-context-mode-dir.sh && ok "bash -n install"
bash -n scripts/check-context-mode-dir.sh && ok "bash -n check"

exit "$fail"
