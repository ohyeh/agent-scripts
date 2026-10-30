#!/usr/bin/env bash
# Copy skill pins from the installed global lock into this repo's skills-lock.json
# for every skill changed locally since this host's last deploy (`npx skills
# upgrade -g` or `add -g`). Without this, deploy.sh restores the repo lock and
# silently downgrades what the upgrade just installed (2026-10-13: wizard,
# diagram-design, impeccable, tmux-agent-tools).
#
# Usage: scripts/sync-skills-lock.sh           # rewrite skills-lock.json, print what moved
#        scripts/sync-skills-lock.sh --check   # exit 1 and list them, change nothing
# "Local" = an installed entry updated AFTER this host's last deploy, whose pin
# differs from the repo or that the repo does not have (upgrade or add -g), and
# that is newer than the repo's own entry (2026-10-13 mba: a 10-12 local upgrade
# was superseded by a 10-13 repo pin). Any other difference is the repo moving
# (a new pin, or a skill retired upstream):
# deploy.sh installs or removes it, and this script leaves it alone.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
R="$ROOT/skills-lock.json"
G="${SKILLS_GLOBAL_LOCK:-$HOME/.agents/.skill-lock.json}"
LOG="${DEPLOY_LOG:-$HOME/.local/state/agent-scripts/deploy-log.jsonl}"
# A skill from this repo has skillFolderHash = git tree hash of its folder in the commit (the
# skills CLI reads the folder's sha from the GitHub trees API). So for these skills the lock must
# equal the committed tree, whatever is installed (2026-10-18 W45-14: b539ca1 shipped skill edits
# with a stale lock, caught only by deploy after the push). The tree also tells which side moved,
# whatever the timestamps say (2026-10-15: using-grok-bot-app reported as "installed newer").
tree_hash() {
  # HEAD only when ROOT is the repo top: a tarball extracted inside another worktree must not
  # read that outer repo's HEAD.
  if [ -z "$(git -C "$ROOT" rev-parse --show-prefix 2>/dev/null || echo none)" ]; then
    git -C "$ROOT" rev-parse -q --verify "HEAD:$1"; return
  fi
  local g; g="$(mktemp -d)"   # release tarball: no .git, hash the extracted folder
  git init -q "$g"
  git -c core.excludesFile=/dev/null -c core.autocrlf=false --git-dir="$g/.git" --work-tree="$ROOT" add -- "$1" 2>/dev/null \
    && git --git-dir="$g/.git" write-tree --prefix="$1/"
  rm -rf "$g"
}
stale="" fix=""
while IFS=$'\t' read -r k dir hash; do
  t="$(tree_hash "$dir" || true)"
  [ -n "$k" ] && [ -n "$t" ] && [ "$t" != "$hash" ] && { stale="$stale $k"; fix="$fix$k"$'\t'"$t"$'\n'; }
done < <(jq -r '.skills | to_entries[] | select(.value.source == "ohyeh/agent-scripts")
  | [.key, (.value.skillPath | sub("/SKILL.md$"; "")), .value.skillFolderHash] | @tsv' "$R")

newer=""
last="$(tail -n 1 "$LOG" 2>/dev/null | jq -r '.timestamp // empty' 2>/dev/null || true)"
if [ ! -f "$G" ]; then echo "skills-lock: no installed lock at $G, nothing to compare"
elif [ -z "$last" ]; then echo "skills-lock: no deploy log at $LOG, nothing can be local"
else
  newer="$(jq -r --slurpfile g "$G" --arg last "$last" '
    .skills as $r | $g[0].skills | to_entries[]
    | select((.value.updatedAt // "") > $last
             and ($r[.key] == null or ($r[.key].skillFolderHash != .value.skillFolderHash
                                       and (.value.updatedAt // "") > ($r[.key].updatedAt // ""))))
    | .key' "$R")"
fi
local_only="$(comm -23 <(printf '%s\n' $newer | sort -u) <(printf '%s\n' $stale | sort -u))"
newer="$(printf '%s\n' $local_only $stale | sort -u)"

if [ -z "$newer" ]; then echo "skills-lock: in sync (committed tree, installed)"; exit 0; fi
if [ "${1:-}" = --check ]; then
  [ -z "$stale" ] || echo "skills-lock: lock is stale (skillFolderHash != committed tree) for:$stale"
  [ -z "$local_only" ] || echo "skills-lock: installed is newer than the lock for: $(echo $local_only)"
  exit 1
fi

g_src=/dev/null; [ -z "$local_only" ] || g_src="$G"   # no installed lock needed for a tree fix
out="$(jq --slurpfile g "$g_src" --arg list "$local_only" --arg fix "$fix" '
  reduce ($list | split("\n")[] | select(length > 0)) as $k (.; .skills[$k] = $g[0].skills[$k])
  | reduce ($fix | split("\n")[] | select(length > 0) | split("\t")) as [$k, $h]
      (.; .skills[$k].skillFolderHash = $h)' "$R")"
if [ -f "$G" ] && [ "$(jq -S . <<<"$out")" = "$(jq -S . "$G")" ]; then
  cp "$G" "$R"              # same content: keep the CLI's exact bytes (README: cmp is the check)
else
  printf '%s' "$out" > "$R" # the repo file has no trailing newline
fi
echo "skills-lock: synced (committed tree, installed): $(echo $newer)"
