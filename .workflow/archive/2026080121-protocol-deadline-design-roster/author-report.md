# Progress: applying approved protocol/deadline/design-roster diff (started)

## Conclusion

- Applied only the approved protocol, deadline, and design-roster edits.
- `global/AGENTS.md:3,21` and `global/CLAUDE.md:3,21` carry the new version and exact-protocol payload rule; `cmp` confirms byte identity.
- `skills/delegation-templates/SKILL.md:117` adds the 120-second valid-result deadline rule.
- `skills/using-design-skills/references/design-roles.md:12-13,102` retains only installed Role 1 authorities and routes light-touch to `impeccable`.
- `skills/using-design-skills/implementation-notes.md:15` and `skills/using-design-skills/evals/evals.json:80` preserve the mutual-exclusion/eval meaning without `frontend-design`.

## Verification

- `node scripts/check-rules-invariants.mjs --accept` → exit 0; `24/24 passed`; updated required `evals/context-budget-baseline.json`.
- `node scripts/check-rules-invariants.mjs` → exit 0; `24/24 passed`.
- `git diff --check` → exit 0.
- `cmp -s global/AGENTS.md global/CLAUDE.md` → exit 0.
- `rg -n 'frontend-design' skills/using-design-skills` → exit 1; no matches.
- `jq empty skills/using-design-skills/evals/evals.json` → exit 0.

## Changed files

- Approved source files: `global/AGENTS.md`, `global/CLAUDE.md`, `skills/delegation-templates/SKILL.md`, `skills/using-design-skills/references/design-roles.md`, `skills/using-design-skills/implementation-notes.md`, `skills/using-design-skills/evals/evals.json`.
- Required invariant baseline: `evals/context-budget-baseline.json`.
- Run artifacts: `.workflow/2026080121-protocol-deadline-design-roster/author-report.md`, `.workflow/2026080121-protocol-deadline-design-roster/result.json`.

## Remaining limitations

- No commit, push, deploy, external state change, tmux session, delegation, runtime test, or owner/device UAT was performed, per scope.
