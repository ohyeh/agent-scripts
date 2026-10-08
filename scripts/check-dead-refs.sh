#!/usr/bin/env bash
# Fail when live guidance names a retired skill, agent, or command.
# Scope: kernel (global/*.md), routed rules,
# skills/*/SKILL.md and skills/*/references/*.md. Blockquote lines (`>`) are
# evidence quotes and are skipped.
# ponytail: static name list; when a skill/agent/command is retired, add its
# name here in the same change (git history is absent in tarball deploys).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Retired from skills-lock.json (git history, 2026-10-01) + names the
# 2026-10-01 remote-44 audit found referenced but never defined.
RETIRED='brainstorming canary-source-proof design-taste-frontend git-commit
high-end-visual-design image-to-code imagegen-frontend-mobile
imagegen-frontend-web karpathy-guidelines migrate-to-shoehorn pierre-guard
refactor release-plannotator resolving-merge-conflicts review-renovate simplify
update-deps wait-what edit-article tmux-delegate diagnose bro
design-consensus'
files=$(ls "$ROOT"/global/*.md "$ROOT"/.agents/rules/*.md "$ROOT"/skills/*/SKILL.md \
  "$ROOT"/skills/*/references/*.md 2>/dev/null)
fail=0
for n in $RETIRED; do
  case "$n" in
    *-*) re="(^|[^[:alnum:]_-])${n}([^[:alnum:]_-]|\$)" ;;  # hyphenated: whole token
    *)   re="(\`/?${n}\`|(^|[[:space:](])/${n}\b)" ;;      # single word: backticked, or a /command
  esac
  hits=$(grep -nE "$re" $files | grep -vE '^[^:]+:[0-9]+:[[:space:]]*>' || true)
  [ -n "$hits" ] && { printf '%s\n' "$hits" | sed "s|$ROOT/||; s|^|dead-ref $n: |"; fail=1; }
done
[ $fail -eq 0 ] && echo "dead-refs OK ($(echo $RETIRED | wc -w | tr -d ' ') retired names)"
exit $fail
