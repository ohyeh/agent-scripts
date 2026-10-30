#!/usr/bin/env bash
# Offline regression for fleet-deploy.sh --all: hosts come from HOSTS_FILE as
# written, and a stale-pin failure prints a repair command per host. git, curl,
# ssh and scp are shims: no network, no remote host is contacted.
set -euo pipefail
FLEET="$(cd "$(dirname "$0")" && pwd)/fleet-deploy.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
SHA=0123456789abcdef0123456789abcdef01234567
export SHA SSH_LOG="$T/ssh.log" HOME="$T/home" XDG_STATE_HOME="$T/state"
mkdir -p "$T/bin" "$HOME" "$T/tar/agent-scripts-$SHA/.agents/rules"
echo rule > "$T/tar/agent-scripts-$SHA/.agents/rules/a.md"
tar czf "$T/rules.tgz" -C "$T/tar" .
export RULES_TGZ="$T/rules.tgz"

cat > "$T/bin/git" <<'SH'
#!/bin/bash
[ "${1:-}" = ls-remote ] || exit 93
printf '%s\trefs/heads/main\n' "$SHA"
SH
cat > "$T/bin/curl" <<'SH'
#!/bin/bash
for url; do :; done
case "$url" in
  */global/CLAUDE.md) printf 'Version: 0.0.0-fixture\n' ;;
  *.tar.gz) cat "$RULES_TGZ" ;;
  */scripts/deploy.sh) printf '%s\n' \
    "echo 'INFO [skills] state=stale-pin: installed is newer than the lock for: wizard'" \
    "echo 'FAIL [skills] state=failed step=auth exit=1' >&2" 'exit 1' ;;
  *) exit 94 ;;
esac
SH
cat > "$T/bin/ssh" <<'SH'
#!/bin/bash
[ "$1 $2" = '-o ConnectTimeout=15' ] || exit 95
printf '%s\n' "$3" >> "$SSH_LOG"
exec bash -c "$4"
SH
printf '#!/bin/bash\nexit 96\n' > "$T/bin/scp"
chmod +x "$T/bin/"*
export PATH="$T/bin:$PATH"

printf '%s\n' '# fleet fixture' local '' 'box@grok-bot   # raw; never box_grok-bot' > "$T/hosts"
printf 'build-node' >> "$T/hosts"   # last line without newline

fail() { echo "FAIL [test-fleet-deploy] $*" >&2; exit 1; }
rc=0; out="$(HOSTS_FILE="$T/hosts" bash "$FLEET" --all 2>&1)" || rc=$?
[ "$rc" = 1 ] || fail "--all exit=$rc, want 1 (every host stale-pin)"$'\n'"$out"
grep -qF "INFO [hosts] --all from $T/hosts: local box@grok-bot build-node" <<<"$out" || fail "hosts not resolved raw"$'\n'"$out"
[ "$(cat "$SSH_LOG")" = $'box@grok-bot\nbuild-node' ] || fail "ssh destinations: $(cat "$SSH_LOG")"
[ "$(grep -c '^REPAIR \[' <<<"$out")" = 3 ] || fail "want 3 REPAIR lines"$'\n'"$out"
grep -q '^REPAIR \[local\] GITHUB_TOKEN=.*upgrade -g -y && scripts/sync-skills-lock.sh' <<<"$out" || fail "local repair"
grep -q '^REPAIR \[box@grok-bot\] .*scp box@grok-bot:\.agents/\.skill-lock\.json box@grok-bot:.*SKILLS_GLOBAL_LOCK=.*DEPLOY_LOG=.*sync-skills-lock\.sh' <<<"$out" || fail "box@grok-bot repair"
grep -q '^REPAIR \[build-node\] .*scp build-node:' <<<"$out" || fail "build-node repair"
# Each printed repair line must paste as one valid shell command (Sol R6-04).
while IFS= read -r line; do
  bash -n -c "${line#REPAIR \[*\] }" 2>/dev/null || fail "repair line is not valid shell: $line"
done < <(grep '^REPAIR \[' <<<"$out")
heads="$(for f in "$XDG_STATE_HOME"/agent-scripts/fleet-deploy/*.log; do head -n1 "$f"; done | sort)"
[ "$heads" = $'host=box@grok-bot\nhost=build-node\nhost=local' ] || fail "log headers: $heads"

rc=0; HOSTS_FILE="$T/missing" bash "$FLEET" --all >/dev/null 2>&1 || rc=$?
[ "$rc" = 2 ] || fail "--all with missing HOSTS_FILE exit=$rc, want 2"
echo "PASS [test-fleet-deploy] --all resolved 3 raw hosts, 3 REPAIR lines, no network"
