#!/usr/bin/env bash
# Offline regression: real skills layer and dispatcher, isolated HOME, no network.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
REAL_GIT="$(command -v git)"; export REAL_GIT
REAL_BASH="$(command -v bash)"; export REAL_BASH
"$REAL_GIT" clone -q --local "$ROOT" "$T/repo"
cp "$ROOT/scripts/deploy.sh" "$T/repo/scripts/deploy.sh"
cd "$T/repo"
mkdir -p "$T/bin"
cat > "$T/bin/gh" <<'SH'
#!/bin/bash
[ "$*" = 'auth token --hostname github.com' ] || exit 91
[ "${FAIL_STEP:-}" != auth ] || exit 23
echo fixture-token
SH
cat > "$T/bin/npx" <<'SH'
#!/bin/bash
case "$*" in
  '--yes skills@1.7.2 upgrade -g -y')
    echo upgrade >> "$SHIM_LOG"
    [ "${GITHUB_TOKEN:-}" = fixture-token ] || exit 92
    [ "${FAIL_STEP:-}" != upgrade ] || exit 23
    cp "$FIXTURE_LOCK" "$HOME/.agents/.skill-lock.json" ;;
  '-y skills@1.7.2 experimental_install') : ;;
  *) exit 93 ;;
esac
SH
cat > "$T/bin/git" <<'SH'
#!/bin/bash
if [ "${1:-}" = -C ]; then repo="$2"; shift 2; else repo="$PWD"; fi
case "${1:-}" in
  clone)
    [ "${FAIL_STEP:-}" != clone ] || exit 23
    for dest; do :; done
    "$REAL_GIT" clone -q --local "$FIXTURE_REPO" "$dest"
    cp "$FIXTURE_REPO/skills-lock.json" "$dest/skills-lock.json" ;;
  commit|push)
    echo "$1" >> "$SHIM_LOG"
    [ "${FAIL_STEP:-}" != "$1" ] || exit 23 ;;
  *) exec "$REAL_GIT" -C "$repo" "$@" ;;
esac
SH
cat > "$T/bin/bash" <<'SH'
#!/bin/bash
case "${1:-}" in
  */sync-skills-lock.sh)
    if [ "${2:-}" = --check ]; then
      if [ -f "$SHIM_LOG" ] && grep -q '^push$' "$SHIM_LOG"; then
        echo recheck >> "$SHIM_LOG"
        [ "${FAIL_STEP:-}" != recheck ] || exit 23
      fi
    else
      echo sync >> "$SHIM_LOG"
      [ "${FAIL_STEP:-}" != sync ] || exit 23
    fi ;;
