#!/usr/bin/env bash
# Fleet deploy + verify: runs deploy.sh on every listed host, then verifies
# each host's deployed global files against the same pinned main SHA the
# deploy resolved. One command replaces the manual push -> per-host curl|bash
# -> per-host md5/Version spot-check loop.
#
# Usage: scripts/fleet-deploy.sh [--verify-only] <host>...
#   <host>  "local" for this machine, or any ssh destination
#           (e.g. build-node, deploy@example.internal)
#
# Every host gets the full deploy.sh run (unless --verify-only),
# then the verify pass checks, per host:
#   - ~/.claude/CLAUDE.md and ~/.codex/AGENTS.md md5 both equal the repo's
#     global/CLAUDE.md md5 at the pinned SHA (the two files are byte-identical
#     by contract), and
#   - both files carry the same Version: line.
# Any FAIL exits non-zero after the full table prints — verify everything,
# then fail loudly; no partial silent pass.
set -euo pipefail

REPO_GIT_URL="https://github.com/ohyeh/agent-scripts.git"
RELEASE_REF="refs/heads/main"
RAW_BASE="https://raw.githubusercontent.com/ohyeh/agent-scripts"

VERIFY_ONLY=0
HOSTS=()
for arg in "$@"; do
  case "$arg" in
    --verify-only) VERIFY_ONLY=1 ;;
    *) HOSTS+=("$arg") ;;
  esac
done
if [ "${#HOSTS[@]}" -eq 0 ]; then
  echo "usage: $0 [--verify-only] <host>...   (host = 'local' or ssh destination)" >&2
  exit 2
fi

# md5 -q on macOS, md5sum on linux; emit just the hash either way.
# shellcheck disable=SC2016  # $1 must reach the remote shell unexpanded
MD5_SNIPPET='f(){ if command -v md5 >/dev/null; then md5 -q "$1"; else md5sum "$1" | cut -d" " -f1; fi; }'

run_on() { # run_on <host> <command string>
  if [ "$1" = "local" ]; then bash -c "$2"; else ssh -o ConnectTimeout=15 "$1" "$2"; fi
}

echo "==> Resolving agent-scripts $RELEASE_REF..."
SHA="$(git ls-remote "$REPO_GIT_URL" "$RELEASE_REF" | cut -f1)"
if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "FAIL [resolve] expected one 40-character commit SHA for $RELEASE_REF" >&2
  exit 1
fi
DEPLOY_URL="$RAW_BASE/$SHA/scripts/deploy.sh"
EXPECTED_MD5="$(curl -fsSL "$RAW_BASE/$SHA/global/CLAUDE.md" | { if command -v md5 >/dev/null; then md5 -q; else md5sum | cut -d' ' -f1; fi; })"
EXPECTED_VERSION="$(curl -fsSL "$RAW_BASE/$SHA/global/CLAUDE.md" | grep -m1 '^Version:')"

# Rules-layer expectation: aggregate sha256 of every pinned rule file,
# including repo-canonical lessons.md.
RULES_SNIPPET='r(){ cd "$1" 2>/dev/null || { echo missing; return; }; LC_ALL=C ls *.md 2>/dev/null | xargs shasum -a 256 2>/dev/null | shasum -a 256 | cut -d" " -f1; }'
TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"' EXIT
curl -fsSL "https://github.com/ohyeh/agent-scripts/archive/$SHA.tar.gz" | tar xz -C "$TMPD"
EXPECTED_RULES="$(bash -c "$RULES_SNIPPET; r '$TMPD/agent-scripts-$SHA/.agents/rules'")"
echo "PASS [resolve] $RELEASE_REF -> $SHA (global md5=$EXPECTED_MD5, rules sha=$EXPECTED_RULES, $EXPECTED_VERSION)"

FAILED=0
for host in "${HOSTS[@]}"; do
  if [ "$VERIFY_ONLY" -eq 0 ]; then
    echo "==> [$host] deploying @ $SHA"
    if run_on "$host" "curl -fsSL '$DEPLOY_URL' | bash" >/dev/null 2>&1; then
      echo "PASS [$host] deploy.sh completed"
    else
      echo "FAIL [$host] deploy.sh exited non-zero" >&2
      FAILED=1
      continue
    fi
  fi
  echo "==> [$host] verifying"
  report="$(run_on "$host" "$MD5_SNIPPET; $RULES_SNIPPET
    c=\$(f ~/.claude/CLAUDE.md); a=\$(f ~/.codex/AGENTS.md)
    vc=\$(grep -m1 '^Version:' ~/.claude/CLAUDE.md); va=\$(grep -m1 '^Version:' ~/.codex/AGENTS.md)
    rs=\$(r ~/.agents/rules)
    printf '%s|%s|%s|%s|%s' \"\$c\" \"\$a\" \"\$vc\" \"\$va\" \"\$rs\"" || true)"
  IFS='|' read -r c_md5 a_md5 c_ver a_ver r_sha <<<"$report"
  if [ "$c_md5" = "$EXPECTED_MD5" ] && [ "$a_md5" = "$EXPECTED_MD5" ] \
     && [ "$c_ver" = "$EXPECTED_VERSION" ] && [ "$a_ver" = "$EXPECTED_VERSION" ] \
     && [ "$r_sha" = "$EXPECTED_RULES" ]; then
    echo "PASS [$host] CLAUDE.md/AGENTS.md md5=$EXPECTED_MD5, rules sha=$r_sha, $c_ver"
  else
    echo "FAIL [$host] got CLAUDE.md md5=${c_md5:-<none>} AGENTS.md md5=${a_md5:-<none>} rules sha=${r_sha:-<none>} '$c_ver' / '$a_ver' — expected md5=$EXPECTED_MD5 rules sha=$EXPECTED_RULES '$EXPECTED_VERSION'" >&2
    FAILED=1
  fi
done

if [ "$FAILED" -ne 0 ]; then
  echo "==> FLEET FAIL — at least one host failed deploy or verification" >&2
  exit 1
fi
echo "==> FLEET OK — all ${#HOSTS[@]} host(s) deployed @ $SHA and verified"
