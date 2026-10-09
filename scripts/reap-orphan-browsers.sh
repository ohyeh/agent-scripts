#!/bin/bash
# reap-orphan-browsers.sh — Mac side of owner's 10-08 rule 「不管哪一台 agent-browser 用一用都不關」.
# box has the same reap inside ~/bin/box-supervise-loop.sh; the Mac has no supervisor, so launchd
# runs this every 10 min (ops/com.ohyeh.reap-orphan-browsers.plist).
#
# On macOS every GUI app has ppid 1, so "parent gone" alone would hit the owner's own Chrome.
# A process is reaped only when ALL of: ppid 1, older than REAP_MIN_AGE_S (default 1800), and
#   - an agent-browser / playwright daemon with no live child process, or
#   - a Chrome/Chromium main process (no --type=) launched for automation: --headless, or a
#     --user-data-dir under agent-browser / playwright / puppeteer / a temp dir.
# The owner's normal Chrome (no --headless, profile in ~/Library/Application Support) never matches.
# Usage: reap-orphan-browsers.sh [--dry]   (--dry prints candidates, kills nothing)
set -u
MIN_AGE="${REAP_MIN_AGE_S:-1800}"
LOG="${REAP_LOG:-$HOME/Library/Logs/reap-orphan-browsers.log}"
PS_CMD="${REAP_PS_CMD:-ps -axo pid=,ppid=,etime=,rss=,args=}"

candidates() { # pid age_s rss_mb args
  $PS_CMD | awk -v min="$MIN_AGE" '
    function secs(e,  d, n, p, s) { d = 0; if (e ~ /-/) { split(e, p, "-"); d = p[1]; e = p[2] }
      n = split(e, p, ":"); s = (n == 3) ? p[1]*3600 + p[2]*60 + p[3] : p[1]*60 + p[2]; return d*86400 + s }
    { pid[NR]=$1; ppid[NR]=$2; age[NR]=secs($3); rss[NR]=$4; a=""; for (i=5;i<=NF;i++) a=a" "$i; args[NR]=substr(a,2); kids[$2]++ }
    END { for (i=1;i<=NR;i++) {
      if (ppid[i] != 1 || age[i] <= min || args[i] ~ /--type=/) continue
      daemon = args[i] ~ /agent-browser|playwright[^ ]*(daemon|server|run-driver)/ && args[i] !~ /[Cc]hrom/
      chrome = args[i] ~ /(Google Chrome|Chromium|chrome-mac|chrome-headless-shell|chromium)/ && \
               (args[i] ~ /--headless/ || args[i] ~ /--user-data-dir=[^ ]*(agent-browser|playwright|puppeteer|\/T\/|\/tmp\/)/)
      if ((daemon && !kids[pid[i]]) || chrome) printf "%s %d %d %s\n", pid[i], age[i], rss[i]/1024, substr(args[i],1,120) } }'
}

list=$(candidates)
if [ "${1:-}" = "--dry" ]; then printf '%s\n' "$list" | sed '/^$/d'; exit 0; fi
[ -n "$list" ] || exit 0
mkdir -p "$(dirname "$LOG")"
while read -r pid age rss args; do
  kill -TERM "$pid" 2>/dev/null || continue
  for _ in 1 2 3 4 5; do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
  kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null
  echo "$(date '+%F %T') reaped pid=$pid age=${age}s rss=${rss}MB $args" >> "$LOG"
done <<< "$list"
