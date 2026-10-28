# Changelog

## agent-should-know 0.2.1

Owner 10-28: 「/asks 的版本 revert 啊」.

- **Reverted to the 0.1.8 code** (card relay and log only). 0.2.0's ledger, alignment hold and self-audit are gone. After a resume, the 0.2.0 band showed `log: /.local/state/agent-should-know/unknown/2026-10-28-.log` and `held: tamper:ledger · store-error:HooksError`. From then on it denied every non-read tool, even `rg` and `git log`. Owner messages, `/reload-plugins` and `/asks off` did not clear it. The version is 0.2.1, not 0.1.8, because `sync-mods.sh` keeps an installed version that is newer than the release.
- The settings Stop gate (`claim-evidence-gate.sh`) runs its audit branch only while `audit/active` exists, and 0.2.1 no longer writes that file.
- **Migration on a host that ran 0.2.0**: move every leftover `~/.local/state/agent-hooks/<sid>/audit/active` aside (for example into `~/.local/state/agent-scripts/asks-0.2.0-backup/<sid>/`). If one stays, that session's Stop gate asks for a self-audit verdict on every reply ("Self-audit … wrote no verdict"), and no mod will write it.

## grok-bot-watch 0.18.0

Owner 10-28: 「同理 grok bot watch … 也要一起看」.

- **A wake no longer waits for the long turn**: a wake was a plugin prompt, which runs only once the session is idle; in the 10-28 transcript scan (sol, argon) a reply that settled mid-turn waited up to 3.9 min. While the main loop's turn runs, the wake now parks and goes with the main loop's next tool result (`tool.call` `context`, origin engine only), once; a turn with no further tool call gets it as a prompt at its end, stamped `(ready HH:MM, delivered HH:MM: N min later)`. The tmux-agent mod's pattern (0.45). The `watch` tool texts say so. 2 tests.

## agent-should-know 0.2.0

Design: `.workflow/202610281332-claim-vs-reality-audit/` (base design plus `design-v3-delta.md`; sol r2/r3 reviews).

- **Owner ledger**: every message the owner types or sends from the phone is one row, kept whole, in `<day>-<sid8>.asks.jsonl`; a typed slash command is one row. A message from a peer, a plugin or the system is information, not an owner row. New rows wait in `$.state` with a pending count until the file write lands, so a resume reads coverage `unknown` when rows may be missing; rows read back from the transcript are `unconfirmed` and open no alignment duty (they stay in the audit and in `asks-open.md`; a correction made before the mod loaded gets no Retro). Neither lets an audit PASS until `/asks confirm`.
- **Alignment hold**: Haiku classifies each owner message (correction, directive, passive) against the agent's claims since the episode began. Until the agent writes the `U<n> 「…」 →` line or a `Retro U<n>:` block, only reading tools run; a Retro is checked by Haiku before the act, fail closed, and after 3 failures only the owner's `/asks release U<n>` lets it run (the episode cannot PASS). Reads are command shapes, not programs: `sed w`, `sort -o`, `git --output`, `rg --pre` hold, `rg -i` reads.
- **Self-audit at `turn.step`**: the main loop's final step is judged on `r.answer` verbatim (fork first, else the session's model with the episode's evidence whole, 60 s). The verdict goes to `~/.local/state/agent-hooks/<sid>/audit/<sha16>.json` for the settings Stop gate, bound to the generation at audit start; a late result is dropped. One JSON object; each finding is checked at its source; a PASS with a finding is UNKNOWN. Two FAIL rounds, then the reply relays each finding as `[audit] <id> <problem>` (REPORTED, held). `classic.Stop`, `classic.SessionStart` and `session.compact` hooks are gone: the runtime skips them for user mods.
- **Held**: the `audit/held` file (the gate's or the mod's) denies every tool that does not read, shown in red on the band, until the owner's own message. `asks-open.md` holds the open rows for the compaction hook; an edit to it, like one to the ledger or `audit/`, holds and is rewritten. `git blame` reads only with `--no-textconv`. A supersede quote is at least 4 characters. `/asks` prints the state; `/asks off` turns hold and audit off for the session.

## agent-should-know 0.1.8

- **The early card is whole and reaches the model**: sol and argon (10-28 review) found two gaps in 0.1.7. Another plugin's own `$.tool.call` also took the card, but its context reaches no model (`claude-code.d.ts:13595`); the hook now takes only the model's own calls (origin engine), as tmux-agent does. And mid-turn the agent read only the card's line: it now reads the explanation too. The queued prompt stays, so the logged verdict is still the answer to this card (argon's single delivery would log the long task's reply). Mid-turn delivery is no longer unconfirmed: this session received tmux-agent notices as `tool.call hook additional context`, and argon found `hook_additional_context` rows before the next model request in the transcripts.

## agent-should-know 0.1.7

Owner 10-28: 「他會被 queue 住 然後有可能長任務 送出已經不知道過多久了」.

- **A card no longer waits for the long turn**: the relay is a plugin prompt, which runs only once the session is idle, so in a long task the agent read the card long after it showed, without its age. Now, while a main turn runs, the card's line and time go to the agent with the main loop's next tool result (`tool.call` `context`), once. The queued prompt is kept for the explanation and the logged verdict, and says when the card was flagged.

## quick-say 0.4.0

Owner 10-23: 「你應該好好的去研究過往我 session 的發言、難處…要分有人在旁的發言 以及可能長時間不在長任務 loop or goal 的發言」; 「最笨就是讓 agy flash 每個 session 去研究說話以及遇到的問題」.

- **Two more combos from a per-session study**: agy-flash read 336 sessions one by one (all local, remote44 healthgo only, archives in, worker and headless runs out; every quote checked against the session file) and found 471 lost rounds. sol's earlier pass over a wider set of sessions points the same way. `5 接手` (start of a session: read the named handoff or the latest record, report in four lines, go on, never ask where the last session stopped) targets briefs that left the agent to guess. `7 離席照做` (the owner leaves: run the agreed plan to its acceptance, watch waits with a stall limit, stop only when done, blocked or a new approval is needed) targets long runs that stopped while the owner was away. `進度續跑` now asks for a four-line report. The keys are now 5-9 and 0; `收工` moved to 0.
- **Too narrow for six labels**: two rows of three when the band has room, else one row of cut labels.
- Not a combo's job: about 40% of the lost rounds went to work that missed the mark or was misread, and about 22% to rules or tools the agent should already follow. A button cannot carry the owner's deliverable, and a rule gap needs a rule or hook fix.

## quick-say 0.3.1

- **Combo texts from sol and agy**: both found the same four runs (sol, adjacent runs checked by hand: review 22 sessions, push 18, progress 16, wrap-up 5; agy, broader: 30 / 19 / 52 / 10). The four texts are sol's rewrites, which keep the limits the old ones broke: a plan-only task delivers the plan, deploy or reload only an authorized target, review fixes go back to the same reviewer for at most three rounds. `做完推送` adds agy's tests and pre-push check before a push.

## quick-say 0.3.0

Owner 10-23: 「你這選項怎來的…這樣我根本不知道你會發啥 然後就送出了」; 「很多時候花了兩三回合以上 都是同一件事 你不是該發現然後變成一個組合技嗎」; 「目前這樣只有表面能用 但沒真正改善我的痛點」.

- **Combos, not single phrases**: the owner's logs (sol and agy, independently: `.workflow/202610231450-quick-say-combos/`) show runs of 2-4 prompts on one thing: progress then 繼續 (52 sessions), review by sol + advisor until consensus (30), plan check then push (19), wrap-up (10). Four combos replace the five 0.1.0 phrases; `update title` is gone (not needed for the work).
- **A digit fills, it does not send** (0.2.0): the whole text goes into the prompt box; Enter sends it.
- **Follow-through**: at the end of a main-agent answer, a git gate (files this session edited and not committed, its commits not on the upstream) or a "shall I?" gate (the answer ends asking leave) sends one framed reminder that approves nothing; once per state, at most 2 in a row until the owner types. With no gate, `$.model.classify` picks the likely next combo and `$.prompt.suggest` shows its full text dim (Tab takes it). `[ ⚡ auto ]` and `/quick-say auto` turn it off; the header counts reminders. Bash-made edits are not tracked (README, Limits).

## session-recall 0.14.2

- **No `↩ quote` on a summary block**: the terminal draws the text between two tool calls as a summary (`isSummary`, a faint ` · summary`), and the transcript keeps the original, not the summary. Pressed there, `↩` could never find the reply and said "that reply is not among the answers kept (a reply still being written is added when it ends)", which never came true (owner screenshot 10-23: the block was a thinking summary). The button is now left off such blocks. 1 test; without the fix it fails.

## mods: types 2.1.309

- `mods/types/claude-code.d.ts` was written by 2.1.283 and lacked fields the engine already sends (`TurnStartInput.agentId`, `PromptSubmitArgs.asUser`, `AssistantMessage.isSummary`). Refreshed from 2.1.309; agent-should-know drops its `agentId` cast (no behavior change). `process.run` results now carry `isStdoutTruncated`/`isStderrTruncated`: the test mocks of agent-should-know, grok-bot-watch and session-recall add them.

## quick-say 0.1.0

Owner 10-23: 「很多時候 開始、結束 都說類似的話 交代而已」; 「幫我翻修過讓 agent 更看得懂、更明確」.

- **New mod** `mods/quick-say`: a band of five canned prompts. In an empty prompt, digits 5-9 send 開場 / 繼續 / 進度？ / 照做 / 收工 as the person's own words (`$.prompt.submit` with `asUser`), queued until the running turn ends. The phrases are the owner's most repeated prompts in the session logs (`update title` 12x first, the `/session-handoff … /shared-memory-intake` wrap-up 16x last, 繼續/順利？/處理啊 variants), each rewritten as one explicit instruction. Folded from the start, fold kept, `[ hide ]` until `/quick-say`, which also lists the phrases. Digits start at 5: the workers band numbers its rows from 1.

## using-grok-bot-app 1.1.0

- **`scripts/transcript.mjs <uuid> [port] [--tail N]`**: reads one bot's transcript tail without `agent-browser` (not installed on every Mac; session dc9d26c7 wrote CDP by hand for it, 10-22). It opens the bot, waits until the log text is not empty and two reads 250 ms apart agree (just after the click the log is empty: seen live), prints one JSON line, and opens the previous bot again unless another was opened meanwhile. It never types or sends. The restore and the CDP connection come from `send.mjs` (now exported as `restore` and `cdp`; the grok-bot-watch copy `bin/send.mjs` is synced by `scripts/sync-mod-core`, no behavior change there). SKILL.md Read names it as the default way; `agent-browser` is optional.

## agent-should-know 0.1.6

- **Placeholder paths pass scrub**: the README log sample and the tests used placeholder home paths under the macOS and Linux home roots, which `scripts/scrub.sh` flags as home paths (exit 1, a push blocker; W43 L2-3). The README now shows `~/github/…`, and the tests use `/h/me` as session-recall's tests do. No behavior change.

## session-recall 0.14.1

- **`↩ quote` on a reply not kept**: a reply of a turn still running (kept only at `turn.complete`) or one pushed out of the last 16 gave the toast "that reply is not among the answers kept" (owner screenshot 10-22, a turn waiting on a background agent). On a miss, `↩` now finds that one reply in `$.session.messages()` (the transcript so far) and adds only it, so the newest kept replies stay; `addAnswer` keeps one copy of a reply, so the same reply at `turn.complete` is not added twice (two copies made its excerpts name no place). 2 tests; without each fix the first fails.

## agent-should-know 0.1.5

- **A relay approves nothing**: the relay told the agent "if it holds, correct the work". In healthgo-mobile (10-20 09:54) the agent then made `gpt-6-astra` a code reviewer, a best-tier model that needs the user's approval (model-dispatch, 10-16). Seen by the built-in's next card. The relay now says: fix only within what the user already approved; a fix that needs approval (a model tier, a push, a deletion, a change of scope) is not made: name it and ask.

## agent-should-know 0.1.4

Owner 10-20: 「好像需要一個 pane 可以開啟 log 位置 然後計數 有幾筆 hands-up 發生在該 session」.

- **Band**: `▌agent should know v0.1.4 · N heads-up · M handled [ ⧉ log ][ ▾ fold ][ hide ]` above the prompt, by the band rules in `mods/README.md` (a band, as the other mods here, not a `Pane`). `⧉ log` opens the session's log; open, the band shows its path; folded from the start, the fold choice kept; `[ hide ]` until `/heads-up`, which also prints the count and path. Icons only when narrow. No hotkeys.
- **Count and file survive a reload**: the session's log path is kept in the store (`file:<sid>`); a start reads it back and counts its `flagged` and `handled` rows. A reload after midnight keeps writing the same file.
- **Card detection**: the band's texts are joined with a space. Before, an English card line ending in `.` with another plugin's row right after it ("summed.workers …") had no sentence end and was not seen.

