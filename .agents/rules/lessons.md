# Lessons — 活案工作集（append-only；format per rules/maintenance.md §3 — NON-NORMATIVE）

只留「尚未處置完的活案」。條目畢業（折入 rules/kernel/skill/hook 的核准 commit）即刪；
歷史在 git log（2026-08-08 W32 清算：48 條 → 折入 judgment-rubrics §2/§4/§5、
model-dispatch §3/§4、maintenance §5、harness-diagnosis 信任層之後，餘下如下）。

## 2026-08-08 | scope: agent-device | trigger: 使用者更正根因——simulator 被開不是副作用，是 `open` 沒帶 `--device` 時預設落到 simulator（實機與同名 simulator 並存）
Rule: `agent-device open`（mobile 平台）必帶 `--device <name-or-udid>`；已由 PreToolUse gate `agent-device-target-gate.sh` 強制（web/macOS 豁免）。
Status: adopted   # gate 上線 2026-08-08，兩機部署；觀察一週無誤擋即刪本條

## 2026-08-13 | scope: rule-reading | trigger: ONE OWNER 的 Exception 句，前半授權 `--detach` 被執行、後半 `bounded harvest` 被忽略，前景阻塞 420s；同一份 byte-identical SKILL.md 在另一機做對過
Rule: 等待成本在哪一步都算成本 — 把阻塞從 assign 搬到 harvest 不算解決。（前半「授權與限制同等強制、先讀完整句」已折入 judgment-rubrics preamble，2026-08-13 畢業）
Status: proposed

## 2026-08-14 | scope: retry-doctrine | trigger: W33 retro——App→FIG 迴圈已有 fresh 根因證據（builder source 缺失、Auto Layout 1.88% vs 95%）仍被三輪 session 重跑，燒 ~1.4B tokens 零進度
Rule: 已有 fresh 證據證明某路徑不可行時，重跑同路徑前必須先推翻該證據；否則直接 BLOCK 上報缺口（缺的是外部依賴，不是 compute）。落點：judgment-rubrics §3（retry）。
Status: proposed   # 使用者 2026-08-14 裁決通過，待折入

## 2026-08-14 | scope: delegation-budget | trigger: W33 retro——兩個 userMsgs=0 的 codex worker 各燒 ~200M tokens 無人止損；kernel「unattended loops 先問」存在但 delegation brief 沒帶進去
Rule: delegated worker brief（GOAL/ACCEPTANCE/REPORT）必帶預算欄：token/輪數上限＋「連續 N 輪 gate 不過即停並上報」。落點：delegation-templates ＋ model-dispatch。
Status: proposed   # 使用者 2026-08-14 裁決通過，待折入

## 2026-08-14 | scope: handoff-format | trigger: W33 retro——blocked handoff 未帶「已證明不可行的路徑」，後繼 session 把前人結論當 lead 重驗三輪
Rule: blocked handoff 必填「已燒成本＋已排除路徑（含證據指標）」節；後繼 session 禁止重驗未被推翻的已排除路徑。落點：session-handoff 格式。
Status: proposed   # 使用者 2026-08-14 裁決通過，待折入

## 2026-08-18 EMFILE kills worker Stop hooks under load
Status: proposed
Evidence: session 37839e4b — adversarial-kernel worker finished in 16m but its
Stop hooks died 3x with "Too many open files (os error 24)", leaving
result.json stuck at `pending`; supervise/result-wait then blocks until
timeout. At diagnosis time kern.num_files was 7724/122880 and the tmux server
ulimit -n was 1048576 — per-pane fd limits ruled out; the pressure was
transient (6 concurrent codex tmux workers + browsers). Root cause UNCONFIRMED.
Lesson: a finished worker with pending result.json + Stop-hook EMFILE in the
pane is a HARVEST-DIRECTLY signal, not a hang; on next EMFILE capture
`sysctl kern.num_files` and `lsof | wc -l` immediately before touching anything.

