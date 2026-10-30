#!/usr/bin/env bash
# sync-skills-lock.sh direction: for a skill from this repo the tree decides, not timestamps
# (motions 2026-10-15). Fixture tree has no .git, like the deploy tarball.
cd "$(dirname "$0")/.." || exit 1
set -euo pipefail
fail=0
ok() { printf 'ok   %s\n' "$1"; }
bad() { printf 'FAIL %s\n' "$1"; fail=1; }

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/tree/scripts" "$T/tree/skills/foo"
cp scripts/sync-skills-lock.sh "$T/tree/scripts/"
echo '# foo' > "$T/tree/skills/foo/SKILL.md"
git init -q "$T/g"
git --git-dir="$T/g/.git" --work-tree="$T/tree" add -- skills/foo
TREE="$(git --git-dir="$T/g/.git" write-tree --prefix=skills/foo/)"
OTHER=1111111111111111111111111111111111111111
OLD=2222222222222222222222222222222222222222
echo '{"timestamp":"2026-10-10T00:00:00Z","sha":"x"}' > "$T/log"

entry() { printf '{"source":"ohyeh/agent-scripts","skillPath":"skills/foo/SKILL.md","skillFolderHash":"%s","updatedAt":"%s"}' "$1" "$2"; }
lock() { printf '{"version":3,"skills":{"foo":%s}}' "$(entry "$1" "$2")" > "$3"; }
run() { SKILLS_GLOBAL_LOCK="$T/g.json" DEPLOY_LOG="$T/log" bash "$T/tree/scripts/sync-skills-lock.sh" "$@" 2>&1; }

# stale lock: installed = tree, timestamps say nothing (installed older than the last deploy)
lock "$OLD" 2026-10-01T00:00:00Z "$T/tree/skills-lock.json"
lock "$TREE" 2026-10-02T00:00:00Z "$T/g.json"
if out="$(run --check)"; then bad "stale: exit 0 ($out)"
elif grep -q 'lock is stale.* foo' <<<"$out" && ! grep -q 'installed is newer' <<<"$out"; then ok "stale: reports lock stale"
else bad "stale: wrong message ($out)"; fi
run >/dev/null
if [ "$(jq -r .skills.foo.skillFolderHash "$T/tree/skills-lock.json")" = "$TREE" ] && run --check >/dev/null; then ok "stale: sync writes the tree hash, then in sync"
else bad "stale: sync did not converge"; fi

# local upgrade: installed ≠ tree, updated after the last deploy and after the lock
lock "$TREE" 2026-10-01T00:00:00Z "$T/tree/skills-lock.json"
lock "$OTHER" 2026-10-12T00:00:00Z "$T/g.json"
if out="$(run --check)"; then bad "newer: exit 0 ($out)"
elif grep -q 'installed is newer.* foo' <<<"$out" && ! grep -q 'stale' <<<"$out"; then ok "newer: reports installed newer"
else bad "newer: wrong message ($out)"; fi

# repo moved: installed is the old pin from before the last deploy → deploy's job, not a sync
lock "$TREE" 2026-10-09T00:00:00Z "$T/tree/skills-lock.json"
lock "$OLD" 2026-10-01T00:00:00Z "$T/g.json"
if out="$(run --check)"; then ok "repo moved: exit 0"; else bad "repo moved: exit 1 ($out)"; fi

# skill changed, lock not, nothing installed (b539ca1, W45-14): the tree alone fails it, sync fixes it
rm -f "$T/g.json" "$T/log"
lock "$OLD" 2026-10-01T00:00:00Z "$T/tree/skills-lock.json"
if out="$(run --check)"; then bad "no install: exit 0 ($out)"
elif grep -q 'lock is stale.* foo' <<<"$out"; then ok "no install: reports lock stale"
else bad "no install: wrong message ($out)"; fi
run >/dev/null
if [ "$(jq -r .skills.foo.skillFolderHash "$T/tree/skills-lock.json")" = "$TREE" ] && run --check >/dev/null; then ok "no install: sync writes the tree hash, then in sync"
else bad "no install: sync did not converge"; fi

# in a git repo the COMMITTED tree decides, not the working tree
git -C "$T/tree" init -q
git -C "$T/tree" add skills/foo
git -C "$T/tree" -c user.name=t -c user.email=t@t commit -q --no-verify --no-gpg-sign -m foo
echo '# edited, not committed' >> "$T/tree/skills/foo/SKILL.md"
if out="$(run --check)"; then ok "git: lock = committed tree passes, working edit ignored"; else bad "git: exit 1 ($out)"; fi
lock "$OLD" 2026-10-01T00:00:00Z "$T/tree/skills-lock.json"
if out="$(run --check)"; then bad "git: stale lock exit 0 ($out)"; else ok "git: stale lock vs committed tree fails"; fi

exit "$fail"