## agent-should-know 0.1.3

Owner 10-20: 「這是原始完整的嗎」, on a relay that carried the card's line only; earlier 「系統的可以自動轉發成功 load more 版本」.

- **Learn more goes along**: the built-in writes the card's whole line and its Learn more explanation into its store file (`~/.claude/plugins/store/cc-plugin-you-should-know_builtin-*.json`, `sessions[].view`) when it shows the card. The relay now reads them there, so the agent gets both, quoted, and a two-sentence line is no longer cut. When the file cannot be read, the relay sends the line cut from the band and says why. Seen live 10-20 09:53 in healthgo-mobile: the stored explanation held the recommendation (another worker reviews stage 2) that the relayed line did not.

## agent-should-know 0.1.2

Owner 10-20: 「多 session 多 repo 並行時 這樣會混亂」; 「重點是每個 session 的要順序性看得出來 … 同 repo 多 session 可能時間性交錯」.

- **One log file per session, one folder per repo**: `~/.local/state/agent-should-know/<repo>/<day>-<sid8>.log`, headed by the repo, the full session id and its folder. Every row is `<UTC ISO time> · <sid8> · flagged · <line>` or `… · handled <card time> · <verdict>`, so a file reads in order and `cat <repo>/*.log | grep -v '^#' | sort` is the repo's timeline across sessions. Cause: one shared `log.md` took every session's rows in one list, a verdict written when its turn ended could land under another session's card, and two sessions writing at once could drop a row. The old `log.md` stays where it is; nothing reads it.

## agent-should-know 0.1.1

- **Verdict row**: the log took the answer of the main turn that ran when the card showed, not the agent's answer to the card. Cause: a plugin's `prompt.submit` carries no `turnId`, so the turn it is queued behind was not known. The mod now tracks the running main turn at `turn.start` and skips its end. Seen on the first live card (0.1.0, 10-20 06:46); the test now starts a turn before the card and asserts its answer is not logged.

## agent-should-know 0.1.0

Owner 10-20: 「每次一直複製貼上挺白痴的」; 「長任務下更像是 agent-should-know」; 「隔天醒來 我一眼就知道 可能發生了哪些偏差被校正」.

- **New mod** `mods/agent-should-know`: when the built-in `cc-plugin-you-should-know` shows an offer card, the mod submits the card's line to the main agent ("check it against the work; correct it or say why not"). A plugin's prompt waits for the running turn to end. The card is then hidden from the band. Each card is sent once; the last 20 lines are kept in the store, so a reload does not resend.
- **Log** `~/.local/state/agent-should-know/log.md`: one row per card (time, project folder, session id, line), then the main agent's answer (first 600 characters) when that turn ends.
- Limits: no API presses another plugin's button, so the built-in's Learn more is not run; the main agent's answer takes its place. Hiding is visual: the built-in keeps its view until two prompts a person typed clear it (the relay does not count) and runs no check meanwhile, so an unattended night logs the first card only. The line is cut out by its tag (`Heads up ·` / `You should know ·`) up to the first sentence end, so a two-sentence card keeps one sentence.

## delegation-templates: a brief never names result.json 2026-10-20

Owner 10-20: 「argon 剛才的通知和前面的結果重複」; 「統一預設多輪方式 … 每一 turn 分開 比較好吧」; consensus advisor + sol (r2 `VERDICT: CONSENSUS`).

- **Per-round result path**: a `tell` round gets a new result path on line 1 of its prompt. A brief or tell writes "the result's `summary` field", never "result.json". Cause: argon kept the first round's root `result.json` from a bare file name and wrote every round to both paths, so the collector sent one result twice. Paired with tmux-agent-tools (per-round "earlier round is closed" line; collector skips a byte-identical copy).

## model-dispatch best tier needs approval 2026-10-16

Owner 10-16: 「astra 濫用、亂用 害我 sol 用不了」; 「用 astra | fable | argon 要經過同意」; 「先問了 l2 也能正常用」.

- **Best tier asks first**: `fable` / `gpt-6-astra` / `gemini-4-argon` need the user's approval once per task, the L2 seat included; ask before the gate or recipe starts. A profile file on disk is not approval. A best-tier seat never takes implementation. Cause: an implement run on astra used up the Codex quota that sol shares, and the next sol review hit `quota_exhausted`.

## model-dispatch tiers and review ladder 2026-10-16

Owner 10-16: tiers decided on the hub model-tiers page, then 「可以 更新上去」.

- **IDs are floors**: §1 writes each model as "`<id>` or later" with a per-runtime column (Claude Code alias / Cursor / agy); a "—" cell means pick another runtime or a same-tier family.
- **Tiers** replace the cross-family table and Role tiers: best (fable / astra / argon, low/medium), better (opus / sol, medium+), exec, basic, cheap. Opus high/xhigh → best and sonnet xhigh/max → better stay a pending fallback until a §8 sweep passes. agy is backup only.
- **Review ladder**: L1 and TK run `sonnet` high (was medium); L1 adds agy flash 3.8 medium and Cursor grok 4.7 xhigh; L2 runs fable medium, else opus at `reviewEffort`. **No L3**: still blocking after L2 round 3 → stop and ask the user. The 2026-10-09 Codex step-up is withdrawn.
- Recipes: `plan-pipeline`, `spec-implement-dual-review-verify` (L2 fable → opus fallback, no L3); `consensus-gate` rejects `layer: 'L3'`. Tests: `test-plan-pipeline-ladder`, `test-review-gate-smoke.mjs`, `test-consensus-gate-ladder`.

## W43-3 deploy.sh --check and the deferred W43 rows 2026-10-16

Owner 10-16: 「所有你們討論後能做的就要做掉」 — the rows the W42 retro had deferred go in with W43-3.

- **W43-3** `scripts/deploy.sh --check`: the same layer checks with no write to `~`; exit 1 at the first layer that differs from the release. Rewritten files (settings.json, codex hooks.json / config.toml, agy plugin) are checked as fixpoints. Skips Layer 0 and the layers with no read-only check (agy statusline, codex-cu). Deploy and `--check` both end with `check-deploy-drift.sh`, which had no caller. `scripts/test-deploy-check.sh`: zero writes over 2,295 entries; one drifted pin → `[skills]` exit 1.
- **W43-7 root cause**: context-mode `hooks/pretooluse.mjs` self-heal rewrites `<config dir>/plugins/installed_plugins.json` (`lastUpdated = now`) whenever `$TMPDIR/context-mode-healed-<ver>` is absent — macmini had never run the hook (10-15). The drift probe now runs a throwaway copy of the plugin under `env -i` with a throwaway HOME and TMPDIR: the same self-heal also copies its own folder to a sibling found from the script's real path.
- **Lock direction** `sync-skills-lock.sh`: for this repo's skills the git tree hash decides; installed = tree ≠ lock reports "lock is stale" (was "installed is newer").
- **`--check` payload checks** (sol review): each locked skill must be installed, and every skill below a repo root must match its pinned tree hash; workflows compare the installer's full managed set and its manifest; mods fail on an unreadable registry or a registered version with no files at `installPath`.
- **W43-3b** skills CLI pinned to `skills@1.7.2` (deploy.sh, README); invariant `skills-cli-pinned`.
- **W43-3c** `scripts/sync-mods.sh [--check]`, deploy Layer 8b: an installed mod behind the release marketplace is updated, then re-read; a mod never installed is reported, not installed.
- **W43-4** `evals/retro-metrics/layer1-gaps.py`, `grok-bot-classes.py` (W42 scratch) in the repo; tmux dispatch briefs split from human (W42 window: 31 turns, $77.85 moved out of human). `recipe-usage-stats.sh` counts only inside `RECIPE_SINCE`; `ctx-usage-report.py` prints every row by default.
- **W43-5** grok-bot-watch replay keeps the last reply hash across a re-watch (one reply sent 3 times now counts resent 2). Offline tool only.
- **W43-18** claim gate: 還沒/尚未/未完成/not done are negative claims checked line by line; a label exempts its own line; a line naming a subject must find it in this turn's tool traffic. A background completion, plugin or peer message does not start a new turn. Replay on 62 real replies: 6 blocks (old gate 6).
- **W43-22** review-dispatch-gate covers Agent tool reviewers (W42: 71, 27 shopping): previous Agent reviewer BLOCK / no verdict in the same cwd → deny; the re-check is `SendMessage`. deploy moves the hook's matcher in place.

## W43-1 workflow agent cap 2026-10-16

New hook `.agents/hooks/workflow-agent-cap.sh`: at most 25 subagents per workflow run (owner 10-16: 「控制別太氾濫我沒意見」). W42 L2-2: one unattended night ran `design-vs-code-audit` with 33, 42 and 46 agents.

- Workflow agents never reach PreToolUse(Agent): the bol gate logged no row during the 10-10 runs, while SubagentStart wrote `workflow-subagent` markers. Claude Code 2.1.301 has no total cap; `CLAUDE_CODE_WORKFLOW_SIZE_WARNING_AGENTS` only warns (the `small` guideline, deployed 2026-10-09T16:31Z, stopped none of the 10-10/11 runs).
- PreToolUse(Workflow) starts a run key; SubagentStart with matcher `workflow-subagent` counts distinct `agent_id` under it. Above 25 it logs and exits 2.
- SubagentStart cannot cancel a launch: exit 2 puts the message into the new subagent's context, so agents 26+ each run one short turn and reply `CAPPED: W43-1 <run> agent <n>/25`. The run itself goes on.
- No run on record → count nothing, never deny. Two runs live at once in one session share the newer key (count runs high).
- One W42 `spec-implement-dual-review-verify` run had `agentCount` 26 (the report counted 22 transcript files), so the cap would have capped one of its agents.
- Stats: `~/.local/share/agent-hooks/workflow-agent-cap-stats.jsonl` (`start`, `counted`, `capped`, `no-run`; `agents` = count so far). Self-test `scripts/test-workflow-agent-cap.sh` (layer 0).

## W43-2 subagent count 2026-10-16

Three faults in the live-subagent count behind the concurrency cap (W42-1 showed 4 Agent calls in one message under a cap of 5 blocking the 4th; `evals/retro-metrics/2026-W42/evidence-w42-1/`).

- ① `subagent-lock.sh`: an empty `ts` (holder between `mkdir` and its write) read as age = epoch, so a second locker took the lock at once (reproduced: `rc=0 waited=0s`). Empty or non-numeric `ts` now means "not written yet": wait.
- ② `subagent-ledger.sh` no longer takes the lock. When the lock was busy, SubagentStart wrote the live marker but left its pending in place, so one subagent counted twice. It now writes the live marker first, then claims one pending by an atomic `mv` out of `pending/`: the count is briefly one high, never one low.
- ③ Leftover markers (14 on this host) belong to subagents of a process that died without SubagentStop. The ledger now also runs on SessionStart and clears `subagents/` and `pending/` on `startup|resume|clear`; `compact` keeps them (background subagents survive compaction).
- `scripts/test-subagent-gate-smoke`: new cases for each fault plus 6 concurrent calls x100 (`SMOKE_REPEAT`). Before the fix 5 cases failed (3 of 100 runs not exactly one blocked); after: `PASS subagent-gate-smoke`.
- Review fix (sol ckpt-a F1): with no lock in the ledger, the gate's `find "$LEDGER" "$PENDING"` could read live before a start and pending after it, and count one low (`observed=4 actual=5`). The gate now reads pending first; the smoke runs a start during the count in the gate's own order (`observed 6 >= 5`; the old order gives 4).
- Known, not changed: a waiter gives up after 5 s but takeover needs age > 10 s, so a dead lock with a `ts` makes gates skip the count for 5–10 s.

## scrub.sh default evidence dir 2026-10-16

`scripts/scrub.sh` with no `EVIDENCE_DIR` now makes a fresh `mktemp -d` outside the repo and prints `EVIDENCE_DIR=<path>` on stderr, instead of exit 1 before any scan. The same omission happened in two sessions (W42, W43). An evidence dir inside the repo still BLOCKs. Checked in a fresh clone: no args → `VERDICT: PASS` exit 0; `./ev-in` → exit 1.

## review-dispatch-gate 2026-10-16

New PreToolUse hook on `mcp__tmux-agent__assign` and `mcp__tmux-agent__tell` (owner: 「目前的確有審查氾濫＋reviewer shopping」; 「是否可以累積多一點有效率一起審 … 讓他們反問自己」). It enforces rules that already exist (judgment-rubrics §4 no reviewer shopping; model-dispatch §Review ladder: L2 cap 3 rounds, one full ladder per push checkpoint). Each deny is a question; one answer line lets the call through.