## 2026-08-18 EMFILE refined chain: Codex app-server MCP pipe-FD leak, 256 as trigger
Status: proposed
Supersedes-detail-of: "2026-08-18 EMFILE kills worker Stop hooks under load".
Chain (user-verified snapshot): long-lived Codex app-server → stdio MCP /
subagent churn → teardown leaves PIPE FDs (PID 15073, ~11h: 159 lsof rows,
90 PIPE, 30 children) → launchd soft RLIMIT_NOFILE 256 becomes the trigger →
EMFILE. Upstream: openai/codex #26984, #34410; local CLI 0.147.0 (rmcp 3.0.0,
non-blocking MCP startup) installed 08-08. Root cause of the original incident
stays UNCONFIRMED (no RLIMIT/EMFILE log captured at the time).
Rules: (1) raising limits is mitigation, not the fix — the leak is upstream;
(2) RLIMIT_NOFILE is per-process and fixed at spawn — after raising launchd
limits, RESTART existing app-server/workers and re-verify a child's actual
limit; (3) on next EMFILE capture, before touching anything:
`sysctl kern.num_files`, `launchctl limit maxfiles`,
`lsof -p <app-server-pid> | awk '$5=="PIPE"' | wc -l`.

## 2026-08-18 assign confirm-step false-pass on Codex 0.147.0 startup banner
Status: proposed
Evidence: worker smcs2050-review (.44) — assign completed its bring-up, but the
brief sat UNSUBMITTED in the composer (placeholder visible, "Context 100% left",
no output) for 6+ min; the 0.147.0 startup banner/warnings swallowed the Enter.
assign's confirm-the-pane-is-processing step passed anyway (it matched brief
text echoed above the banner, not actual processing).
Lesson: (1) "brief text visible in pane" is NOT proof of submission — proof is
working/thinking output or Context consumption; (2) recovery = send-wait to the
SAME worker (persistent-teammate rule), never re-assign; (3) candidate tooling
fix: confirm step should assert composer is empty AND context < 100%.

## 2026-08-18 dispatch verification: dry-run/probe evidence does not transfer
Status: proposed
Evidence: SMCS-2050 review dispatch (.44) — (a) `start --dry-run` showed profile
launch_flags correctly, but the actual dispatch used `assign` (different code
path); worker came up on config-default luna max, generation unattributable
(pre-launch_flags launch-meta). (b) `probe --metric tool_active` returned true
with parsed_from = a line of the BRIEF itself — pane-text matching false-positives
when the brief contains the keyword.
Lesson: (1) model/flag proof = the CLI status line (or launch-meta launch_flags,
recorded since tmux-agent-tools 70c3d7b) read AFTER launch, before sending the
brief — never a dry-run of a different subcommand; (2) liveness proof = Context
percentage consumption, not probe pane-matching; (3) mid-run rate-limit "switch
model?" prompts: keep the user-specified model, report the limit, never swap to
finish.

## 2026-08-18 single-channel observability: result.json is the worker's LEAST reliable output
Status: proposed
Evidence: SMCS-2050 review (.44) — reviewer FINISHED (VERDICT: BLOCK in pane,
14:48) but never wrote result.json (brief lacked the literal result path; also
pointed at git diff while changes sat staged). Waiter watched only result.json
→ three successive misreports ("running", "harvest alive", "still pending");
"Context 93% left" was post-completion residue misread as progress.
Lesson: (1) harvest verdicts from TWO channels — result.json AND the pane's
terminal marker (VERDICT/RESULT SUMMARY); a worker without an injected result
path can only answer in the pane. (2) `start`+send loses assign's result-init/
path-injection — hand-built briefs MUST embed the literal result path.
(3) Brief preflight question: "a reviewer starting from zero — does it SEE what
I want reviewed?" (staged vs unstaged diff, file visibility). (4) A dispatched
background waiter is not a live waiter — exit code first, then trust.

## 2026-08-18 correction: "banner swallowed the Enter" false-pass claim is UNCONFIRMED
Status: proposed
Corrects: "assign confirm-step false-pass on Codex 0.147.0 startup banner" (same
day). Its evidence — composer placeholder + Context 100% — was later shown to be
a misread (placeholder is permanent UI text) and the generation was
unattributable. The narrow lesson that SURVIVES: submission/liveness proof =
Context consumption + worker-written files (result.json, usage.jsonl), never
placeholder text or observer-written files (pane-hash). The confirm-step
tooling-fix suggestion is downgraded to needs-reproduction.

## 2026-08-18 | scope: execution | trigger: session handed a project-answerable question back to the user (iOS fastlane env drift) instead of searching the repo
Rule: before asking the user anything, exhaust the project's own record — sibling/platform implementations, `*.example` files, the lane/script that owns the value, docs/, CI config, and `git log` for the touched key; only a genuine preference (cost, risk appetite, priority) may go to the user, and the question must state what was already searched.
Status: proposed

