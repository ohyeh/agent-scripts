---
name: session-handoff
description: "Creates comprehensive handoff documents for seamless AI agent session transfers. Triggered when: (1) user requests handoff/memory/context save, (2) context window approaches capacity, (3) major task milestone completed, (4) work session ending, (5) user says 'save state', 'create handoff', 'I need to pause', 'context is getting full', (6) resuming work with 'load handoff', 'resume from', 'continue where we left off'. Proactively suggests handoffs after substantial work (multiple file edits, complex debugging, architecture decisions). Solves long-running agent context exhaustion by enabling fresh agents to continue with zero ambiguity."
---

# Handoff

Creates comprehensive handoff documents that enable fresh AI agents to seamlessly continue work with zero ambiguity. Solves the long-running agent context exhaustion problem.

## Mode Selection

Determine which mode applies:

**Creating a handoff?** User wants to save current state, pause work, or context is getting full.
- Follow: CREATE Workflow below

**Resuming from a handoff?** User wants to continue previous work, load context, or mentions an existing handoff.
- Follow: RESUME Workflow below

**Proactive suggestion?** After substantial work (5+ file edits, complex debugging, major decisions), suggest:
> "We've made significant progress. Consider creating a handoff document to preserve this context for future sessions. Say 'create handoff' when ready."

## CREATE Workflow

### Step 1: Generate Scaffold

Run the smart scaffold script to create a pre-filled handoff document:

```bash
python3 ~/.agents/skills/session-handoff/scripts/create_handoff.py [task-slug] --model <your model ID>
```

Example: `python3 ~/.agents/skills/session-handoff/scripts/create_handoff.py implementing-user-auth --model claude-opus-5-5`

Pass `--model` with the model ID you run as: no CLI puts it in the environment. Without it, the Model line stays a `[TODO]` and the validator blocks.

Run it from the target project directory: the scaffold reads the project path,
git branch, and recent commits from the current working directory.

**For continuation handoffs** (linking to previous work). Pass `--continues-from` whenever this session resumed a handoff of the same task, and only then: without it the scaffold writes a fresh start, and the validator checks the carried Working Methods against the handoff it names:
```bash
python3 ~/.agents/skills/session-handoff/scripts/create_handoff.py "auth-part-2" --continues-from 2024-01-15-auth.md
```

The script will:
- Create `.claude/handoffs/` directory if needed
- Generate timestamped filename
- Pre-fill: timestamp, writer (CLI and session id), model, host name, project path, git branch, recent commits, modified files
- Add handoff chain links if continuing from previous
- Output file path for editing

### Step 2: Complete the Handoff Document

Open the generated file and fill in all `[TODO: ...]` sections. Prioritize these sections:

1. **Current State Summary** - State the last proven result with its evidence, work in progress, and what is blocked. Prefer the user's own words.
2. **Immediate Next Steps** - Put one next action beside the summary. Check it against the latest user corrections and authorization. Give its Source: a dated verbatim user quote (including a filled `Q-n` `ans:`) or a user-reviewed work record. Put ideas with no Source under "Agent Proposals (not requested)".
3. **Blockers/Open Questions** - Name what is still unverified or may look settled. Before you finish, ask: what might the next agent wrongly think is settled? Record the answer here. End with "Start here": the artifacts the next step needs first. List every other required read in Artifacts.
4. **Working Methods** - One row per method or tool the task used, in this or earlier sessions: what it does, `worked` or `failed`, the date, the run record (`path:line` or commit sha, never a brief or "used before"), and the conditions the result holds under (write `unknown` when they are not known). The record field holds one record only. Open each record before you cite it. Copy every row of the continued handoff whole; drop one only as `retired: <what> · <old record> · <newer record>`. A method that ran never goes under Assumptions Made.
5. **Important Context** - Critical info the next agent MUST know
   - Every approach the user REJECTED, quoted in the words they rejected it with.
   - Every correction the user made to a claim, and what the corrected claim was.
   - Any file path, branch, command, identifier, or number the user supplied.
   - Every approach you tried or considered and set aside, and why.
   - Every claim still UNCONFIRMED (no run this session), labelled as such.
