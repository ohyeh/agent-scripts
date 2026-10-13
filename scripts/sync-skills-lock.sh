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
# differs from the repo or that the repo does not have (upgrade or add -g). An
# older difference is the repo moving (a new pin, or a skill retired upstream):
# deploy.sh installs or removes it, and this script leaves it alone.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
R="$ROOT/skills-lock.json"
G="${SKILLS_GLOBAL_LOCK:-$HOME/.agents/.skill-lock.json}"
LOG="${DEPLOY_LOG:-$HOME/.local/state/agent-scripts/deploy-log.jsonl}"
[ -f "$G" ] || { echo "skills-lock: no installed lock at $G, nothing to compare"; exit 0; }
last="$(tail -n 1 "$LOG" 2>/dev/null | jq -r '.timestamp // empty' 2>/dev/null || true)"
[ -n "$last" ] || { echo "skills-lock: no deploy log at $LOG, nothing can be local"; exit 0; }

newer="$(jq -r --slurpfile g "$G" --arg last "$last" '
  .skills as $r | $g[0].skills | to_entries[]
  | select((.value.updatedAt // "") > $last
           and ($r[.key] == null or $r[.key].skillFolderHash != .value.skillFolderHash))
  | .key' "$R")"

if [ -z "$newer" ]; then echo "skills-lock: in sync with installed"; exit 0; fi
if [ "${1:-}" = --check ]; then
  echo "skills-lock: installed is newer than the lock for: $(echo $newer)"
  exit 1
fi

out="$(jq --slurpfile g "$G" --arg list "$newer" '
  reduce ($list | split("\n")[] | select(length > 0)) as $k (.; .skills[$k] = $g[0].skills[$k])' "$R")"
if [ "$(jq -S . <<<"$out")" = "$(jq -S . "$G")" ]; then
  cp "$G" "$R"              # same content: keep the CLI's exact bytes (README: cmp is the check)
else
  printf '%s' "$out" > "$R" # the repo file has no trailing newline
fi
echo "skills-lock: synced from installed: $(echo $newer)"