## 2026-08-19 | scope: harness | trigger: worker completed the task but result.json stayed non-terminal — the injected contract never reached the pane, while both "injected" sentinels were written
Rule: never write a completion marker you have not verified; if you cannot verify, leave it unmarked. A sentinel that records intent (the paste command was issued) instead of arrival (the text is visible in the pane) converts a transport miss into a permanent silent failure, because `*_should_inject` is sentinel-gated and skips forever after.
Evidence: remote `agy-cli-blindagy2` (launch_id blindagy2-20260819T035147Z-9fe4, .44) answered all nine questions and went idle. `tmux capture-pane -p -J -S -` over the FULL scrollback contains neither `Write final JSON to this exact path:` nor `Ignore any project-local agent instructions` — yet `.result-path-injected` and `scope-guard-injected` both exist (0 bytes). audit.jsonl shows two `send.multiline` with enter_count 1; only sha256 is stored, so the wrapper cannot prove what landed. agent-tmux :5238-5252 verifies prompt arrival by nonce echo, then marks the injection sentinels 14 lines later with no verification at all.
Same pattern, three places: the injection sentinel (:2461), the retired `status:"success"` result seed (#317, now `pending`), and `launch_envelope_inline_block` (assumes the shell reaches statement 2).
Status: proposed

## 2026-08-19 | scope: maintenance | trigger: a full session of diagnosis produced zero artifacts because the session invented an approval gate that the §1 matrix does not impose
Rule: read the §1 row before claiming a gate. `rules/lessons.md` is "append entries freely"; only deletions/rewrites and proposed→adopted need approval. Where a diff IS required, producing the diff is the session's own first step — never substitute "shall I open the diff?" for the diff. A turn that identifies something worth recording must contain the record or the diff, not an offer of one.
Evidence: 2026-08-19 session 37839e4b. Confirmed the injection-delivery defect above, overturned two of its own wrong diagnoses, and designed three mechanisms; `git log --since='2026-08-19 00:00'` = 0 commits, repo files modified = 0, CC file-history = empty. Offered to open a lessons.md diff three times across the session while the matrix already permitted a direct append. Deploy therefore shipped the previous night's tree; the user caught it, not the session.
Status: proposed

## 2026-08-20 | scope: execution | trigger: a rules claim about SendMessage matching semantics was sourced from `strings -a` on the CLI binary and turned out to be false
Rule: a string constant found in a binary proves only that the string EXISTS; it never proves how the program uses it. `strings`/`grep` over a compiled artifact cannot read control flow, so any claim about BEHAVIOUR (matching semantics, precedence, validation) must be settled by running the operation, not by reading the binary. Reading the binary is not "closer to the source" than reading a schema — both are static, and neither is behavioural evidence.
Evidence: `session-titles.md:10-12` asserted "SendMessage({to}) matches against the title, start-anchored, so a UNIQUE PREFIX delivers just like an exact match (verified against CLI 2.1.237)". That "verification" was `strings -a` output. Live four-cell probe across two machines and two targets (sessions d0f81d85 and 37839e4b, CLI 2.1.237): prefix → refused; prefix + ref → refused; full name + ref → delivered; full name without ref → delivered. Semantics are exact full-name match; ref is harmless, not required. Cost of the wrong method: three failed SendMessage calls plus a committed rule that could not work.
Corollary, same day, both hosts: the `to` schema `^[\s\S]{0,300}$` is real and inclusive — 300 characters clears validation and fails later at resolution, 361 is refused as `InputValidationError` at the tool boundary without ever reaching resolution. So failures come in three layers, and the layer names the next move: schema (your string is malformed — do not go looking at ListAgents), resolution (`is named … exactly` = found but under-specified, `is not reachable` = nothing matched), delivery. Reading the schema gave the number; only running it gave the boundary and the layering.
Method note: the cap was probed with a deliberately nonexistent 300-character recipient. A real target would have delivered and hidden the validation layer under a success — when testing a boundary, pick a target that cannot succeed.
Status: proposed

## 2026-08-20 | scope: harness | trigger: two sessions spent several rounds designing a "stable address" inside the session title while the protocol was already handing them a stable address in every message envelope
Rule: when a protocol delivers an identifier to you, test that identifier as an address before designing one. A cross-session message arrives with `from="bridge:session_<bridgeSessionId>"`; that value delivers as `to` verbatim, does not change with status/outcome/title, and is not one-shot like ` [ref]`. The session TITLE is therefore not an address and must not be engineered into one — titles are for humans. The machine address is derivable on demand: `jq -r 'select(.sessionId==env.CLAUDE_CODE_SESSION_ID) | "session_" + (.bridgeSessionId|sub("^session_";""))' ~/.claude/sessions/*.json`.
Evidence: probe from d0f81d85 with `to: bridge:session_016dsMjMi8f5WzHF6hivZfi1` (the raw `from` attribute of the peer's message) returned success with no name-resolution warning; the reverse direction had already succeeded earlier in the same exchange. This dissolves — rather than trades off — the conflict that a status-bearing title cannot also be a stable address: the two live in different namespaces. Consequences for `.agents/rules/session-titles.md`: the prefix-delivery claim (:10-12) is falsified, "address a peer by the `<host>-<sid8>` head alone" (:16) cannot work, "the title is also the cross-session address" (:10) is the false premise under the whole section, and the 200-char cap's stated rationale (:19-21) evaporates — any real cap belongs to SendMessage's `to`, not to the title. The `<host>-<sid8>` format may still earn its place as a human-scannable machine marker, but it carries no delivery role.
Related: the same session's earlier rename defect (9d3703d) and this one share one shape — a snapshot quoted from history was treated as the live record. Both had a live source available at the time.
Status: proposed

## 2026-08-20 | scope: harness | trigger: an error message's suggestion was read as advice it did not give
Rule: when a tool's error message suggests a fix, re-read what it literally prints before acting. `SendMessage` answers a prefix `to` with `No agent is named 'X' exactly. Re-send with the ref to confirm you mean: <FULL NAME> [ref]` — it prints the full name and the ref on one line, which reads as "add a ref to your prefix". Retrying as prefix + ref fails with a different error (`is not reachable`), so the misread costs a whole round trip. Two distinct failure modes exist: the target was resolved but needs confirming, versus it was never resolved.
Evidence: 2026-08-20, both hosts, five-cell delivery test. Prefix and prefix+ref both fail; exact full name (with or without ref) and `bridge:<bridgeSessionId>` both deliver. Verbatim errors in sessions 37839e4b / d0f81d85.
Status: proposed

## 2026-08-20 | scope: tools | trigger: a handoff passed its own validator while failing the repo's public-safety check — the two judge the same string by opposite criteria
Rule: knowing what a validator does NOT check is part of trusting its PASS. `session-handoff`'s `validate_handoff.py` has no secrets/privacy check at all: its only path logic is `check_file_references()`, which extracts paths from the body and records them as valid when the file EXISTS — so an absolute home-directory path is scored as a good reference, and the more real it is the more surely it passes. `check-rules-invariants.mjs`'s `public-sensitive-literals` forbids exactly that string. One tool rewards a resolvable path, the other forbids a leakable one; a PASS from the first is not evidence about the second.
Second defect, same file: the checker prints only the FIRST match per file, so fixing it and re-running surfaces a different literal and invites the wrong conclusion that the first diagnosis was mistaken. Here line 5 (`- Project: <absolute home path>`) was the real first hit; after redacting it, three Tailscale IPs (lines 33/87/173) appeared, and this session wrongly concluded the home path had never been a hit. A checker that reports one finding at a time reads as "that was the problem" rather than "that was the first problem".
Evidence: 2026-08-20, `.claude/handoffs/2026-08-20-122706-session-title-as-address.md`. Both classes redacted (`~/git/agent-scripts`, `<peer-host>`/`<this-host>`); the cell then passed. Peer session 37839e4b quoted the original first line verbatim, which is how the misattribution was caught. Verbatim originals: `ops/evidence/2026-08-20-sensitive-literals-handoff.md` (outside the checker's pathspec).
Status: proposed

## 2026-08-20 | scope: execution | trigger: two `deploy exit=0` runs left the just-edited file stale in `~/.agents/rules/`, while the script's own `PASS [rules] 0 diff` passed both times
Status: proposed
`scripts/deploy.sh` deploys `origin/main`, NOT the working tree: `resolve_release()` takes the SHA from `git ls-remote <url> refs/heads/main`, `download_release()` extracts that tarball to a scratch dir, and every layer copies from `$SRC` (deploy.sh:36-48, 80). So an uncommitted or unpushed edit CANNOT reach runtime, and the deploy still exits 0. Its internal `diff -rq ~/.agents/rules/ "$SRC/.agents/rules/"` (deploy.sh:81) compares runtime against that same downloaded tree, so it passes by construction and can never detect the gap. Both observed drifts were edit-then-deploy-before-push; two deploys on the already-pushed tree at `58a7251` were IN_SYNC, consistent with this and not with a race. Correct order is commit, push, deploy, then an external `diff -rq` against the working tree. This also falsifies two guesses made from memory in the same session — mine, that deploy copies the working tree, and the peer's, that it reads the current working directory.