6. **Decisions Made** - Choices with rationale (not just outcomes). Record the main rejected options, why each was rejected, and what new evidence would reopen it. Use the task's own decision or handoff file; do not create a standing DECISIONS.md.
7. **Mistakes and Corrections** - Wrong turns and user corrections, with evidence. Link an existing proposal by filename. For a correction of a class of behavior (for example, not reading earlier work), write the user's words, the record they pointed at, the check the next session does first, and where maintenance §2 put it; make that check an Immediate Next Step.
8. **Timeline** - First the nodes: one row per stretch of work from a user request to its verified outcome — time span, what was asked (user quote), what was achieved (files, behavior), the evidence that closed it (sha, test output, page), and status (`verified` / `open` / `dropped`). A resuming agent reads the nodes as the map and checks them against the rows below. Then the rows: each user message, ruling and correction as a `user` row (UTC time, short verbatim quote), and each state change (commit, push, deploy, worker start/stop) with its evidence. Run `resume_pack.py` (RESUME Step 3b) on this session's own log, or the Step 3b filter for a CLI it does not cover. Copy the `COUNT <n>` line of `user.txt` into the section and write one `user` row per line, from the full output, not from memory or a summary.
   Copy each resumed session's `<pack>/<sid8>/timeline.md` to `<project>/.claude/footprints/<sid8>.md` (RESUME Step 3b.2d).
9. **Sources Read** - Copy this session's resume status lines exactly as the reply printed them (`full · COUNT …` / `partial (…)` / `not read (…)` / `inherited full (from …)`). Never rewrite an `inherited full` line as `full`. In RESUME Step 3b, skip repacking sessions marked `full` or `inherited full` here.
10. **Standing Authorizations** - Every standing approval or scope grant the user gave, quoted verbatim with its date, each with the scope it covers. Copy every entry from earlier handoffs and compaction summaries forward unchanged; never restate one as "needs approval". List revoked or used-up ones with the user's words. Write "None" if there are none.
11. **Artifacts** - Every product of this session, one row each: `- <path or URL> · artifact|md|memory|run-dir|other · must-read: yes|no · <what it holds>`. Include published Artifact pages, `.md` reports and specs, shared-memory submissions, and run dirs. Mark `must-read: yes` when the next step depends on it. Write `- none · <reason>` only when there is no product. The validator blocks a handoff without a filled row.

Use the template structure in [references/handoff-template.md](references/handoff-template.md) for guidance.

### Step 3: Validate the Handoff

Run the validation script to check completeness and security:

```bash
python3 ~/.agents/skills/session-handoff/scripts/validate_handoff.py <handoff-file>
```

The validator checks:
- [ ] No `[TODO: ...]` placeholders remaining
- [ ] Required sections present and populated
- [ ] No potential secrets detected (API keys, passwords, tokens)
- [ ] Referenced files exist
- [ ] The Timeline has one `user` row per message its `COUNT <n>` line(s) counted
- [ ] Each Working Methods row cites a run record, and every row of the continued handoff is carried or retired
- [ ] Each Sources Read `full` line's pack dir exists and its `manifest.json` has the same COUNT and TOOLS (dir name = sid8); each `inherited full (from <file>)` names an existing handoff

**Do not finalize a handoff while the validator reports BLOCKED.** It blocks on
secrets, remaining `[TODO: ...]` placeholders, missing required sections, a
Timeline whose `user` rows differ from its COUNT total, a Working Methods row with no run
record or a dropped carried row, or a missing or unfilled Artifacts row, and exits nonzero.
Everything else is a warning.

### Step 4: Confirm Handoff

