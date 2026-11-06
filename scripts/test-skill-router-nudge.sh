#!/usr/bin/env bash
# Regression test for .agents/hooks/skill-router-nudge.sh: long and pasted
# prompts match on the owner's own words; teammate/system rows stay skipped.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$ROOT/.agents/hooks/skill-router-nudge.sh"
WORK="$(mktemp -d -t skill-router-nudge.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
export HOME="$WORK/home" XDG_DATA_HOME="$WORK/data"
mkdir -p "$HOME/.agents/skills/zzdemo"; : > "$HOME/.agents/skills/zzdemo/SKILL.md"
printf 'zzkeyword\tskill\tzzdemo\n' > "$WORK/table.tsv"
export SKILL_ROUTER_TABLE="$WORK/table.tsv"
pass=0
fail() { echo "FAIL: $1" >&2; exit 1; }
ok() { pass=$((pass + 1)); }

run() { jq -cn --arg p "$1" '{prompt:$p,session_id:"s1"}' | bash "$HOOK"; }
hit() { grep -q 'owned by skill zzdemo' <<<"$1"; }
pad="$(printf 'filler words %.0s' $(seq 1 60))"   # 780 chars
long="$(printf 'filler words %.0s' $(seq 1 160))"  # 2080 chars
blob="<pasted_content id=\"ab12\">
zzkeyword inside a paste
</pasted_content id=\"ab12\">"

out="$(run 'please zzkeyword this')"; hit "$out" && ok || fail "short prompt: expected hit"
out="$(run "zzkeyword $pad")"; [ "${#pad}" -gt 400 ] && hit "$out" && ok || fail ">400-char prompt: expected hit"
out="$(run "$blob
$pad")"; [ -z "$out" ] && ok || fail "keyword only inside <pasted_content>: expected silence"
out="$(run "$blob
my own zzkeyword words")"; hit "$out" && ok || fail "owner words beside a paste: expected hit"
out="$(run "/repo/zzkeyword.md is broken")"; hit "$out" && ok || fail "prompt starting with /: expected hit"
out="$(run '<teammate-message>zzkeyword</teammate-message>')"; [ -z "$out" ] && ok || fail "teammate row: expected silence"
out="$(run '<task-notification>zzkeyword</task-notification>')"; [ -z "$out" ] && ok || fail "system tag row: expected silence"
out="$(run 'Another Claude session said zzkeyword')"; [ -z "$out" ] && ok || fail "other-session row: expected silence"
out="$(run "$long zzkeyword")"; hit "$out" && fail "keyword past char 2000 must not match" || ok
[ "$(wc -l < "$XDG_DATA_HOME/agent-hooks/skill-router-stats.jsonl")" -eq 4 ] && ok || fail "stats log: expected 4 rows"

echo "skill-router-nudge: $pass checks passed"
