# Maintenance Protocol for the Rules System

- Dedicate each agent-scripts session to kernel, rules, skills, hooks, and deployment work.
- Coordinate only with its counterpart: local `~/github/agent-scripts`, .44 `~/git/agent-scripts`.
- Do not contact or manage other projects' sessions or workers without the user's assignment.
- This §1 matrix alone sets edit rights for routed rules, both global files, and installed skills.
- If the applicable permission is unclear, use the stricter row.

## §1 Edit permission matrix

- Model-dispatch §1 values: update after a live schema or `/model` check; quote it in the commit.
- Model-dispatch §2–§7 contracts or ladder: use the approval path below.
- Other rules: fix verified broken paths or commands; quote the check in the commit message.
- Semantic rule changes: settle the exact diff with advisor and a second-model reviewer.
  Use judgment-rubrics §3; apply and report the diff and who agreed in the same turn.
- Companion letter and runbook: fix verified broken facts or paths with evidence in the commit.
  Content changes use the semantic rule approval path.
- Backlog rows (§3): add freely; ask the user before closing a row as dropped.
- Global files: get approval for every edit; change both files together with identical `Version:`.
  Keep iron laws only; the solid edition stays under 200 lines (kernel §Editing this file).
  Keep `global/kernel-lean.md` terse by review, without a hard character cap.
  `WEB-AGENTS.md` fetches the lean edition for network-only agents; route detail to rules.
  Preserve imperative force when compressed, including prohibitions and approval requirements.
- Installed skills, including plugin skills: get approval of the exact diff before any edit.
- `~/.claude/settings.json` and plugins: get approval for every change; keep the current set.
- Hooks and gates: use the semantic rule approval path for edits or eligible new gates (§2).
- `.workflow/*` task artifacts: write freely.
- Show the exact old→new text and the trigger when proposing an edit.
- For user approval rows, stop before applying.
- For consensus rows, apply after consensus and report.
- Quote the saved pre-edit file; if unavailable, say so instead of treating HEAD as the original.
- Before changing a rule with a cited lesson, evidence note, or commit, read that source.
  Check that the change cannot reopen the failure.
- After a violation, name the controlling rule and action; correct the action or claim first.
- Use the §1 approval path for enforcement only for two verified repeats after a clear rule,
  an explicit user request,
  or one incident whose repeat risks a hard-stop boundary, security, privacy, or data loss.
- Cite the incidents and state false-positive and false-negative limits for enforcement.
- Treat enforcement as a supplement to compliance, never an excuse for the violation.

## §2 Friction → a gate, a backlog row, or nothing

- Do not keep a free-text lesson list.
- Act in the same turn after one user correction, two repeats, a fact that contradicts rules,
  a delegation failure a check could catch, or a change in model or tool availability.
- Pick exactly one outcome: gate, rule fix, backlog row, or nothing.
- Gate: add a hook or check in `.agents/hooks/` or `scripts/` that fails on the bad case.
  Apply §1 eligibility and each touched file's approval path.
  Retire or merge one gate or rule paragraph in that commit unless the user names the addition.
- Rule fix: propose the exact diff under §1; close its local pending row in the same turn (§3).
  Close another host's row through retro §6.5 (row collection).
- For kernel fixes, follow its Editing this file standard before feedback.
  Put a fix that breaks that standard in a routed file or hook.
- Backlog row: use §3 when enforcement is worthwhile but no gate exists.
- Nothing: use for one-off trivia, project detail, or behavior already covered; cite `file:line`.
  Put project detail in project notes; fix a failed existing rule or gate in place.
- For repeated errors, try data flow, types, or interfaces first; then local lint or tests;
  then a skill or rule fix; use human review last.
- Build no speculative platform or cloud CI; GitHub Actions remain banned.

## §3 Backlog row format

- Put one row per `<UTC>-<slug>.md` in `~/.agents/retro-inbox/pending/`; create the directory.
- Set YAML frontmatter `kind: proposal` and use this body format:
  `YYYY-MM-DD | friction (evidence) | file to change | acceptance + one negative case`.
- Name the target file and a case that fails before the fix; otherwise the row is invalid.
- Retro §6.5 collects all hosts' pending files over SSH, moves them to `done/`, and drains
  them into `next-week-backlog.md`.
- Close a row as a gate or rule fix with a commit sha, or as dropped with user approval (§1).
- In the fix turn, append `closed: <sha> <file:line> (<date>)` and move the row to `done/`.
  Do this on the host that holds it; retro §6.5 uses the same checks for other hosts.
- Close duplicates with the kept row's filename.
- For other closures, find the earliest commit that adds the cited text with `git log -S`.
  Its date must be on or after the row's date; fix an older failed rule in place (§2).
  Skip this date check only if an older rule or gate already met acceptance (§2 Nothing).
- Quote a passing run of the row's negative case with the fix.
- Cite live `file:line` evidence for every acceptance clause.
- Move a file with several rows only after all close; split open rows into pending files first.
- Put product friction in that repo's backlog.
- Put reusable facts in `~/.agents/shared-memory-inbox/` (retro §6.5).

## §4 Size limits and pruning

- Govern growth of rule files by review, without a byte budget; the kernel keeps its 200-line limit.
- Do not trim unrelated rules to fit additions or reflow text to evade review.
- Keep `~/.claude/CLAUDE.md` to an index and hard rules; route detail through one line.
- Treat `Version:` as a policy edition, not a drift signal.
- Check provenance with `scripts/check-deploy-drift.sh` against `deploy-log.jsonl`.
- Check content with full-file comparison; neither drift check replaces the other.
- About monthly or every 50 sessions, run `/insights` and `/doctor` where available.
- In that review, close all open rows with the user, turn confirmed friction into gates or fixes,
  prune rules that no longer help, and propose a `Version:` bump under §1.
- Before changing a costly rule, compare the same task, snapshot, and model with and without it.
  Record cost and acceptance differences; never experiment on deployed config.
- A temporary rule states its removal condition in the same sentence.
- On the first session each quarter, recheck model-dispatch §1 and run any outstanding review.

## §5 Canonical home & multi-device discipline

- Use public agent-scripts `.agents/rules/` as canonical; deploy copies to `~/.agents/rules/`.
- Both runtimes read deployed rules on demand through the global routing table.
- Deploy rules with `rsync -a --delete <repo>/.agents/rules/ ~/.agents/rules/`.
- Keep no machine-local files there; `--delete` removes files absent from the repo.
- After a system change, search all rules and global files for old tokens and fix them together.
- Periodically diff both native global files against repo `global/` in full.
- Give every skill named by global files or rules a fleet `skills-lock.json` entry.
- Treat every `skills update`-family command as a mutation; never pass it `--help`.
- Keep global sources in repo `global/`; deploy byte-identical native files to
  `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` with the same `Version:`.
- Do not symlink global files or store them under `~/.agents/rules/`.
- Match each machine's rule and global-file md5 values against the corresponding repo paths.
- Before deployment, pass `node scripts/check-rules-invariants.mjs`.
- After deployment, check that a new session reply ends with `✈`, unless its format fixes the end.
- To provision a new machine, follow `rules/agent-environment-provisioning.md`.
