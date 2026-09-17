#!/usr/bin/env bash
# Fleet skill-usage report: which skills in skills-lock.json are actually invoked,
# and how far the workflow loop (plan→gate→build→audit→triage) gets, per host.
# Run BEFORE adding or retiring a skill; do not prune from memory.
#
# usage: scripts/skill-usage-report.sh [host ...]      host = 'local' or ssh destination
#        (default: local)
# Remote hosts need node + rg on PATH; the scanner is streamed over ssh, nothing is installed.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
SCAN="$HERE/lib/skill-usage-scan.mjs"
LOCK="$HERE/../skills-lock.json"
HOSTS=("$@"); [ ${#HOSTS[@]} -eq 0 ] && HOSTS=(local)
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

for h in "${HOSTS[@]}"; do
  if [ "$h" = local ]; then node "$SCAN" > "$TMP/$h.json" 2> "$TMP/$h.err" || echo "FAIL [$h] $(tail -1 "$TMP/$h.err")" >&2
  else ssh -o BatchMode=yes -o ConnectTimeout=15 "$h" 'export PATH=$PATH:/opt/homebrew/bin:/usr/local/bin; cat > /tmp/skill-usage-scan.mjs && node /tmp/skill-usage-scan.mjs' < "$SCAN" > "$TMP/$h.json" 2> "$TMP/$h.err" || echo "FAIL [$h] $(tail -1 "$TMP/$h.err")" >&2
  fi &
done
wait

node - "$LOCK" "$TMP" "${HOSTS[@]}" <<'EOF'
const fs = require('fs'), path = require('path');
const [lockPath, tmp, ...hosts] = process.argv.slice(2);
const lock = Object.keys(JSON.parse(fs.readFileSync(lockPath, 'utf8')).skills);
const R = hosts.map(h => { try { return { h, d: JSON.parse(fs.readFileSync(path.join(tmp, h + '.json'), 'utf8')) }; } catch { return { h, d: null }; } });
const pad = (s, n) => String(s).padEnd(n);
console.log('== corpus'); for (const { h, d } of R) console.log(`  ${pad(h, 20)} ${d ? `${d.sessions} sessions (${d.mainSessions} main) @ ${d.host}` : 'NO DATA'}`);
console.log('\n== Skill() sessions per host (skills-lock only)');
console.log('  ' + pad('skill', 36) + hosts.map(h => pad(h, 12)).join('') + 'total');
const rows = lock.map(s => { const per = R.map(({ d }) => d?.skillSessions?.[s] || 0); return { s, per, t: per.reduce((a, b) => a + b, 0) }; }).sort((a, b) => b.t - a.t);
for (const r of rows) console.log('  ' + pad(r.s, 36) + r.per.map(n => pad(n, 12)).join('') + r.t);
console.log(`\n  zero everywhere (${rows.filter(r => !r.t).length}/${lock.length}): ` + rows.filter(r => !r.t).map(r => r.s).join(', '));
console.log('\n== workflow loop (main sessions)');
for (const { h, d } of R) { if (!d) continue; const L = d.loop;
  console.log(`  [${h}] ${L.sessions} sessions touch a station · stations ${JSON.stringify(L.stations)} · channels ${JSON.stringify(L.channels)}`);
  for (const [k, n] of Object.entries(L.sequences).sort((a, b) => b[1] - a[1])) console.log(`      ${n}\t${k}`); }
EOF