esac
exec "$REAL_BASH" "$@"
SH
chmod +x "$T/bin/"*
export PATH="$T/bin:$PATH"
export FIXTURE_REPO="$T/repo" FIXTURE_LOCK="$T/new-lock.json" SHIM_LOG="$T/steps" HARNESS="$T"
mkdir -p "$T/payload" "$T/hash"
printf '# foo\n' > "$T/payload/SKILL.md"
"$REAL_GIT" init -q "$T/hash"
"$REAL_GIT" --git-dir="$T/hash/.git" --work-tree="$T/payload" add -A .
HASH="$("$REAL_GIT" --git-dir="$T/hash/.git" write-tree)"
lock() {
  printf '{"version":3,"skills":{"foo":{"source":"example/foo","skillPath":"skills/foo/SKILL.md","skillFolderHash":"%s","updatedAt":"%s"}}}' "$1" "$2"
}
lock "$HASH" 2026-10-29T00:00:00Z > "$FIXTURE_LOCK"
sed '/^main() {/,$d' scripts/deploy.sh > "$T/functions"
sed -n '/^layer_skills() {/,/^layer layer_skills/p' scripts/deploy.sh > "$T/skills"
cat > "$T/run" <<'SH'
set -euo pipefail
source "$HARNESS/functions"
CHECK="$MODE"; SRC="$FIXTURE_REPO"; WORKDIR="$HARNESS/work"
CLONE_TRACKED="$LAYOUT"; DEPLOYED_SHA="$($REAL_GIT -C "$SRC" rev-parse HEAD)"
source "$HARNESS/skills"
echo 'PASS [after-skills] dispatcher continued'
exit "$CHECK_RC"
SH
reset_fixture() {
  export HOME="$T/home" DEPLOY_LOG="$T/deploy-log"
  unset SKILLS_GLOBAL_LOCK
  rm -rf "$HOME" "$T/work"
  mkdir -p "$HOME/.agents/skills/foo" "$HOME/.claude" "$T/work"
  cp "$T/payload/SKILL.md" "$HOME/.agents/skills/foo/SKILL.md"
  ln -s ../.agents/skills "$HOME/.claude/skills"
  printf '{"timestamp":"2026-10-20T00:00:00Z"}\n' > "$DEPLOY_LOG"
  lock 1111111111111111111111111111111111111111 2026-10-01T00:00:00Z > skills-lock.json
  cp "$FIXTURE_LOCK" "$HOME/.agents/.skill-lock.json"
  : > "$SHIM_LOG"
}
run() {
  local rc=0
  MODE="$1" LAYOUT="$2" FAIL_STEP="${3:-}" "$REAL_BASH" "$T/run" > "$T/output" 2>&1 || rc=$?
  echo "skills run: mode=$1 clone-tracked=$2 step=${3:-none} exit=$rc"
  cat "$T/output"
  RC="$rc"
}
snap() {
  python3 - "$HOME" "$FIXTURE_REPO" <<'PY'
import hashlib, os, stat, sys
for root in sys.argv[1:]:
    for base, dirs, files in os.walk(root):
        for name in sorted(dirs + files):
            p = os.path.join(base, name)
            s = os.lstat(p)
            value = os.readlink(p) if stat.S_ISLNK(s.st_mode) else (
                hashlib.sha256(open(p, 'rb').read()).hexdigest() if stat.S_ISREG(s.st_mode) else '')
            print(p, s.st_mode, s.st_mtime_ns, value)
PY
}
fail=0
assert() { if "$@"; then return; else echo "FAIL assertion: $*"; fail=1; fi; }
check_stale() {
  snap > "$T/before"
  run 1 "$1"
  snap > "$T/after"
  assert test "$RC" = 1
  assert grep -q '^FAIL \[skills\]' "$T/output"
  assert grep -q 'upgrade -g -y' "$T/output"
  assert grep -q '^PASS \[after-skills\]' "$T/output"
  assert cmp -s "$T/before" "$T/after"
  assert test ! -s "$SHIM_LOG"
  echo 'check snapshot: HOME + repo unchanged'
}
for layout in 0 1; do
  reset_fixture
  check_stale "$layout"
  run 0 "$layout"
  assert test "$RC" = 0
  assert grep -q '^PASS \[skills\]' "$T/output"
  assert grep -q '^PASS \[after-skills\]' "$T/output"
  printf 'upgrade\nsync\ncommit\npush\nrecheck\n' > "$T/expected"
  assert cmp -s "$T/expected" "$SHIM_LOG"
  echo "repair order: $(tr '\n' ' ' < "$SHIM_LOG")"
done
reset_fixture
lock 1111111111111111111111111111111111111111 2026-10-01T00:00:00Z > skills-lock.json
cp skills-lock.json "$HOME/.agents/.skill-lock.json"
check_stale 0
run 0 0
assert test "$RC" = 0
assert cmp -s "$T/expected" "$SHIM_LOG"
for step in auth upgrade clone sync commit push recheck; do
  reset_fixture
  run 0 0 "$step"
  assert test "$RC" != 0
  assert grep -q "^FAIL \[skills\].*step=$step" "$T/output"
  assert test "$(grep -c '^PASS \[after-skills\]' "$T/output")" = 0
  case "$step" in
    auth) : > "$T/stopped" ;;
    upgrade|clone) printf 'upgrade\n' > "$T/stopped" ;;
    sync) printf 'upgrade\nsync\n' > "$T/stopped" ;;
    commit) printf 'upgrade\nsync\ncommit\n' > "$T/stopped" ;;
    push) printf 'upgrade\nsync\ncommit\npush\n' > "$T/stopped" ;;
    recheck) cp "$T/expected" "$T/stopped" ;;
  esac
  assert cmp -s "$T/stopped" "$SHIM_LOG"
done
reset_fixture
cp "$FIXTURE_LOCK" skills-lock.json
for mode in 0 1; do
  run "$mode" 0
  assert test "$RC" = 0
  assert test ! -s "$SHIM_LOG"
done
[ "$fail" = 1 ] || echo 'deploy-check OK (read-only, repair order, both layouts, both stale-pin entries, step failures, layer-ok)'
exit "$fail"