Report to user:
- Handoff file location
- Validation verdict (READY / BLOCKED) and any warnings
- Summary of captured context
- First action item for next session

## RESUME Workflow

### First stage: give the first reply

Read the chosen handoff whole, not by sections or line ranges. Before you choose or replace a method, read its run record.

When the user asks for the whole task, its earlier sessions or a full catch-up (quick-say 前情提要), give one complete read-only reply: do R1–R5 and Step 3b, open every artifact the chain's handoffs list (not only `must-read: yes`), then reply and stop. Otherwise the first reply may be `partial` (R6), and Step 3b follows before any dispatch, project write or completion claim.

In R1, first list every source in scope. Read them in this order: the handoff and the handoff it continues from; the records its Working Methods or its Sourced next step cite; artifacts; the project's rules, notes, tools and memory, the global rules the handoff cites, and shared memory; then the previous session, the one that wrote the chosen handoff. Read more than one session only when the user asks for it (names the sessions or asks for the whole history); otherwise an older session's timeline comes from its footprint and the handoffs. Read a session log through pack pages, or through the filter in Step 3b for a CLI with no pack. If the context nears its limit before the list is done, stop reading and reply `partial`: what you read, each unread source as `not read (context limit)`, and the first one to read next. Continue from that source in the next session or after compaction; do not ask the user to choose. Ask only when access or scope is the user's to decide. Decide nothing that depends on an unread source: no method choice, dispatch, project write or completion claim.

#### Step 1: Find the task (R1–R2)

