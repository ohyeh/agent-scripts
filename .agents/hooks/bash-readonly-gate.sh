#!/usr/bin/env bash
# PreToolUse hook (Bash), attached via agent frontmatter `hooks:` to read-only
# agent definitions (global/agents/claude/explore-bounded.md). Grep/Glob are not
# exposed in this configuration, so Bash is such an agent's ONLY search path
# and this gate is its only write barrier: `disallowedTools` removes Write/Edit,
# but Bash still writes (measured 2026-09-04: `echo x > f` succeeded under
# disallowedTools AND permissionMode: plan, under `claude -p`).
# Exit 2 = deny, reason on stderr. Fails closed when jq is missing.
# ponytail: deny-list on command shape, not a shell parser. Fails closed on a
# regex containing '>' (rg "a>b" is denied) — acceptable for a locate lane.
# Upgrade path if a bypass shows up: allowlist per pipe segment keyed to the
# user's tool invariant (fd|rg|ast-grep|jq|yq|git log/show/diff/blame|cat|head|tail|wc|ls).
set -u
IN="$(cat)"
command -v jq >/dev/null 2>&1 || { echo "bash-readonly-gate: jq missing; denying Bash" >&2; exit 2; }
[ "$(printf '%s' "$IN" | jq -r '.tool_name // ""')" = "Bash" ] || exit 0
CMD="$(printf '%s' "$IN" | jq -r '.tool_input.command // ""')"
deny() { echo "read-only agent: $1 ($CMD)" >&2; exit 2; }

# 1. redirection: strip legitimate sinks (N>&M, >/dev/null) then deny any '>' left
STRIPPED="$(printf '%s' "$CMD" | sed -E 's/[0-9]*>{1,2}[[:space:]]*(&[0-9]+|\/dev\/null)//g')"
printf '%s' "$STRIPPED" | grep -qE '(^|[^<>])>{1,2}' && deny "file redirection is not allowed"

# 2. write-shaped utilities and interpreters in command position. Normalize
#    first: drop wrappers (sudo/env/command/exec/nohup/time/xargs) and absolute
#    dir prefixes, so `env python3`, `/usr/bin/python3`, `exec perl` all match.
NORM="$(printf '%s' "$CMD" | sed -E 's#(^|\||;|&&|\$\()[[:space:]]*((sudo|env|command|exec|nohup|time|xargs)[[:space:]]+)*(/[^[:space:]]*/)?#\1#g')"
printf '%s' "$NORM" | grep -qE '(^|\||;|&&|\$\()[[:space:]]*(find[[:space:]].*[[:space:]]-(delete|exec|execdir|ok)([[:space:]]|$))' \
  && deny "find with -delete/-exec is not allowed"
printf '%s' "$NORM" | grep -qE '(^|\||;|&&|\$\()[[:space:]]*(rm|mv|cp|tee|touch|mkdir|rmdir|chmod|chown|ln|truncate|dd|install|patch|sed[[:space:]]+-[a-zA-Z]*i|perl|python[0-9.]*|node|ruby|php|bun|deno|npm|npx|pnpm|yarn|pip[0-9]*|brew|ast-grep[[:space:]]+.*(-U|--update-all|-r|--rewrite)|sg[[:space:]]+.*(-U|--update-all|-r|--rewrite))([[:space:]]|$)' \
  && deny "write-shaped command or interpreter is not allowed"

# 3. git mutations
printf '%s' "$NORM" | grep -qE '(^|\||;|&&)[[:space:]]*git[[:space:]]+(add|commit|push|pull|merge|rebase|reset|checkout|switch|stash|cherry-pick|revert|rm|mv|clean|tag|branch[[:space:]]+-[dDm]|worktree[[:space:]]+(add|remove))([[:space:]]|$)' \
  && deny "git mutation is not allowed"
exit 0