- Shopping: a new reviewer in the same session and dir while the previous reviewer has not returned PASS (a stopped one counts) → `tell` it, or add `LAYER:` (escalation) or `NEW SCOPE:`.
- Round cap: a `tell` to a reviewer that ran 3 rounds without PASS → advisor, then escalate with `LAYER: L3`, or stop and report.
- Batch question: the previous reviewer passed and commits are still unpushed → answer `BATCH: <what this review includes | why it cannot wait>`.
- A review brief names both `VERDICT: PASS` and `VERDICT: BLOCK`. Stats: `~/.local/share/agent-hooks/review-dispatch-stats.jsonl` (answers kept).
- No verdict: the previous reviewer is still running or exited without a report → wait or `peek`, or add `REDISPATCH: <why>` or `PARALLEL: <seat>`.
- Replay of this host's W42 workers in dispatch order: of 45 review dispatches, 16 followed a BLOCK reviewer with a fresh one (e.g. astra → sol → fable → astra → fable on one target) and 5 followed a reviewer with no verdict. Not covered: in-process Agent reviewers, other sessions, whether a review is needed. Known limit: every `tell` counts as a round.

## W43-6 / W43-9 / W43-10 rules 2026-10-16

Agreed by sol (round 2 `VERDICT: PASS`) and advisor; kernel unchanged (4.36.0).

- operator-defaults: tool lookup order (bundled or execution-location copy first, then `PATH`, report which); action checkpoint (unexpected result reported before diagnosis); a new ask during a review runs as its own round.
- judgment-rubrics: §4 cap also counts the same unmet expected result twice; §5 labels numbers measured or proxy, and a cause in a named app needs a probe there.
- session-titles: the rename and read-back run through `ctx_execute` (the context-mode hook redirects `curl` from Bash).
- model-dispatch: the commander reads the worker's diff before a second-model gate; for device UI work the commander relays only secrets and hard-stop steps.
- delegation-templates: IMPLEMENT gets device test-run matrix and prerequisites; REVIEW / VERIFY gets scope contract, callers, HARD, OWNER-ACCEPTED and a report file written as findings arrive.

## W42 close 2026-10-16

- Kernel 4.36.0-ironlaws, §Live truth: if something worked before but now fails, look up the method (skills, shared memory, run dirs, handoffs, past sessions) before you call it blocked or ask; treat it as a lead and, within approved scope, run it live and quote the result. Owner, W42: skills that worked keep "being forgotten".
- retro-agenda 1.14.0: §6.5 collects `retro-inbox/pending/` again before the report closes; §8 `updated.at` is the UTC at write time, and backlog states are checked again at close (unchecked ones stay, marked `UNCONFIRMED`).
- session-handoff: record the CLI and session ID when exactly one writer variable is present; otherwise mark the writer UNCONFIRMED. Record mistakes and corrections with evidence. Keep rule proposals in the retro inbox and name their files in the handoff. Resume reads recent relevant handoffs and the task's handoff chain, even when a previous session wrote them.

## grok-bot-watch 0.17.1

- `[ ▸ open ]` with no watch drew the same header as folded, so open looked like it did nothing (0.16.0). Open now adds one dim line that says what shows there and how to watch, as session-recall does; fold takes it away. Tested both ways, with the stored choice each time.

## grok-bot-watch 0.17.0

- `[ ✕ close ]` is back on the header when no watch is armed (`x`): it hides the band for this session only. The next watch or a bare `/grok-bot-watch` brings it back, and a new session shows it again. With a watch armed there is no close: an armed watch never leaves the screen. Fold (`f`) is unchanged and is not hide (rule 14). 0.16.0 removed close without being asked; the owner asked for it back.

## session-recall 0.14.0 · grok-bot-watch 0.16.0

Both bands are there from the session start, folded to their header line until opened.

- session-recall: the header shows from the start (`· nothing made yet` before the first asset). It starts folded; `[ ▸ open ]` shows the rows, and the choice is kept for the next sessions (`session-recall.fold` in the store). A folded band still lists the quotes in the prompt, since their `[ × ]` is how a quote leaves it. Unfolded with nothing made, one line says what will show there.
- session-recall: the quote rows put a space before `[ × ]` (before: `no such quote[ × ]`, and a long quote ran into the button).
- grok-bot-watch: the header shows from the start (`0 bots`), folded until opened, the choice kept (`grok-bot-watch.fold`). `[ close ]` is gone: the band no longer goes away.

## grok-bot-watch 0.15.0

The band follows the TUI design rules.

