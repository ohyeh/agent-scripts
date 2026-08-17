# Rules Kernel Efficiency v1

Goal: reduce Codex context and repeated-load cost without weakening the global
enforcement interface.

## Scope

1. Pin `scripts/deploy.sh` downloads to the SHA resolved before download.
2. Make zero router-adoption matches a valid `0`, not a shell failure.
3. Prepare an exact proposed diff for the global kernel and dispatch chain.
4. Prepare the minimum model-dispatch and judgment-rubrics fixtures.
5. Leave the outcome-ledger storage model unchanged pending a separate decision.

## Success criteria

- Deploy source resolution fails closed and the archive URL contains the resolved SHA.
- `check-router-adoption.sh` exits 0 and reports zero when a time window has no routed sessions.
- The proposed global diff preserves the complete
  `trigger -> MUST read -> receipt -> missing receipt invalid` chain.
- Routed content uses existing modules before adding any new rule file.
- Compression is judged by enforcement/interface semantics, not a token quota.
- Global/rules semantic edits remain unapplied until the user approves the exact diff.

## Defaults and blindspots

- Blindspot: `local-only` versus `tracked-but-redacted` ledger is unresolved.
  Default: do not change the ledger in v1.
- Blindspot: Claude and Codex have different prompt/cache economics.
  Default: optimize the shared interface without promising equal runtime savings.
- Blindspot: behavioral eval runner does not exist.
  Default: add only one positive and one negative fixture for each of the two
  highest-frequency gates; do not build a general runner in v1.

## Gate receipts

GATE: ~/.agents/rules/maintenance.md §1 — "| Other `rules/*.md` | Fix objectively broken paths/commands (verify first, log it in lessons.md) | Any semantic change — show the exact diff, wait for approval |" | this task: model-dispatch and judgment-rubrics changes stay proposed until their exact diff is approved.

GATE: ~/.agents/rules/maintenance.md §1 — "| Global files (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`) | Nothing | Everything (edit BOTH in the same change; `Version:` lines must stay identical) |" | this task: repo-canonical global/AGENTS.md and global/CLAUDE.md remain unchanged until the exact paired diff is approved.

## Verification

- `bash -n scripts/deploy.sh scripts/check-router-adoption.sh`
- A stubbed deploy-source check proves SHA resolution precedes the pinned archive request.
- A zero-window router-adoption check exits 0 and prints both result rows.
- `node scripts/check-rules-invariants.mjs`
- `bash scripts/check-canary.sh`
- `git diff --check`
