# Sourced by subagent-concurrency-gate.sh and subagent-ledger.sh: one mkdir lock
# per session state dir, so check-and-reserve and pending→live are atomic.
# A lock older than 10 s is treated as left by a killed hook and taken over.
ledger_lock() {
  local d="$1/.lock" i=0 ts
  until mkdir "$d" 2>/dev/null; do
    ts="$(cat "$d/ts" 2>/dev/null || echo 0)"
    # ts missing = holder died between mkdir and write; take over after ~3 s.
    if { [ "$ts" != 0 ] && [ $(( $(date +%s) - ts )) -gt 10 ]; } || { [ "$ts" = 0 ] && [ "$i" -ge 60 ]; }; then rm -rf "$d"; continue; fi
    i=$((i + 1)); [ "$i" -ge 100 ] && return 1
    sleep 0.05
  done
  date +%s > "$d/ts"
}
ledger_unlock() { rm -rf "$1/.lock"; }