- The title carries the version: `▌grok bot watch v0.15.0`. The dim summary after it no longer repeats it.
- Buttons are a glyph and a word when the whole header fits them with the words (the workers band's rule): `[ + watch ]`, `[ ▾ fold ]` / `[ ▸ open ]` (it folds the band to its header, it does not hide it, so the word is now fold), `[ ✕ close ]`, `[ ✕ unwatch ]`. A narrow band shows the glyph only. Buttons are no longer dim; the uuid8, the preview and the history lines stay dim.
- `grok-bot-tui` (skill `using-grok-bot-app`, now `metadata.version: "1.0.0"` in its SKILL.md): the title shows `▌grok bot tui v1.0.0`, read from that field; a SKILL.md without it is an error, and a test ties the title to it. The terminal is restored on exit, SIGINT, SIGTERM and a crash; bracketed paste is on and a paste is never read as keys; Esc goes back from the detail and quits from the list; key names in the hints are bold.
- `grok-bot-tui` stops the `ensure.mjs` it started when it quits, so the app is never restarted after the TUI is gone (before: it ran on and could restart Grok Bot). Checked with a stand-in ensure on a private tmux server: one running before `q`, none after, and it never finished. `ensure.mjs` holds a SIGTERM from its quit of the app until the relaunch, so a stop never leaves Grok Bot quit and not relaunched (test: the hold spans exactly quit → launch).
- Not changed: a failed read already shows `▲` in yellow, not dim text alone. Rows get no 1-based number: no command takes one, and the uuid8 on the row is what `unwatch` and `/grok-bot-watch` take.

## session-recall 0.13.0

The band and the TUI follow the shared TUI rules (`mods/README.md`). Quoting shows what is in the prompt.

- Quote rows in the band: each `#qN` in the prompt shows above it with the reply and lines it came from (3 at most, then a count), and `[ × ]` takes it out of the prompt with its `>` lines. The mod reads the box on each edit (`prompt.edit`, observe only, nothing is rewritten). The band shows for quotes even before the session has an asset; sending clears the rows.
- `↩` is now `↩ quote`, not dim. A selection that runs past the reply is read line by line: each run of lines from this reply is a `#qN`, the other lines go in as plain `>`. The toast names each `#qN` and its lines.
- Band header: `▌session recall vX · N assets · M quotes`, no help text. Buttons `[ ⧉ tui ][ ▾ fold ][ hide ]`, `[ ⧉ ][ ▾ ][ ✕ ]` when narrow, not dim. `[ ▾ fold ]` keeps the header only (its counts still change) and `[ ▸ open ]` brings the rows back; `[ hide ]` still takes the band away until `/recall show`. Rows show `#aN`, the token you type. The per-kind counts are gone from the header (`/recall list` has them).
- TUI: the title carries the version and the count; the help line shows only when the list is empty. Key hints in bold. Esc quits as q and Ctrl-C do. The terminal is restored on SIGINT, SIGTERM, SIGHUP, a crash and exit. Bracketed paste is on, so a paste is not read as keys (smoke: a pasted `q` does not quit, Esc does).

## session-recall 0.12.0

The TUI shows assets only. Quoting a reply is done in place: select, copy, then the reply's `[ ↩ ]`, or paste into the prompt.

- Removed from the TUI: the answers tab, line marks and quote sending. It keeps open, preview (Quick Look), copy and `r` (`#aN` into the prompt). The snapshot no longer carries the answers' lines.
- `[ ↩ ]` with no copied text from that block no longer opens the TUI. A toast says to select and copy first. A block not among the kept answers says so.
- The mod refuses a TUI request without a `ref`. The mod still keeps the last 16 answers to find quotes in.
- Limit: `pbpaste` is macOS only. Elsewhere `↩` has nothing to read, and pasting into the prompt is the way to quote.

## session-recall 0.11.0

You can select in place in the transcript and quote the selection. A mod cannot read a selection until it is copied. Fullscreen copies a drag over a reply when the mouse button is released. The mod reads that copy at the moment you act.

- `[ ↩ ]` on a reply block reads the clipboard once (`pbpaste`). If the copied text is in that block and in its answer, it goes in the prompt under `#qN` at once. The mod keeps the lines it covers, part of a line included. The terminal's gutter and the reply bullet are dropped. A clipboard that is not from that block is never inserted: the click opens the TUI on the block, as in 0.10.0. Tested live with an SGR mouse hover and click in a scratch session: `#q2` with the selected text in the prompt. The model then said the quote was part of lines 1 and 2 of that reply.
- Pasting lines of a reply into the prompt makes a quote when the prompt is sent. Words typed before or after the paste on the same line are cut off at a space. The model is told which reply and which lines the paste came from, and the quote is kept as `#qN`. Tested live with a bracketed paste after typed words on the same line. The model named lines 2 and 3 of the reply.
- Matching ignores markdown marks, bullets, list numbers and all whitespace. A soft wrap that puts a break and an indent inside CJK text still matches. Text that two answers both hold names no place: the newest answer is not taken as proof.
- A prompt over 100 lines is taken as a pasted document and not scanned, so a long log never waits on the match. The answers' text is made comparable once per prompt.
- Limits: `pbpaste` is macOS only. Elsewhere `↩` opens the TUI as before. Text copied from a code block or a heading names no place, because those are not among an answer's lines. A paste glued to typed CJK text with no space between is read only when the whole line matches. An old clipboard that happens to come from the same block is taken as the selection. The quote's line numbers count the answer's quotable lines, not raw markdown lines.

## session-recall 0.10.0

Quoting a part of a reply now works from the transcript, and the model can find what was quoted.

- `#qN`: each quote the TUI puts in the prompt comes under a `#qN` line. The mod keeps, per session (up to 50), which reply each quote came from (its time and first line), which of its lines, and the text. A prompt with `#q3` gives the model that place and the lines beside the prompt, as `#aN` gives a row. The `recall` tool takes `kind: "quote"` (this session only). After a compaction, or after the `>` text was edited, the quote can still be found.
- `↩` on a reply block: with the pointer over a block of a reply (terminal only), a `↩` shows at its top right, over the text, so nothing moves. A click opens the TUI on that answer with the block's lines marked. A TUI already open in tmux jumps there. Enter quotes the block; space narrows it to a range. A mod cannot read the terminal's own text selection, so the range is picked in the TUI.
- The TUI's quote request carries `from: { answer, lines }`. A request without it (an older TUI) still works and gets a `#qN` with no place.
- Limits: a block of a reply still being written is not yet among the TUI's answers, and `↩` says so. Outside tmux the mod cannot tell whether a TUI is open, so `↩` launches as `/recall tui` does (in Warp: a new window; elsewhere: the command on the clipboard). A block made only of code or headings gets no `↩`. Quotes of other sessions are not listed. The hover reveal was checked against the engine types only, not drawn live.

## grok-bot-watch 0.14.0

The mod keeps where this session's reading of a bot stands. A watch records when it began (`since`). Each wake prompt says which reply it is and since when: `It is reply 3 from this bot to this session since the watch began at <ISO time>`. After a compaction, the session can tell what it already has. The band row adds `watching 2h`. Only replies that wake this session count. A reply for another session or for the owner is noise to this session, so it is not counted.

- A re-watch without an unwatch takes a new baseline, as before. It now keeps `since`, the wake and lost counts and the recent replies, and its tool reply says how many replies already woke the session. An unwatch ends them: a later watch starts at 1.
- Limits: a watch made before 0.14.0 has no `since`, so its wakes carry no position until it is watched again after an unwatch. The number is read before the submit: two wakes of one bot submitted before the first one is counted would both say the same number (wakes are 10 s apart, so this was not seen).

## session-recall 0.9.13

`tests/tui-smoke.sh` puts its tmux socket inside its own temp directory (`-S "$work/t.sock"`), so the EXIT trap removes it with the tree. Before, `-L sa-tui-$$` left one socket per run in the shared tmux directory: 58 of them were on this host. The mod itself does not change.

- Not verified: the 58 existing `sa-tui-*` sockets are left in place (live or stale not checked).

## session-recall 0.9.12

A subagent's MCP call keeps its link only when the tool's name has a making verb (`create`, `deploy`, `publish`, `upload`, `send`, `post`) as a word, in any case and split at `_ - . : /`, case changes and digits: `create_draft`, `createJiraIssue`, `CreateIssue`, `CREATE_ISSUE`, `drive.files.create`, `create2`. 0.9.11 matched the verb anywhere in the name, so `postmortem` or a read such as `getPostComments` kept the links a subagent's research printed. A name led by a read or a removal (`get`, `list`, `search`, `read`, `query`, `fetch`, `find`, `lookup`, `view`, `show`, `retrieve`, `describe`, `delete`, `remove`) does not count, unless it says `or`, `and` or `then` (`get_or_create_doc`). Checked against the 124 MCP tool names in this machine's transcripts: every creator among them (`createJiraIssue`, `createConfluencePage`, `create_draft`, `send_message`, `upload_image`) still counts. A verb run into another word (`createdraft`, `uploads`) is not seen.

## session-recall 0.9.11

A link a subagent's call printed adds no row, unless the call deployed, published, released, uploaded or opened a PR (in Bash or a context-mode shell) or was an MCP tool that creates, sends or posts (`createJiraIssue`, a Gmail draft). Seen on the real band after 0.9.10: row 3 was `github.com/o/r/pull/9`, a fixture URL a reviewer subagent's probe script printed, labelled with the subagent's own "Run probe script". On the subagent transcripts of the last 14 days (380 files), their calls gave 50 per-call URL hits; a sample of 40 read mostly as research and probes (release pages and docs a researcher read, `example.com`, fixture and test-server URLs, a tab list).

- What else a subagent made stays, since the start replay cannot bring it back (the main transcript does not hold a subagent's calls) and a parent's reply may not name it: a file it wrote, a picture it saved or sent, an Artifact it published, a commit, a push. A page it fetched (`WebFetch`, `ctx_fetch_and_index`) and a picture it Read are its research: no row.
- A URL that is only a host with no dot, port or path, and not `localhost`, is a URL cut at a column (`https://s`, `https://api`), not a page: it adds no row from a call, a reply or a prompt. Seen on the band after 0.9.10: row 4 was `https://s`, from a reply that quoted a cut URL. On the frozen 509-transcript corpus: `https://api` twice and `https://s` once. `http://nas/share`, `http://router/`, `http://mini:7717` and an IP stay.
- Limits: a subagent's link row added before this version stays until it ages out; the start prune does not judge it. A cut URL with a dot in it (`https://share.o17y31`) is not caught. A short host with nothing after it (`http://nas`) is taken as cut. A probe whose command has the word `release`, `publish` or `upload` in it (`bun probe.ts --mode release`) still adds its links.

## session-recall 0.9.10

A command that reads a session's transcript (`~/.claude/projects/…`) or this mod's own state (`~/.local/state/session-recall/…`) adds no link row: the links it prints come from old turns, cut or whole, not from anything it made. Measured on one frozen corpus of 509 transcripts: 11 of 225 per-call URL hits leave, all from such scripts (a staging API URL quoted in an old turn, `https://s` and other URLs cut at a column, a substack redirect, `terrain.o17y317.uk` from a scan of the terrain session). A commit, a push and a picture the command saved are read as before. At the next start, 0.9.9's prune can remove such rows already on the band, within its limits (below in 0.9.9).

- Reading means the path is in a script fed to an interpreter (`python3 - <<'EOF'`, `ssh host 'python3 -' <<'EOF'`), in an interpreter's `-c`/`-e` code (`bash -lc` too), or an unquoted argument (`cd`, a file). Naming it is not reading it: a commit message, a PR body, release notes, a comment, a note a `cat` heredoc writes, posted data, `my.claude/projects` or `.claude/projects-old` keep their URLs. A command that runs a deploy, publish, release or upload (outside its quoted text, heredocs and comments) is never judged here, as with the listing cap.
- A script that gets the path some other way (a quoted path such as `"$HOME/.claude/projects"`, an argument it builds, a default inside the file) is not caught: `bun prune-sim.ts <mod> <sid>` still added `127.0.0.1:8787` from the state it printed.

## session-recall 0.9.9

A noise fix now shows on the band at the next start, not once 80 newer rows push the old ones out. Seen on the real screen after 0.9.8: this session's top four rows were still the `diff` output 0.9.8 drops, kept from before the update. At each start the replay reads the transcript with this version's rules, and a link row leaves when the call that made it (same label, did not fail) shows its URL in the transcript and those rules no longer keep it. Simulated on the live sessions' stored lists: this session 11 of 51 leave (the `diff` rows, the Cloudflare walls, the `gh api` docs links), automation 2 of 57 (a Cloudflare Access login, a `127.0.0.1:8787` a read-only `ssh … grep/ps/find` printed), terrain 0 of 18, the old terrain session 0 of 51.

- A row whose call the transcript does not show printing its URL is not judged and stays: an output too large for the transcript (saved as a 2 KB preview), past the 40 URL lines `bin/transcript.mjs` keeps of one call, a subagent's call, a call that failed, a row added while the file was read. A later `cat` or `rg` with another label that prints the same URL does not judge it either. An empty or unreadable transcript prunes nothing.
- A URL the person wrote in a prompt never leaves, even when a tool printed it again and the row took the tool's label (a pasted form page Claude then clicked on). `bin/transcript.mjs` now also prints the link lines of the person's prompts; the replay itself does not read them.
- Only call-output link rows: a pasted link (`you`), a push, an Artifact, a picture, a file and a source stay, and so does a reply's link (the transcript gives it back).
- Only from the whole transcript file. When it cannot be read and the replay takes what follows the last compaction, nothing leaves. A prune that fails says so in the debug log and leaves the list as it was.
- What stays keeps its time, label and place.
- `find` with `-exec`, `-execdir`, `-ok`, `-okdir` or `-delete`, and `fd` with `-x`, `-X`, `--exec` or `--exec-batch`, is not a read: `find dist -exec wrangler pages deploy {} \;` and `fd -e html -x wrangler pages deploy {}` keep their URL (0.9.8 read both as reads).

## session-recall 0.9.8

More read-only commands are read as reads, and a command's programs are found where the shell runs them. Measured as per-call URL hits on the live path, 0.9.7 and 0.9.8 run on the same files (509 transcripts over 20 KB from 14 days, plus frozen copies of the three live sessions): 9 fewer, 8 from `diff <(cut …) <(cut …) | grep` analysis in this session and 1 a `printf` fixture; none added, no real page lost. Two pages the first draft dropped are kept and tested: a page a `curl -X PUT` published, read back with `U=$(jq -r .url r.json)`, and the login link `wrangler login` printed, found with `U=$(grep -oE … $L)`.

- Reads: `diff`, `comm`, `find`, `fd`, `stat`, `file`, `du`, `tr`, `column`, `nl`, `printf`, `basename`, `dirname`, `realpath`, `which`.
- A program inside `$( )`, `<( )` or `( )` counts, and so does `"$(curl …)"` in double quotes. A bare `SP=/x;` is no program, and an escaped `\"` does not end a quote.
- A program inside `$( )` or `<( )` never makes the command a reader by printing a file: its output goes into the command, not to the screen.

## session-recall 0.9.7

The browser tab a call ran in is not what it made. Claude in Chrome ends every result with the tab it used (`• tabId 1: "title" ("url")`): each click, screenshot, `find` or script on one page added that page again and moved it back to the top of the band, above what the session made. Measured as per-call URL hits on the live path (transcripts over 20 KB, 14 days, before the band merges duplicates): 487, 165 of them from `computer` alone (one form page 63 times). Now 247; every removed hit was a tab line (`computer` 165, `javascript_tool` 37, `find` 19, `tabs_context` 4, `browser_batch` 3) or an API error's docs link (12, `gh api`'s `"documentation_url"`). No hit was added.

- A `navigate` that lands on another page (a redirect) still adds the page it landed on; one that lands where it was told adds none, as `curl <url>` does. The reply that names the page adds it.
- `tabs_context*` is a read.
- Trade-off: a click that opens a new page adds no row (the new page was only in the tab line).

## session-recall 0.9.6

A request a login wall blocked prints the wall, not the page: those URLs add no row. Seen on the real band (screenshot of three sessions): a Cloudflare challenge, a Cloudflare Access login with a JWT that expires in 5 minutes, and a dash login redirect. Measured on the live path: terrain 13→11 tool-output URL rows, automation 4→3, all three removed rows were these. This session stays 16→16: its two wall rows left, and the two URLs the same call printed next took their places under the 5-rows-per-call cap: a catalog-card URL (`impeccable.style/worlds/cards/…`) and a local test page. Catalog cards are the next noise target. An OAuth `authorize?redirect_uri=` link is kept: a CLI may print one for you to open, and 14 days of transcripts (175 files) held none.

- Skipped: a Cloudflare endpoint (`/cdn-cgi/` challenge, Access login, trace) and a login page that sends you back (`/login?redirect_uri=`, `?next=`, `?return_to=`).
- Kept: a resized picture (`/cdn-cgi/image/`), an auth link to click (`login.tailscale.com/a/…`), a login page with no way back, any other page with `?next=`.

## session-recall 0.9.5

A second-model review (agy, VERDICT: BLOCK on 0.9.1-0.9.4) found five ways a real asset was lost. Four are fixed; measured on the two long transcripts, tool-output URL rows are 16 (14 before, the 2 new ones are the terrain site and its report page a deploy script printed), and automation's replay finds 15 pictures (11 before).

- A command that ships something keeps all its URLs, however many: the verb as a word of the command (`wrangler pages deploy`, `gh release create`, `npm run deploy`) or a deploy script (`deploy-web.sh`). A path that only names it (`~/deploy-stash-1`) does not count.
- A context-mode shell command that deploys or publishes (`ctx_execute` with `language: shell`, a `ctx_batch_execute` command) is read as Bash. Analysis in another language stays a read.
- An MCP tool whose name also makes something (`get_or_create_preview`, `fetch_and_deploy`) is not a read.
- The replay keeps a picture a command saved (`saved to /tmp/shot.png`), as live does; `bin/transcript.mjs` keeps those lines.
- A test run mutes its URLs for its own turn only, and only local ones: a later dev server on that port, or the real site an e2e run hit, is a link again.
- More written documents get a row: `.rtf`, `.doc`, `.xls`, `.ppt`, OpenDocument and iWork files, `.epub`, audio (`.mp3`, `.wav`, `.m4a`, …). Not changed: config and code (`.yaml`, `.sql`, `.json`, `.env`, scripts) get no row; the diff shows them, and an `.env` must not be one click away.

## session-recall 0.9.4

- A call that prints more than 4 remote URLs printed a list (a site's index, a design tool's catalog, a script that scans a transcript): its remote URLs add no row, its local ones do. Live-path tally on the two long transcripts: 24 → 14 tool-output URL rows. The rows dropped were index entries and catalog cards; the deploys, published pages and a login link stay.
- Measured after 0.9.3 reached the real sessions: terrain 5 → 48 rows (all 30 of its pictures; 50 is the most its transcript holds), automation 5 → 35, this session 12 → 30.

## session-recall 0.9.3

- The replay reads the whole transcript file, not only what the engine holds. `$.session.messages()` starts at the last compaction: after the rename, a long session that had compacted 6 times rebuilt 5 of its 68 assets (terrain: 5 pictures of 43), another 1 of 38. A reload now adds the rest to a list that is already there. `bin/transcript.mjs` reads the file (24-79 MB, too big for the mod's 4 MiB read) and prints only the lines the replay reads: about 1 MB and 0.3 s for the largest local transcript (79 MB). Subagent messages are left out. A session with no file, or a failed read, replays what the engine holds, and says why in the debug log.
- A replay into a list that has rows puts what it adds under them: the earlier rows never push a live one down or out of the 80.

## session-recall 0.9.2

The band's links: tool-output URL rows 87 → 24, measured on two real long transcripts with the live path (each tool use run through `assetsOf`). Of the 24 left, 11 are pages a command deployed or published; 13 are still noise a CLI printed (a design tool's catalog, `yt-dlp` warnings, a login redirect, an index path), the next target. Trade-off: a page published with `curl` inside `ctx_execute` adds no row from the tool; the reply that names it still adds one.

- Every context-mode tool reads: `ctx_execute` and `ctx_batch_execute` too. In those two sessions all 22 URLs they printed were data they analysed (status checks, transcript scans, config lines).
- An MCP tool named for a read (`get_…`, `list_…`, `search_…`, `read_…`, `query…`, `fetch_…`, `find_…`, `resolve_…`, `peek`) adds no URL row: docs lookups, mail searches, a worker's screen. So does the codex-cu `js` REPL: it prints the screen and every open browser tab.
- `ssh host '<cmd>'` and `timeout N <cmd>` are read as `<cmd>`: a remote `grep` or `tail` of a log is a read.

## session-recall 0.9.1

Fewer file rows in the 80-row list, so links and pictures are not pushed out. Measured by replaying two real long transcripts: file rows 35 → 16 and 36 → 13, URL rows 9 → 9 and 14 → 12, pictures unchanged. The band rows (links from tool output) are not changed by this release.

- A written or edited source file (`.ts`, `.sh`, `.json`, …) gets no row. The diff already shows it, and it pushed links and pictures out of the 80-row list. A written document (`.md`, `.html`, `.pdf`, `.txt`, `.csv`, office files, notebooks), picture or video still gets a row.
- A URL built in code or prose is a pattern, not a page: `https://x/a/<id>`, `` `https://x/p/${name}` ``, `'https://x/p/' + name`, `https://x/s/{id}` add nothing.
- A reply that repeats a URL a test run printed adds no row: the URL is a fixture, not a page. The replay after a reload does the same.

## session-recall 0.9.0

- Renamed from `session-assets`: the mod keeps more than assets (the answer lines the TUI quotes back), so it is `session-recall` and its command is `/recall` (`/recall list`, `/recall N`, `/recall tui`, …). The model tool is `mcp__session-recall__recall`; the TUI's files are under `~/.local/state/session-recall/`, the Warp launch configuration is `session-recall.yaml`. No alias: `/assets` is gone. Each session's list starts empty under the new name and is rebuilt from its transcript at the next start. Install `session-recall@agent-scripts` and uninstall `session-assets@agent-scripts`.

## session-assets 0.8.4

- `agent-browser eval`, `snapshot` and `get` print a page they read, like `tmux capture-pane`: their URLs are not kept. A session that searched a bot app's transcript with `agent-browser eval` had two of the bot's pages as its top band rows. A screenshot `agent-browser` saves is still kept.

## session-assets 0.8.3

- In Warp, `/assets tui` and `[ ⧉ ]` open the TUI in a new Warp window: the mod writes `~/.warp/launch_configurations/session-assets.yaml` and opens `warp://launch/session-assets%20TUI` (a launch configuration opens by its name; by its path it runs nothing). Before, Warp got only the command on the clipboard. `permissions.txt` adds the env read `TERM_PROGRAM` and `$.fs.write` via `launch`.

## session-assets 0.8.2

- A reload adds what the transcript shows and the list lacks. The transcript was replayed only into an empty list, so a session listed by an older version never got what a newer one finds: a long session that read 38 screenshots kept none of them after the update. Rows already listed keep their time and label.

## session-assets 0.8.1

- A picture or video the agent `Read` (shown in the conversation as `[image]`) is an image row, and each file sent with `SendUserFile` is a row labelled by its caption; both come back from the transcript after a reload. A screenshot a script saved to a path it was given (`probe.py <url> out.png`) was never kept: the path was in the command, so it read as given, not made, and the `Read` that showed it was skipped as a reader.
- A test run prints its fixtures, not pages it made: URLs a Bash test run printed (`npm test`, `pytest`, `claude plugin test`, a `tests/` script, a `*-smoke` script) are not kept, also run through an interpreter (`bash tests/x.sh`); only the script's name and folder count, so a dev server under a `test-site` folder keeps its URL, and a test beside another command (`npm test && npm run dev`) keeps them all. A screenshot it saved still is. A smoke run had added the made-up `http://localhost:5173/` row.
- README: after a quote fill the cursor is under the last quote; no hook can move it.

## session-assets 0.8.0

- A TUI of its own, as the workers panel has: `/assets tui` or the band's `[ ⧉ ]` opens `bin/tui.mjs` full screen. In tmux it opens in a split (full window height); elsewhere, Warp among them, the command goes on the clipboard, to paste in a new pane. The band has a few rows; the TUI has every row and the last answers.
- Quote lines of an answer back (in past sessions, 204 follow-ups pasted one line of an answer back with a short comment, 61 pasted several). The TUI's answers tab has the lines (list items, table rows as written, prose) of the last 16 answers; mark some with space, and enter puts them in the prompt as `> line` blocks, each with an empty line under it for the comment on it. Marks stay on the answer they were made in when a new answer comes in. Only the mod can write in the prompt, so the TUI writes a request the mod reads and answers; a paste of several lines would fold into `[Pasted text]`. Each request is a file of its own (`~/.local/state/session-assets/<sid>.ask/<time>-<pid>-<n>.json`, answered under its name in `<sid>.done/`), so two TUIs never write over each other's; each is done once and in the order made, said done only on the mod's `ok`, and one older than 30 s is not done. The mod marks one taken before it fills the prompt, so a reload in between never fills it twice, and writes an answer it could not write at its next look. A refused one (too many or too long quotes, not a request, a row gone) is refused whole, never cut, and keeps its marks. `c` copies them instead.
- The assets tab: every row numbered as the band, enter opens, `p` previews, `c` copies, `r` puts `#aN` in the prompt (the TUI sends the row's ref; the mod numbers it as the list stands).
- The mod writes `~/.local/state/session-assets/<sid>.json` for the TUI after each change; the answers come back from the transcript after a reload. `permissions.txt` adds `$.fs.exists/list/read/write`, `$.clock.every` and the env read `TMUX`.

## grok-bot-watch 0.13.0

Breaking: `send.mjs` (shared core) has no `--direct` any more, so an agent sends to the front or the sandbox of the role file only, and so does the panel.
- The panel's reply line sends `<tag> ⟨Claude⟩ <text>` with no basis and no flag. A bot that is neither the front nor the sandbox now gets the toast `not sent to <name>: not-front`; before, the panel reached any bot.
- `send.mjs`: the CLI body is `main({ id, port, extra }, check, connect)`. Its own CLI always passes the role gate; a missing check refuses (`no-gate`); `extra` goes into the result line of a send. A port that is not a positive integer is `bad-port` before any connection, so an old `<id> --direct x` call says so instead of `down`.
- Setup without an agent front: the main bot's UUID goes in `front` until the agent front exists, then the agent front's (`SKILL.md`, `templates/bootstrap.md`); the rules bot is asked through the front, and rule 18 now says agents send to the agent front only.
- The override sender `ops/grok-bot/send-nogate.mjs` (not part of the skill or the mod) is a few lines over the same `main` with no gate; only it takes `--direct <basis>`. It runs from an agent-scripts checkout.

## grok-bot-watch 0.12.1

- The panel's reply line writes the basis `panel instruction` (it was a name and a Chinese phrase). The skill, its bootstrap template, scripts and tests are now in English with no account names, bot names or ids; the behavior is otherwise the same as 0.12.0.

## grok-bot-watch 0.12.0

- A turn that ends on a card or a note with no tag no longer hides the tagged answer above it (an option card never woke). For the bot open in the app, the newest message new since the last read that is tagged for this session (or `[w:*]`) wins over a later card; the same read spends the card. Without an anchor (the first read, or the last message scrolled out of the 5-message window) only the newest message counts, so an old tagged message never wakes as a new reply.
- `bin/send.mjs` leaves a sent mark per session and bot, `~/.claude/grok-bot-watch/sent/<tag>-<bot8>.json` (`{at}`). An untagged reply that settles within 2 hours of it, with no wake since, wakes once with a caveat: its answer may sit above it. This covers a bot that is not open (its preview is the card) and an answer scrolled out of the window. A wake of any kind spends the mark.
- The panel's reply line sends through the skill's new gate with `--direct` (basis `panel instruction`, written after the sender mark): the owner types it. A tag typed on purpose is kept, never doubled, and the mark follows it.
- `send.mjs` (shared core) gates every send: the text must start with `[w:<sid8>] ⟨agent⟩` (`bad-header`); by default the bot must be the front or the sandbox of the role file `~/.claude/grok-bot-watch/roles.json` or `$GROK_BOT_ROLES` (`no-roles` names what is missing, `not-front`); `--direct <basis>` relaxes the recipient only, and the basis has to be in the message (`no-basis`). Roles are UUIDs from that local file, never names.
- Limits: the window stays 5 messages, so a turn with more than four bot messages after the answer still hides it, and only the caveat wake can tell you. The caveat is a hint: a chat between the owner and the bot inside the 2 hours after your send can cost one extra wake. `permissions.txt` changes only in who calls the env and fs reads.

## grok-bot-watch 0.11.0

- The bot open in the app no longer wakes you again with an old reply. Before, the mod judged a new reply by the sidebar preview and a busy -> idle cycle. A bot that runs a routine goes busy -> idle every run with the same preview, so each run woke the session again with its last reply (10/12-13: 16 of 28 wakes were repeats, from 655a6fa1 and sandbox). For the open bot the mod now compares its last message in the transcript (time and text, already in every sidebar read), taken from any sender but You because the sidebar name can carry a subtitle ("NOVA, Main Bot"). A wake needs a message the transcript did not show before. A new reply with the same preview (a tag-only preview, or "收到" twice) still wakes. That message, not the preview, decides who the wake is for and what it shows. An email card is not a reply of its own (it keeps the recipient of the message above it), and a window with only your messages in it means nothing new from the bot.
- The transcript identity survives switching to another bot: opening the bot again after a routine run does not wake. A reply that already woke you while the bot was off screen does not wake again when you open it. The first settled read of an opened bot with no identity yet is the baseline and follows the preview rules once.
- The event log hashes that transcript identity (instead of the preview) when it decided the wake, so a replay tells two replies with one preview apart. A `wake` line also records `cur` (the bot was open) and `un` (its row was unread).
- Limits: the app gives no message id, so for the open bot the same first 200 characters in the same minute (or at the same time on another day) is one wake. A bot not open keeps the preview rules: with an unread row and an unchanged preview (a tag-only preview, like sandbox's) a routine run still wakes you again. The README no longer says the mod never restarts the app (it restarts it through `bin/ensure.mjs`).

## grok-bot-watch 0.10.0

- An event log you can replay (agent-scripts W42-8; W40-3's four unmet clauses). Each session appends one JSON line per `watch`, `armed` (the bot was seen working), `wake`, `lost` and `unwatch` to `~/.claude/grok-bot-watch/events/<session>.jsonl`. A line holds the bot, the watch generation, a hash of the reply (never its text), and for a watch or unwatch `via` (`tool` = the model, `command` / `panel` = a person) and `prior` (the bot was already watched: a re-watch). `bin/replay.mjs [files]` counts the four classes: `resent` (the same reply delivered twice; must be 0), `sameText` (a new reply with the same text, after the bot worked), `rewatch` by `via`, and `afterUnwatch` (must be 0). It exits 1 when a defect class is not 0. A log write that fails is a debug line, never a lost wake. The file grows with the session (one read and rewrite per line, because the engine has no append); `permissions.txt` adds `$.env.get` HOME and `$.fs.exists/read/write`.

## session-assets 0.7.3

- A link you paste in a prompt is a band row (`you: …`), to open, copy or reply to; before, it was a source, counted and listed but never a row. The core need is links that come up in the conversation, and the ones you paste are among them.
- A link already listed keeps its row and label when you paste it back (copied from a row) or Claude reads it (`WebFetch`): before, a paste turned a dev server's row into `you: …`, and a fetch turned a pasted link into a source with no row.
- Sources are now only the pages Claude read. A page Claude read becomes a link row when you paste it or a reply points at it (in the replay too), and a page read again takes its newest label and time.

## session-assets 0.7.2

- Two pushes in one Bash call (`git push && … && git push -f`) are one row, the compare view from the first to the last. A call's assets are recorded last-first (the first found is the top row), so the later push was listed before the earlier one and the two did not join. A call's pushes are now recorded in the order they ran. Chaining stays one way, a push to the one before it: a later push that ends where an earlier one began (someone else pushed in between) stays its own row.

## session-assets 0.7.1

- A row's name is bold again: as a button it was drawn plain. README: in Warp a mouse click reaches the band's buttons (tried with a click on a row: it opened); `ctrl+x tab` still does not.

## session-assets 0.7.0

- A click on a row's name opens the row: its buttons `[ open ] [ preview ] [ copy ] [ reply ]` and its full URL or path. Each button does what `/assets <verb> N` does and says how it went in a toast; a second click on the name closes the row. Preview shows only for a file, picture or video (Quick Look); a commit has copy and reply. The `/assets` commands stay for a terminal where a click does not reach the band.
- The band's title shows the version (`▌session assets v0.7.0`), as the workers panel and grok-bot-watch do, so a reload can be seen to have taken.

## session-assets 0.6.0

- The band is for what you look at or open: its rows are links, Artifacts, pictures and videos. Files, commits, pushes and sources are counted in its header and listed by `/assets list`; a row of theirs shows only while it is open (`/assets N`). In a long session the band's few rows went to files written and pushes, not to the screenshot or the preview link.
- Videos are their own kind (`▶`, `mp4 mov m4v webm mkv`): written by a tool, printed by Bash, or named in a prompt or reply. `/assets preview N` plays one in Quick Look.
- A picture or video path with spaces is kept when it is quoted (a file dragged into the prompt reads `'~/Desktop/IMG 2026-10-08 at 20.40.56.png'`) or its spaces are escaped (`demo\ run.mov`). Before, such a path was not kept at all. Inside quotes, `;`, `*`, `[ ]` or two spaces mean prose or a glob, not a file name.
- Other sessions' rows, when unfolded, follow the same rule.

## session-assets 0.5.9

- The band names each row by the thing, not by what made it: a URL row reads `localhost:5173/app` or `share.o17y317.uk`, with the call or reply line after it, dim. Before, the bold column was the Bash description or the reply's sentence, so the band read like a log of the turn.
- Pushes that follow on from each other on one branch are one row: `a..b` then `b..c` becomes the compare view `a..c`. This session's own band had five push rows in its top five.
- A URL in a reply or a prompt you typed follows the tool-output noise rule: a local URL on an ephemeral port (49152 and up) or to a file a page loads is not kept. A band showed three `127.0.0.1:6xxxx` rows from replies.
- README: `/reload-plugins` starts the session again (and so replays) only when the version changed.

## session-assets 0.5.8

- A transcript replay writes a debug line with how many assets it kept from how many messages, so a replay that kept nothing can be told from one that did not run. The replay reads what `$.session.messages()` returns; README says so under Limits.

## session-assets 0.5.7

- The replay puts a push that lost its `To` line where it happened in the transcript. Before, those pushes were added after everything else, so the oldest push of the session showed as row `a1`, above the files written after it.

## session-assets 0.5.6

- The reader rule skips heredoc bodies too: a line of a Python heredoc such as `head = open(p).read()` read as `head` printing a file, so the call's URLs (a dev server it started) were dropped. One helper strips heredoc bodies for both the reader rule and the push finder.

## session-assets 0.5.5

- A push whose command also holds a heredoc (`python3 - <<'EOF' … EOF`) is found again: both push paths (with a `To` line, and the lost-`To` fallback) read the heredoc's text as commands, met a `git push --dry-run` there and dropped the push. One helper now skips heredoc bodies and takes the first push that is not a dry run. This session's own push `39bc98f..f888f5b` was the case.

## session-assets 0.5.4

- The transcript replay (session start with an empty list, `/assets clear`) also asks git for a push that lost its `To` line, once per folder and remote. Before, it kept only pushes that printed `To`: this session's own list had lost four of its six pushes.

## session-assets 0.5.3

- A push whose output lost its `To` line (`git push … | tail -1`, the common case in this session's own history) still keeps its GitHub page: the mod asks `git -C <dir> remote get-url <remote>` (the command's leading `cd`, else the session's folder; the word after `push`, else `origin`). Read-only, 3 s limit.
- A dry run (`git push --dry-run`, `-n`) keeps nothing: it prints the same lines for a push that did not happen. A redirect (`2>&1`) is not taken for the remote's name.
- `ctx_fetch_and_index` with a batch (`requests: [{ url, source }]`) keeps each page as a source, labelled with its `source`.

## session-assets 0.5.2

- A Bash command that prints a file or a screen anywhere in it (`rg url docs.d.ts`, `cat dist/urls.txt`, `git show`, `tmux capture-pane`) keeps no URL or picture from its output, also when other programs run with it: `git push && rg … index.d.ts` had kept the doc's example links `react.dev` and `vuejs.org`. A commit or a push in the same command is still kept. A filter on a pipe (`npm run dev | grep Local`) reads no file and keeps its URL.

## session-assets 0.5.1

- A `git push` to GitHub keeps the page it changed: the compare view for `a..b  main -> main` (`push: main a..b`), the release page for a new tag, the tree of a new branch. The replay keeps them too: they are what the call did. A `.git` URL (the `To <remote>` line) is a remote, not a page, and is not kept.
- A source fetched without a `prompt` is labelled with its `source`, else its host, not the tool's name.

## session-assets 0.5.0

- **Sources**, apart from what the session made: the page a `WebFetch` or context-mode's `ctx_fetch_and_index` was given (labelled with its `prompt`), and a link you pasted (it was `url`, `you: …`). They are counted in the band's header and listed under `Sources` by `/assets list`, take no band row, and answer `#aN`, the tool (`kind: "source"`) and the checks like any URL.
- `/assets list` groups each kind by `today`, `this week` and `older` (a replayed entry is `older`).
- A Bash command whose programs all only read (`cat`, `sed`, `rg`, `jq`, `tmux capture-pane`, `git log`/`show`/`diff`, and `cd`, `echo`, `sleep` around them) keeps nothing it printed. The engine does not mark all of these read-only: `tmux capture-pane | grep` had kept the URLs on another session's screen.

## session-assets 0.4.0

- The list is now for using, not only for looking at. Three paths, each checked in a live session:
  - **You point, Claude gets it.** `#a3` in a prompt sends row 3 to Claude beside the prompt: the exact URL or path, what made it, and its state now. `#123` (an issue) is not a reference.
  - **Claude asks.** A model tool, `assets` (`query`, `kind`, `all_sessions`, `check`), answers the matching rows with the same state: how Claude gets an exact port, path or hash back after compaction, or finds which session runs a port.
  - **Who is who.** A local URL is checked on demand: the process listening on its port and the folder it runs in (`up: python3.12 (pid 10799) in .`), or `down: nothing listens on :8765`. A path: `exists` or `missing`. Shown by `#aN`, the tool and `/assets list` (first 10); never checked while drawing, and remote URLs are never requested.
- Rows are numbered `a1`, `a2` in the band; `/assets N` also takes `aN` and `#aN`.
- Built from what 304 past sessions show about how the list gets used: commit hashes pasted into 224 prompts (128 from another session), session ids into 100 (78 from another), Artifact links pasted back, and 12,554 of 16k local URLs in tool output on ephemeral ports.
  - **A pasted hash or session id is resolved.** A commit hash (7 to 40 hex) that a session here made goes to Claude as `<hash> = commit "<subject>" on <branch>, made in session <sid8> (<project>)`; a pasted session id goes with that session's newest 8 assets. Unknown ones add nothing.
  - `/assets copy N` puts row N's URL, path or hash on the clipboard; `/assets reply N` puts `#aN ` in the prompt; `/assets preview N` opens a file or picture in Quick Look (`qlmanage -p`), a URL in the browser.
  - A local URL on an ephemeral port (49152 and up: a debugger, a CDP endpoint) or to a file a page loads (`/assets/a.js`, `/data/x.json`) is not kept. Remote URLs are kept as before.
  - The tool names another session as `session <sid8> (<project>)`.
- The mod's own tool calls are not kept as assets.

## session-assets 0.3.0

- Less noise, found by using it on a long session: of 21 URLs, about 20 were links that `sed`/`cat`/context-mode had read, or URLs inside the command itself.
  - The transcript replay trusts what a call did (files written, Artifacts, commits) and Claude's replies, not what a call printed: the transcript does not say which calls were read-only.
  - A URL or picture path that is in the call's own input (`curl <url>`, code a tool echoes back) is not kept.
  - Fullwidth punctuation (`（`, `，`, `。`) ends a URL.
  - An MCP call is labelled with its `description`, `intent` or `title`, else its short name (`ctx_execute`), not `plugin_context-mode_context-mode__ctx_execute`.
  - A replayed entry shows `earlier` in place of an age that was only the session's start.
- `/assets list` prints every entry grouped by kind, numbered as the band, each with its full URL or path.
- `/assets clear` starts this session's list over from its transcript: for a list an older version filled, or one gone noisy.
- Changes from 0.2.1 not released before: the other-sessions line reads `other sessions: 3 · 12 assets` (it counted assets as sessions).

## session-assets 0.2.1

- The transcript replay keeps an artifact's kind and title, and a tool URL's label, when a later reply names the same URL; it now follows the live rule (a reply adds only a URL nothing named before).
- A picture path typed as `~/…` and repeated no longer uses up the five places per message; it is compared as stored (the home path).

## session-assets 0.2.0

- Reads more than tool calls. A URL only in Claude's reply is kept, labelled `reply: <rest of its line>`; a URL a tool already printed keeps its tool label. A link or picture path the person pastes is kept as `you: …` (their own prompts only, not notifications or peer messages). A session with no list yet (the mod loaded mid-session, or a resumed session from before it) replays its transcript at start; replayed assets are dated at the session's start.
- Leaves to the status line what it shows: the band header drops the version (it moved to the `/assets` description), and a commit row shows its hash instead of the branch.
- Review fixes: a picture URL is no longer also kept as a bogus `//host/x.png` image; a commit on a detached HEAD is kept; `**url**` loses the `**`; read-only calls (`isReadOnly`, e.g. Bash `cat`/`rg`) and context-mode reads add nothing; a ref over 2048 characters is dropped; `+N more` counts assets, not the open row's detail; `/assets` and `[ hide ]` no longer throw when the store refuses a write; a resumed session starts with no row open.
- The `prompt.submit` hook carries `.catch`, so bookkeeping never holds a prompt back.
- Labels share one column (at most 40 cells), so ages and places line up; a label leaves out any other URL on its line.

## grok-bot-watch 0.9.5

- The watch and unwatch tool hooks deny on error (`on(...).catch`) instead of leaving the call unanswered; `claude plugin validate` (CC 2.1.295) flagged both as gating hooks without `.catch`. `permissions.txt` is re-pinned.

## session-assets 0.1.0

- New mod `mods/session-assets` (it was `url-library` before any release): it keeps what a session makes or prints in the band above the prompt. That covers URLs (local and remote marked), Artifact links named by their title, files written by `Write`/`Edit`/`NotebookEdit`, pictures written or printed as a path (screenshots), and `git commit` hashes with their subject. Each entry is labelled with what produced it, and each session has its own store key. Commands: `/assets`, `/assets N`, `/assets open N`, `/assets all`. Built like `grok-bot-watch` and the workers panel: it stacks under them within `maxRows` and has no hotkeys of its own. ANSI escapes are stripped before URLs are read (Vite bolds the port inside its coloured URL).

## lessons B + W42 2026-10-09

- Kernel 4.35.0-ironlaws: `lessons.md` is gone (option B). Friction becomes a gate, a rule fix, or a backlog row in `evals/retro-metrics/inbox.md` (maintenance §2–§3); old entries: `git show a3992bd:.agents/rules/lessons.md`. The 7 open entries landed: `check-rules-invariants` checks the four iron-law clauses in both kernels and bans a bare `python3`/`shasum` in hooks; new `pr-create-gate.sh` (Claude and Codex) denies a second `gh pr create` per session until `PR_CREATE_GATE=allow`; judgment-rubrics adds the pipe exit-code rule and the Codex `yield_time_ms` rule (no hook can see that field: live payload has `command` only); operator-defaults wants copy-paste commands; delegation-templates asks for a progress line on long work.
- `model-dispatch.md` §2: a user-named tool or path stays in this session (W42-13).
- `deploy.sh`: on the clone-tracked layout it FAILs while `skills/`, `global/` or `.agents/` hold untracked files (a retired recipe kept coming back on one host); clean them, then rerun. It names each stale skill it removes. `host-load-gate.sh` writes one stats row per gated launch.
- `skills-lock.json` follows the upstream skill upgrades; `settings_claude.json` keys the luna effort to `gpt-6-luna`.
- `operator-defaults.md`: "prefer structure" is now conditional (lists when the content has many parts or the user must choose, prose for a chat reply). The other three kernel sweet-spot proposals (stop types, delegation trigger, effective-stack audit) are dropped.
- `rm-home-gate.sh` (Claude and Codex) denies a recursive `rm` on the home dir or the root in any Bash command text. It cannot see a script file's content; the test-harness fix is W42-25 in tmux-agent-tools.
- `model-dispatch.md`: Claude Agent calls take `effort` too (CC 2.1.292+) (W42-20).
- `retro-agenda.md`: the one status page is now the Dashboard "[agent-scripts] 艦隊與 Retro"; no separate weekly Retro page.
- `claim-evidence-gate.sh` no longer fails open on a CJK claim under `LC_ALL=C` (byte-wise grep bound `已?` to the last byte); the jsonl smoke replays it and compares evidence as a set.
- `settings_claude.json`: `workflowSizeGuideline: small` and `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS=6` (usage guards, ahead of W42-24).
- `claim-evidence-gate.sh`: a done claim fails when a file the reply cites was edited after the last run that printed the quoted token; re-run the check after editing (W42-21).
- `docs-vs-code-audit`: each file gets one fixer even when group scopes overlap; a fixer that edits a file it does not own fails its group (W42-23).
- `evals/run-behavior.mjs`: the behavior runner grades full tool traces; a done claim with a ✈ and no check run grades FAIL. `--live` runs each fixture through `claude -p` (W42-18).
- `subagent-concurrency-gate.sh`: an Agent call made inside a subagent is denied unless the brief that started that subagent has the line `NESTED: allowed`; the deny is logged as `result=nested`. The flag lives in `nested/<agent_id>` and survives the subagent's stop and restart under one id. `delegation-templates` documents the line (W42-12).
- `session-titles.md`: a beta build of a mod or skill is never tested through the user's working session; a released version may ask a session to reload (W42-8).
- `evals/retro-metrics` collectors cut by each row's timestamp (`--since/--until`), read `.gz`/`.zst` archives, and have `--self-test`; `ctx-usage-report.py` reads a temp copy of a WAL db that `mode=ro` cannot open; new `grok-bot-store.py` (W42-4).
- `test-cursor-hook-adapter.sh` no longer runs `chmod +x` on the repo's hooks; it flipped the sourced `subagent-lock.sh` to 0755 in the work tree.

## review ladder 2026-10-09

- Review loops run one ladder (`model-dispatch.md` §Review ladder): L0 deterministic checks plus a hash freeze → L1 pre-filter (`sonnet` 5.5 high, as `pr-review-toolkit` lenses for code, plus `gpt-6-luna` xhigh; ≤2 rounds, cannot pass) → L2 `opus` (code: `pr-review-toolkit:code-reviewer`; always runs, ≤3) → L3 `fable` (1 round, only when L2 still blocks). One finding ledger runs through every round; reviewer and fixer contracts live in `_lib/worker-doctrine.md` §7–§9. Wired: `plan-pipeline`, `consensus-gate`, `spec-implement-dual-review-verify`. Reviewed by advisor and Sol (19 findings; 18 adopted or partly adopted).
- Breaking args: `spec-implement-dual-review-verify` rejects `cli` and `isolation` (the build review ran one round and never re-reviewed its fixes; it now runs the ladder); `plan-pipeline` takes `maxReviewRounds` 1–3 only and rejects `isolation`, and `cli` drafts only; `consensus-gate` takes `layer`, `round`, `freeze`, `l0`, returns manifest and L0 fields, and an L1 `agree` never sets `passed`.
- `skills-lock.json` adds `codex-cu` (deploy removes skills missing from the lock). `lessons.md` keeps 7 open entries (24 retired as covered by a gate or rule). The compaction handoff goes to the project root, so a retro run dir no longer carries it.

## using-skills flows 2026-09-28

- `using-skills` now chains the lock skills: a Flows section (situation → handoff → artifact → loop) for feature, bug, test plan and handoff, with conditional stages only, plus owner pointers for architecture, design, writing, tmux, loops and skill edits. Agreed by advisor and a Codex reviewer over two rounds; the loop closes on a proposal (`lessons.md`, `Status: proposed`), never a self-edit.

## skills roster 2026-09-27

- The lock drops 16 skills (64 → 48), judged by what a skill carries, not how often it ran. Removed: `karpathy-guidelines`, `git-commit`, `refactor`, `simplify`, `resolving-merge-conflicts` (generic discipline the kernel already states); `brainstorming` (its approval wait conflicts with the kernel; its visual companion goes with it); `high-end-visual-design`, `design-taste-frontend` (prose-only taste, same job as `impeccable`, now the one direction authority); `image-to-code`, `imagegen-frontend-web`, `imagegen-frontend-mobile` (the image-first pipeline is gone from `using-design-skills`); `pierre-guard` (upstream 404), `release-plannotator`, `review-renovate`, `migrate-to-shoehorn`, `update-deps` (bound to projects and tools no local repo uses). Then `wait-what` (48 → 47): the kernel-routed `simplified-english` rule already re-explains a message that did not land. The kernel, routers, router hook table and design evals drop every reference; `deploy.sh` removes the directories on each machine at its next deploy.

## grok-bot-watch 0.9.4

- A bot that works and settles on its old preview with no unread mark (it chose not to reply, e.g. `不需回覆`) no longer wakes; 3 false wakes from sandbox on 2026-10-04. Live trace on sandbox: no reply settled `unread=false`, a reply with the same text settled `unread=true`. The open bot gets no unread mark, so there the old behaviour stays.

## grok-bot-watch 0.9.3

- A bot message that ends in a list has its time after one newline, not a blank line, so the transcript split merged the next message into it and `send.mjs` said `unconfirmed` for a short message too. The split in `send.mjs` and `sidebar.mjs` takes one or two newlines. Live on the agent front: the same message counted 0 before, 1 after.

## grok-bot-watch 0.9.2

- Corrects 0.9.1: the false `unconfirmed` came from length, not Markdown (the transcript shows our messages as typed). A long message is folded with a `Show more` line before its time, so the transcript split missed it. `send.mjs` and `sidebar.mjs` now split past `Show more`/`Show less`; 0.9.1's letters-and-digits compare is removed. Live on sandbox: a 4,900-character message gave `unconfirmed` before, `sent` after.

## grok-bot-watch 0.9.1

- `send.mjs` counts the sent message by its letters and digits, so a Markdown body (tables, lists, code, links) that the transcript shows rendered is confirmed `sent`, not a false `unconfirmed` (3 seen on 2026-10-04; live on sandbox after the fix: `sent`).
- `using-grok-bot-app`: `templates/bootstrap.md` sets the mechanism up in a new environment (bot requests + the full rule for RULES). A wake is a hint; when an answer is late, read the agent front's transcript by tag and `#<task>`. First use checks five bots, the human front included; no main bot goes to Paul. Consensus: NOVA PASS, advisor PASS, Sol BLOCK (P1/P2 taken in), Paul 2026-10-04.

## grok-bot-watch 0.9.0

- Who a reply wakes changes (NOVA consensus 2026-10-04, approved by Paul). The app shows Paul's messages and ours as `You`, and an untagged reply meant both "broadcast" and "answer to Paul": w40 answered 62 untagged messages from Paul's iOS app with this session's tag, which woke a session that was not in the conversation. Now only `[w:<sid8>]` (that session) and the new `[w:*]` (every watcher) wake; an untagged reply answers Paul and wakes nobody. Breaking for a bot that forgets to echo the tag: its reply no longer wakes anyone.
- Messages from the band start with `[w:<sid8>] ⟨Claude⟩`, so the bot and Paul can tell a session's message from Paul's.
- `send.mjs` opens the bot that was open before again after it opened another one to send, unless someone opened a third one meanwhile. 28 send tests, 67 mod tests; removing the restore or making an untagged reply wake again each fails a test.
- `using-grok-bot-app` states the conventions: tag and mark, echo only to a tagged message, `[w:*]` for broadcasts, no reply to `不需回覆`/FYI, send tests only to a sandbox bot. The bot-side rules go to RULES (USER-MEMORY).

## grok-bot-watch 0.8.4

- Sol round 3: `VERDICT: PASS` on 0.8.3, with two P2 false `sent` cases, fixed here. A transcript that could not be read before the submit gave a baseline of -1 that any later count beat: with no baseline the result is now at best `unconfirmed`. A bot reply whose text contained `You <message>` counted as the user's message: the transcript is now split into messages the way `sidebar.mjs` does (sender line, body, time line), and only messages from `You` with exactly this body count. 27 send tests; both cases fail when their guard is removed. Live: tagged message to w40 → `sent`.

## grok-bot-watch 0.8.3

- `send.mjs` review fixes (Sol round 2, `VERDICT: BLOCK`, 1 P1 + 2 P2). P1: after a refused submit, the clean-up matched the composer by text only, so switching to a bot whose draft was the same text cleared that draft. `unsend` now clears only while the target bot is open. P2: `sent` matched the text anywhere in whatever transcript was open; it now needs the target bot's transcript to hold one more `You <message>` than counted just before the submit, so an old copy or another bot's text never counts. P2: a helper run that throws or prints no verdict now says `unconfirmed … check the app before resending`, not `not sent`.
- Tests now run the real page expressions over a fake DOM (`effects(ev)`), not only a model of them: 25 send tests, including hostile text, moved, edited, an old copy with a refusing form, the same-text draft on B, and B's transcript holding the text; 5 mutations of the page scripts are each caught. Live: stand-in draft → `draft`, intact; tagged message to w40 → `sent`.

## grok-bot-watch 0.8.2

- `send.mjs` review fixes (Sol review of 0.8.0, `VERDICT: BLOCK`, 2 P1 + 3 P2). P1: checks, paste and Enter were separate CDP calls, so a keystroke or bot switch between them could get a user's draft cleared or the message sent to another bot. The send is now one in-page script: check bot and empty composer, paste, check text; wait 50 ms (the app's form reads React state set after the paste: a submit in the same tick sent nothing, seen live), then with no gap check bot and text again and submit the composer's form. A switch or a keystroke in the wait is reported (`moved`, `edited`) and nothing is sent or cleared; the only text ever cleared is the script's own just-checked paste. P2: success is now the transcript showing the message, never an unreadable composer (`unconfirmed`); a CDP error or page exception rejects instead of reading as empty; text that already starts with a tag is not tagged twice; the band says `check the app before resending` for `unconfirmed`, `timeout` and `failed`.
- Live: a stand-in draft → `draft`, draft intact; a tagged message to NOVA 替身 w40 → `sent`, composer empty. Found live on the way: a synthetic Enter keydown does not send; an awaited in-page promise must be held (`Promise was collected`, the message had gone). 14 send tests, 4 mutations each caught; mod 66 tests.

## grok-bot-watch 0.8.1

- After a reload the band showed `▲ 03972e9a pending` (seen live in a control session): a kept watch had no name and no state until the first 10 s poll, drawn with the warning glyph of a failed read. The mod now reads once at session start, and a watch not read yet shows `○ reading the app…`. Test: the name and `waiting` appear with one read and no poll; dropping the start read fails it.
- Checked live that a tagged reply wakes only its sender: the store holds 4 sessions' watches; only this session watches NOVA 替身 w40 and its one wake is the reply tagged `[w:29a98092]`; the control session (US_STOCK only) has 0 wakes.

## grok-bot-watch 0.8.0

- Reply from the band, as in the workers panel: the open row (`[ ▸ ]`) starts with a reply line; Enter sends the text to that bot, prefixed with this session's tag so the answer wakes this session only, and a toast says `sent` or why not. One send at a time.
- New shared core script `scripts/send.mjs` (mod copy `bin/send.mjs`): message on stdin, opens the bot, pastes into the empty composer, checks the text landed and the same bot is still open, then a trusted Enter; `sent` once the composer empties. A draft in the composer is never touched (`draft`); a partial paste is cleared (`not-pasted`); the id is validated before any connection (`bad-id`). 7 tests over a fake app; 3 mod tests (tagged send, no line on a closed row, refusal toast). Live: `bad-id`, `no-bot`, `empty` refused before connecting; a tagged test message to NOVA 替身 w40 → `sent`, and it shows in the transcript as `You: [w:29a98092] …`.

## grok-bot-watch 0.7.6

- `ensure.mjs` review fix (Sol r5 `VERDICT: BLOCK`, P1): waiting for the app to exit gave up early when the next 2 s `pgrep` could not finish inside the window, so an app that died 2.5 s after `pkill -9` was left down with no relaunch. The wait now runs its whole window and ends on a look that starts at or after the window's end; that last look is counted in `QUIT_MS` (now 25 s), so the budget still holds. 18 tests: a kill that lands at 2.5 s is relaunched, one past its window returns `failed:quit` inside the budget, the quit phase stays inside `QUIT_MS` when the kill lands at the window's end, and the late-lock check runs with the lock freed at 16 s and at 22 s. Seven mutations each fail a test. Live: the app without the port, three callers → one `restarted`, two `ok`, one process.

## grok-bot-watch 0.7.5

- `ensure.mjs` review fixes (Sol r4 `VERDICT: BLOCK`). P1: the 75 s budget was checked only on entry, so slow real effects could still run past the callers' 90 s, even between a quit and its relaunch. Every effect now has a fixed bound (`T`: fetch 1.5 s, lsof/pgrep/pkill 2 s, sidebar 4 s, open 10 s), the real effects use those bounds as their timeouts, and each step starts only when its bound still fits: no wait round past the end, quit polling on the clock, not a count, a quit that hangs for 10 s is forced (`pkill -9`) so the relaunch still fits, and no quit starts without the time for quit plus relaunch (else `busy`). P2: a connection to the lock port no longer holds up the release. 14 tests, with each effect taking its whole bound in the new ones; six mutations (each guard, the forced quit, the count-based polling, the lock's dropped connections) each fail a test. Live: the app without the port, three callers → one `restarted`, two `ok` in 4 s, one process.

## grok-bot-watch 0.7.4

- `ensure.mjs` review fixes (Sol r3 `VERDICT: BLOCK`, two P1). The recovery lock is a listening socket on `127.0.0.1:<port+1>` instead of a lock directory: the kernel makes it exclusive and frees it when the holder exits or is killed, so there is no stale takeover to race and no other caller's lock to release. Lock wait and recovery share one 75 s budget inside the callers' 90 s, and nothing destructive starts with less than 45 s left (reopen, quit, launch): a caller that gets the lock late returns `busy`. 10 tests; dropping the budget guard fails the late-lock one; the lock test kills a holder with SIGKILL and takes the port. Live: three callers after a kill → one `launched`, two `ok`, one process.

## grok-bot-watch 0.7.3

- A wake says who the reply is for, before the app text: "it answers a message from this session" when it starts with this session's tag, else "it may answer another session's message … check the conversation before acting". Seen live: an untagged NOVA reply to the agent-scripts session woke a us-options-terrain session, which took it as its own.

## grok-bot-watch 0.7.2

- `ensure.mjs` review fixes (Sol r2 `VERDICT: BLOCK`, two P1). Recovery is serialized across processes by a lock (`$TMPDIR/grok-bot-ensure-<port>.lock`, stale after 2 min) and re-checked under it, so a late caller after one outage no longer quits the app an earlier caller just relaunched; a caller that waits returns `ok` once the port answers, or `busy` after 90 s. A listener counts as Grok Bot only when every listening pid (`lsof -t`) is a `Grok Bot` process: another program answering an empty target list is `port-taken` and nothing is opened or quit (0.7.0 reopened, then quit Grok Bot). `recover()` takes its effects as arguments; 7 tests drive it over a fake app, and dropping the re-check or the owner check fails them. Live: two callers after a kill → one `launched`, one `ok`, one process; a foreign listener → `port-taken`, Grok Bot's pid unchanged.

## grok-bot-watch 0.7.1

- Review fixes (Sol r1 `VERDICT: BLOCK`, P1). A session tag is a UUID session id's first 8 characters, else an 8-character hash of the whole id: two `local-` fallback ids shared `[w:local-ab]` under 0.6.2. A tag is exactly `[w:` + 8 `[0-9a-z]` + `]` at the start of the reply, so other bracketed text no longer counts. The new fallback test fails with the 0.6.2 token (59 pass, 1 fail).
- README states what the tag does not do: the echo is best effort, a quoted tag misroutes, one preview per bot drops a reply when two settle inside one read, streaming arms every watcher, and every watcher sees the panel's preview.
- `ensure.mjs` gets 90 s from the mod and the TUI (its slow path is about 57 s).
- `using-grok-bot-app` "Sending is gated": a message to one of our own agents inside an approved task goes without approval of its text (owner ruling 2026-10-03); hard-stop actions still need it.

## grok-bot-watch 0.7.0

- The CDP port moves from 9231 to 39231 (Chrome and Node debuggers sit at 9222-9230; other tools collided). `GROK_BOT_CDP_PORT` overrides it for the sidebar helper, `grok-bot-tui` and the mod (the engine runs the helper over its own environment). Each read reports the port it used.
- The tools keep the port up themselves, per the owner's standing rule (2026-10-02: restart Grok Bot without asking; an app update relaunches it without the flag). New `scripts/ensure.mjs` (skill; synced to the mod's `bin/`): renderer answers → nothing; port up with no window → `open -a`; app running without the port → quit and relaunch with it; not running → launch; another app on the port → left alone (`port-taken`). The mod runs it beside the tick on `port-down` / `renderer-missing`, at most once per 2 minutes, and toasts the outcome; the TUI does the same once per minute and shows it under the header. `sidebar.mjs` stays read-only. Permission surface: `$.process.run` is now also via `ensureApp`. Live on app 0.66.0: restart from 9231 to 39231 in 3 s, a second run `ok`, launch from stopped `launched`; `ensure` waits for the sidebar to list bots (the renderer answers a moment before it draws), and a reopen that fails falls through to quit-and-relaunch (a quitting app still listens with no page).

## grok-bot-watch 0.6.2

- A shared (primary) bot no longer wakes every watcher for every reply, once the bot echoes a tag. The watch receipt gives this session's tag, `[w:<sid8>]`; the session starts what it sends with it, and a settled reply that starts with another session's tag is recorded as seen but wakes nobody here. An untagged reply wakes every watcher, as before, so nothing changes until the bot echoes. Does not fix two replies settling inside one 10 s read (one preview per bot); per-task watch is the follow-up once the app's async-task rows are mapped.

## grok-bot-watch 0.6.1

- The conversation read names an email card's sender. A "New email" card (From … Subject, then the body) has no sender line; the parser took its last field label, so the open row showed `Subject` as who said it. It now reads `<sender above> · New email`. Seen live on US_STOCK (app 0.66.0); the new parse case fails on 0.6.0.
- `grok-bot-tui`: the list scrolls with the selection (a `↓ N more` line keeps its own row), a degraded read says how to fix it (the skill's Connect steps), the header counts replying and unread bots, and the detail wraps long messages and keeps the newest when the terminal is short (`↑ N earlier lines`). 8 TUI tests.

## grok-bot-watch 0.6.0

- Two packages, one core, as tmux-agent-tools does for workers. The row model (`settled`, `inProgress`, the draft/replying state, `clean`, `fit`, `ago`, the UUID checks) and the sidebar helper now live in the skill: `skills/using-grok-bot-app/scripts/{lib/core.ts,sidebar.mjs}`. The mod carries byte-identical copies (`hooks/lib/core.ts`, `bin/sidebar.mjs`) written by `scripts/sync-mod-core`; `test-version-sync-smoke` fails on drift. Why two: the mod is a Claude Code-only plugin whose cache holds only its own dir, and people install the skill differently (`npx skills` global or project, a checkout), so the mod must not depend on the skill's install and the skill must reach every host.
- New `skills/using-grok-bot-app/scripts/grok-bot-tui`: a full-screen, read-only sidebar view for any terminal (Codex, Cursor, agy, a shell). Bots with state and preview, Enter shows the conversation of the bot open in the app. Watches stay in the mod's session store and are not shown. Nothing is added to PATH.

## grok-bot-watch 0.5.2

- The band no longer vanishes on the last `[ unwatch ]` (live 0.5.1: the next watch then needed `/grok-bot-watch` again). A session that has watched a bot keeps `0 bots [ + ] [ close ]`; `[ close ]` (`f`, the fold slot, since there is nothing to fold) hides it until the next watch. A session that never watched still shows nothing. 57 tests pass; dropping the flag fails the unwatch test (1 fail).

## grok-bot-watch 0.5.1

- Live 0.5.0 fixes: the command's reply no longer reads `grok-bot-watch: grok-bot-watch:` (the engine already prefixes the plugin name), and a row whose bot name was never read (the app's CDP port was down at watch time) draws its uuid8 once, not `201040cc 201040cc`. 57 tests pass; the new test fails with the old row (1 fail).

## grok-bot-watch 0.5.0

- Watch without asking the model. `[ + ]` (`w`) in the panel header opens a bot-id field; Enter on a UUID or an 8+ char prefix watches it through the same path as the `watch` tool (`watchBot`), a refused id stays in the field with a toast saying why, Enter on nothing closes it. `/grok-bot-watch <id>` watches at once; bare, it opens the field, the way in while no watch keeps the band up. Mobile has no Input, so there only the command works. Deleting was already `[ unwatch ]`.

## grok-bot-watch 0.4.1

- The panel draws this session's watches only. 0.2.0 copied the workers panel's orphan idea without its other half: there an orphan is adopted by a collector in the same cwd so the result still lands; here a wake only means something to the conversation that armed it, so no session can take another's watch, and the `○ orphaned` row stayed in every session until the day-old prune. Each session watches its own bot; a dead session's record is still pruned after a day.

## grok-bot-watch 0.4.0

- An open row shows the conversation itself when that bot is the one open in the app: the last 5 messages of both sides, oldest first, with their times. The helper parses them from the transcript already on screen in the same read-only eval (0.59.1 has no per-message node: sender, body, then a `9:58 PM` line); it still never clicks. Another bot's row keeps the 0.3.0 list of replies that woke us. Review 0.4.0 (1 medium, 6 low): the sender is the line before the first blank line and the body is kept whole, so a message whose text ends in a time is no longer dropped; a failed read clears the conversation instead of showing a stale one. 12-hour times only (the app's format on 0.59.1). 53 + 6 tests pass; live: the helper read 5 messages from NOVA's open transcript.

## grok-bot-watch 0.3.0

- `[ ▸ ]` on a row (`o` with one watch) opens it to the last 5 replies that woke this session, newest first, plus the reply already there at watch time (`before watch`). They are the sidebar previews (≤ 140 chars) the mod already read, kept in the watch record (~1 KB per watch): no transcript read and no click in the app. A same-text reply is its own entry, so a repeat or a stopped reply shows in the list. The open row's lines come out of the same row budget (up to 9 rows), so the workers panel keeps its rows and digits.
- The tick and the wake/lost counts now rewrite a record one at a time, in call order, so a count landing mid-tick no longer writes a stale `armed` over the tick's (review 0.2.1, low). Unwatch and a new watch go through the same queue, so a tick mid-rewrite cannot write a deleted watch back (review 0.3.0, medium); unwatch closes the open row; stored previews are cut to 200 chars. 50 tests pass; each new behaviour put back fails a test (9 mutations).

## grok-bot-watch 0.2.1

- A reply whose text equals the last one now wakes when a read saw it streaming. Live 0.2.0: NOVA answered `收到` twice and the second never woke, because `armed` was only set before the first baseline. Replies that start and settle inside one 10 s tick with the same text still merge. 43 tests pass; each half of the fix put back fails the new test.

## grok-bot-watch 0.2.0

- Renamed from `grok-watch`: plugin `grok-bot-watch@agent-scripts`, tools `mcp__grok-bot-watch__watch` / `__unwatch`, store keys `grok-bot-watch.*`. Breaking: uninstall `grok-watch@agent-scripts`, install `grok-bot-watch@agent-scripts`, and watch again; old watches are not carried over.
- The panel is a band of its own: a magenta `▌grok bot watch` header with the version, bot count, how many are replying and the age of the last read, then one line per bot with its live state (`waiting`, `replying`, `new reply`, `draft in composer`, or the failed read), wake count and age, lost wakes, and the bot's last preview. `[ hide ]` folds it to the header (never gone while a watch is armed); `[ unwatch ]` stops a watch from the panel. Wake counts live in the watch record, so they survive a reload. Letter hotkeys only (`f`, `u`), none of the workers panel's `r`, `q` or digits.
- Review 0.2.0 fixes (fable 5.1, 4 medium + 3 low): the band's height is `maxRows` minus the rows the panels below drew, so it never pushes the workers panel into scroll mode (which disarms its digits); one row left shows the header only, two rows for many bots show the first bot, more add `+N more`. `u` is bound only when one watch shows. A wake is counted only when the submit is accepted. The state is fitted before the name, so a narrow band keeps it and `[ unwatch ]`. The panel shows the preview the `watch` call read before the first tick. The skill points at `grok-bot-watch`. 42 tests pass; each fix put back fails its test (8 mutations).

## grok-watch 0.1.2

- `mods/grok-watch` 0.1.2 — review 0.1.1 fixes (fable 5.1, 1 medium + 6 low). The helper reports `node-too-old` when the login-PATH node has no global `WebSocket` (Node < 22) instead of a misleading `eval-error`; README names Node 22+. A tick writes back from the fresh record, so a lost count that lands mid-tick survives. A submit answering `drop: undefined` is accepted, not lost. After a machine sleep, prune waits ORPHAN_MS (not one round) for other sessions to beat. The `watch` receipt carries only a full-UUID row id and labels the bot name as app data. New tests for each, plus the empty-preview arm and the tick gen guard: 29 pass, and each fix put back fails its test. Live: an external write to the store file is seen and pruned by this session, and a fresh one survives its writes.

## grok-watch 0.1.1

- `mods/grok-watch` 0.1.1 — the watch receipt names the mod version (`grok-watch 0.1.1: watching …`), so after a reload the session can see which code it loaded. Adds `scripts/test-version-sync-smoke`: marketplace entry, plugin manifest, `MOD_VERSION` and this file must agree.

## grok-watch 0.1.0

- `mods/grok-watch` 0.1.0 — first version: `watch` / `unwatch` tools, a 10 s read-only CDP sidebar read, one wake per new settled reply (ack-first), an AbovePrompt panel with orphaned rows from other sessions.