- **R1.** List recent CREATE handoffs and run dirs. Match the latest handoff and run dir by task, files and chain links. Use the handoff the user names. Ignore retired `compact` copies. `Written by` identifies the writer, which can be a previous session. With no handoff match, use the sessions on the same task from the last 24 hours. Find the latest user ruling. Report an uncertain match as unconfirmed.
- **R2.** Read, whole: the chosen handoff and its Working Methods; the handoff it continues from; each "Start here" item and every `must-read: yes` artifact (open a page's body); in each run dir the handoff, a Working Methods row or the Sourced next step cites, `plan.md`, `state.md` and every file they cite; the project's own instructions (`AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, `.agents/rules/`), task notes, tools (`scripts/` and the commands its docs name) and the project's own memory and notes (locations differ by project: find and list them first, for example `MEMORY.md`, `USER-MEMORY*.md`, `.claude/memory/`, `.specify/memory/`, `memory/`, `notes/`; read the entries for this task); each `~/.agents/rules/` file the handoff cites and the routed rule files for the next step (the kernel is already loaded); and, only as a lead after the project's memory, shared memory (`read_memory.py` with the task's tools and topic as keywords, not the project name; narrow the keywords if the output is large). Report each one read, or not read with the reason, and each pointer that leads nowhere.

#### Step 2: Check freshness (R3)

- **R3.** In one batch, compare the recorded branch and uncommitted changes with `git branch --show-current` and `git status --short`. Use `git log <handoff-sha>..HEAD -- <next-step-paths>` to check for later commits to files the next step needs. Ignore commits that only touch the handoff. Run `validate_handoff.py <handoff-file>` and check for READY. A missing comparison input or failed check triggers D1. Age alone does not.

#### Step 3: Read the record and report (R4–R6)

- **R4.** For the handoff writer's session (or the session found by R1), build a Claude Code or Codex reading pack in the task run dir: `python3 <skill-dir>/scripts/resume_pack.py --out <run-dir>/pack "$LOG"`. Read all pages of `user.txt` and only the last page of `footprints.txt`, with `resume_pack.py --read <file> --page <n>`. For the last page number, use `len(pages_of(text))` from the pack script on the file text, without printing earlier pages. For another CLI, use the log sources below and report any part you cannot read.
- **R5.** Run a read-only live check of the checkpoint the next step depends on. Quote the command and its output. A matching HEAD or a file that exists is not evidence of the checkpoint.
- **R6.** Reply with the supported checkpoint, the next step and its Source, the live check, what remains unread or unverified, and the next check. Mark the status `partial`. Mark any claim that depends on an unread artifact as unverified. If `user.txt` is incomplete or the R5 receipt is missing, leave any next step that depends on it undecided. Read and verify that node before acting on it. This reply gives no basis to dispatch, write project files, declare completion, or record `full` in Sources Read.

### Second stage: read the sessions behind the task

Run Step 3b on every resume before you dispatch, write project files or claim completion. Once one of these applies, finish the inputs it needs and run Step 3b before the next step:

- **D1.** A freshness check in R3 fails or cannot run. Age by itself is not a trigger.
- **D2.** The handoff conflicts with live state or a required artifact. Two user corrections on the same point also trigger D2.
- **D3.** Count only structured failure rows: run `grep -cE '^  T[0-9]+ [^ ]+ L[0-9]+ fail[[:space:]]' "$PACK/footprints.txt"` with `PACK` set to the writer's pack directory. Use `manifest.json` field `tools` as the denominator. Trigger only when `tools > 0` and `10 × failures >= tools`. Treat grep exit 1 as zero matches. Treat a read error or a missing or invalid tool count as D1.
- **D4.** The user asks for the whole task or asks about a node you did not read.
- **D5.** Dispatch, a project write, or a completion claim depends on a node you did not read.

### Step 3b: Read the sessions behind the handoffs

1. Read the chosen handoff and each linked CREATE handoff. Read every user-reviewed work record and every `must-read: yes` artifact body not read in R2. Record each artifact as `- artifact <path or URL> read` or `- artifact <path or URL> not read (<reason>)`. Read the `plan.md` and `state.md` of each run dir that a Working Methods row or the continued handoff cites, and every file they cite. List the previous session (the newest writer session) and user-named sessions; read each as in 2. For an older session of the chain, take its timeline from `<project>/.claude/footprints/<sid8>.md` and the handoffs, not from memory. Open its log only when the user asks for it. When the next step depends on a node only an older log holds, mark that node unverified and name the session in the reply; report the session as `not read (older session; handoff text only)`.
2. Read and check each listed session yourself. Build the pack as in R4. Keep it in the task run dir for CREATE and validation. A parse error means `not read`. Pack subagents only if the parent tool result failed, was cut, or lacks evidence the next step needs. The pack has `user.txt` (COUNT), `footprints.txt` (TURNS), `tools.txt` (TOOLS), slices with inputs and results, and `manifest.json`.
   a. Use `resume_pack.py --read <file> --page <n>` on every page of `user.txt` and `footprints.txt`. Each READ stamp gives the total pages and binds the output to its body. A sample, Read tool, or piped `tail` does not count as a full read. Do not delegate the reads.
   b. Check all conclusions the next step needs, completion claims for open asks, every `fail`, and unsettled `noresult` or `delegate` calls. For a settled failure, name both calls in its node. Use a live read-only check for current state. For past events with no live proof, print one call with `resume_pack.py --call <pack>/<sid8> T<n> --page <k>`, all pages, in calls separate from live checks. Never replay a write, push, deploy, send or install as proof. Mark missing proof `unknown`.
   c. Fill only gaps the next step depends on. For commits, read the relevant hunks; for pages, read the contents.
   d. Write `timeline.md` in `<pack>/<sid8>/`: one line per work-list item, starting `- `, each with `asked` (user quote), the claim, `evidence` and a light: `lit` (account and evidence agree, and the line is bound to an observation: a `T<n>` whose `--call` block was printed whole after the resume prompt, or a backticked output string of 8+ characters that a live check printed after it and no earlier tool input typed: quote what the check added, such as a line number, a subject or a path, not only the string you searched for; reads of the pack, handoffs or footprints and echo/printf output do not count), `dim` (account only, or a summary only), `dark` (`unknown`, account and evidence disagree, or the user corrected that turn). Each node line ends with its light as its own field (` · lit`, ` · dim` or ` · dark`); every `fail` pointer's `T<n>` is named in a `lit` or `dark` node, never a `dim` one. The claim gate checks these. The next step relies on no `dim` or `dark` node; it continues from the last `lit` node, and its Source is a user quote or evidence that the work is unfinished. At CREATE, copy each pack's `timeline.md` to `<project>/.claude/footprints/<sid8>.md`; the next resume opens its `dim` and `dark` nodes again, and the record behind any node the next step depends on.

   | CLI | Session log | Cheap read |
   |---|---|---|
   | Claude Code | `~/.claude/projects/<project>/<session-id>.jsonl` | `resume_pack.py` (above) |
   | Codex | `~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<session-id>.jsonl` or `.jsonl.zst` | `ctx_execute` if context-mode is installed; else write the output to a scratch file and read it in pages |
   | Cursor CLI | `~/.cursor/projects/<project-slug>/agent-transcripts/<session-id>/<session-id>.jsonl` | `ctx_execute` if context-mode is installed, or an `explore` subagent |
   | agy | `~/.gemini/antigravity-cli/brain/<conversation-id>/.system_generated/logs/transcript.jsonl` | `invoke_subagent` with model `flash`, or `run_command` output into the conversation's `scratch/` |

   Set `LOG` to the session log first; an empty path makes jq wait on stdin.

   `user.txt` keeps typed messages, messages sent while the agent worked, AskUserQuestion answers (`Q: … → A: …`), pasted text, quote replies, images (`[image]`), slash commands and side-agent notes the user sent on; it drops plugin and meta rows, hook feedback, skill bodies and messages from other sessions. The filters live in `resume_pack.py` only. An answer to Codex's own question was not found in any Codex log: report it as `not recorded in the log`, never as read.

   Cursor CLI and agy have no pack yet: run the filter below for the user's side, and mark the session `partial (agent side not read)` unless you read its tool rows another way and say how.

   Cursor CLI (no timestamp field: the time is the `<timestamp>` element, the words are the `<user_query>` element):

   ```bash
   jq -rn '[inputs | select(.role=="user") | ([.message.content[]? | select(.type=="text").text] | join(" ") | gsub("[\\r\\n\\t]+";" ")) as $t
     | ($t|capture("<user_query>(?<q>.*)</user_query>")?.q // empty) as $q
     | select($q|test("^\\s*(Briefly inform the user about the task result|Perform any necessary follow-up)")|not)
     | "\($t|capture("<timestamp>(?<ts>[^<]*)</timestamp>")?.ts // "(no time)")  \(if ($t|test("<image_files>")) then "[image] " else "" end)\($q|gsub("^\\s+|\\s+$";""))"]
     | (.[]), "COUNT \(length)"' "$LOG"
   ```

   A message sent while the agent worked and a reply to its question are later `role=="user"` rows. The two dropped queries are system injections. `~/.cursor/chats/<bucket>/<session-id>/store.db` holds the same session as blobs; do not point jq at it.

   agy:

   ```bash
   jq -rn '[inputs | select(.type=="USER_INPUT") | (.content|tostring) as $c
     | "\(.created_at[0:19])  \(($c|capture("<USER_REQUEST>(?<r>[\\s\\S]*?)</USER_REQUEST>")?.r // $c) | gsub("[\\r\\n\\t]+";" ") | gsub("^\\s+|\\s+$";""))\(if ((.media // [])|length)>0 then " [media]" else "" end)"]
     | (.[]), "COUNT \(length)"' "$LOG"
   ```

   Typed messages are `type=="USER_INPUT"`; images are in `media`. Messages sent while agy worked and answers to its questions are reported to be `USER_INPUT` too, but no log has shown one yet (UNCONFIRMED): if you find them elsewhere, include them and say so.

3. The user's latest correction or ruling wins. Correct the account before stating scope.
4. In the task run dir, merge the verified nodes, handoff timeline, user messages and live state into a timeline ending at the current checkpoint. Do not brief or dispatch a worker or edit project files until the timeline matches live state.

In the second-stage reply, name the timeline and its latest user correction and authorization. Report each handoff as `full`, `partial (<range>)` or `not read`, and each session using:

- `- <sid8> full · COUNT <n> · TOOLS <n> · pack <dir>` — `<dir>` is the session's pack directory `<pack>/<sid8>`; only after 2a–2d; COUNT and TOOLS are the manifest's, `user.txt` and `footprints.txt` were read whole by you, every work-list item (2b) has a `lit` or `dark` node, and `timeline.md` has no `dark` node the next step depends on.
- `- <sid8> partial (<what is missing>)`
- `- <sid8> not read (<why>)`
- `- <sid8> inherited full (from <handoff file>)` — a session an earlier resume read, carried forward by Step 3b.1. It is not your read: never write it as `full`.

### Step 4: Verify scope before acting

Check the repo, branch, blockers, filled `Q-n` `ans:`, assumptions and file conflicts that affect the next step. Confirm its Source. The latest user quote wins over older quotes and user-reviewed records. Agent notes give no authorization. Treat missing Sources as proposals and unchecked Sources as unconfirmed. A Source decides scope, not method. Keep any method the user named. Before you first propose how to do a step, write the recorded method, its last result and the conditions it held under: from Working Methods, or, for a handoff without that section, from the brief or record the Sourced next step cites, traced to its run record. Change the method only on the user's words, or a record that it failed or does not fit this step's conditions, and give evidence for the new method's premise too. Without that evidence, propose only a read-only check and leave the method open. Never list a recorded method as an agent proposal.

### Step 5: Begin work

Check the latest corrections and authorization against the first Immediate Next Step. Complete Step 3b before dispatch, project writes or completion claims. Use Critical Files, Working Methods and Potential Gotchas as needed.

### Step 6: Update or Chain Handoffs

As you work:
- Mark completed items in "Pending Work"
- Add new discoveries to relevant sections
- For long sessions: create a new handoff with `--continues-from` to chain them

## Handoff Chaining

For long-running projects, chain handoffs together to maintain context lineage:

```
handoff-1.md (initial work)
    ↓
handoff-2.md --continues-from handoff-1.md
    ↓
handoff-3.md --continues-from handoff-2.md
```

Each handoff in the chain:
- Links to its predecessor
- Can mark older handoffs as superseded
- Provides context breadcrumbs for new agents

When resuming from a chain, read the most recent handoff first, then each predecessor whole. Step 3b.1 lists the sessions behind them.

## Storage Location

Handoffs are stored in: `.claude/handoffs/`

Naming convention: `YYYY-MM-DD-HHMMSS-[slug].md`

Example: `2024-01-15-143022-implementing-auth.md`

## Resources

### scripts/

| Script | Purpose |
|--------|---------|
| `create_handoff.py [slug] [--continues-from <file>]` | Generate new handoff with smart scaffolding |
| `validate_handoff.py <file>` | Check completeness, quality, and security |

Listing and staleness need no script — see the RESUME workflow above.

### references/

- [handoff-template.md](references/handoff-template.md) - Complete template structure with guidance

## Exit

After CREATE passes the validator, report the handoff; if the session produced new, reusable knowledge with checkable evidence, load skill `shared-memory-intake` and follow its SKILL.md (do not run its scripts from memory). After a full catch-up reply (quick-say 前情提要), stop. After any other RESUME, start the first Immediate Next Step whose Source and checkpoint you verified, once you have completed Step 3b. Follow the R6 limits until that verification is complete. Stop instead at a kernel hard-stop or the edge of the authorized scope.
