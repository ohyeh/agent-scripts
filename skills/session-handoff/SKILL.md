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

**For continuation handoffs** (linking to previous work):
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

1. **Current State Summary** - What's happening right now
2. **Important Context** - Critical info the next agent MUST know
3. **Immediate Next Steps** - Clear, actionable first steps. Each item names its Source: a user quote or a user-reviewed work record.
   A user quote is the user's verbatim words with a date; a filled `Q-n` `ans:` counts.
   A user-reviewed work record is an artifact page or spec the user reviewed. A handoff or an agent note is not one.
   Put your own ideas under "Agent Proposals (not requested)".
4. **Decisions Made** - Choices with rationale (not just outcomes). Record the main rejected options, why each was rejected, and what new evidence would reopen it. Use the task's own decision or handoff file; do not create a standing DECISIONS.md.
5. **Mistakes and Corrections** - Wrong turns and user corrections, with evidence; a rule proposal goes to `~/.agents/retro-inbox/pending/` and only its file name goes here
6. **Timeline** - First the nodes: one row per stretch of work from a user request to its verified outcome — time span, what was asked (user quote), what was achieved (files, behavior), the evidence that closed it (sha, test output, page), and status (`verified` / `open` / `dropped`). A resuming agent reads the nodes as the map and checks them against the rows below. Then the rows: each user message, ruling and correction as a `user` row (UTC time, short verbatim quote), and each state change (commit, push, deploy, worker start/stop) with its evidence. Run `resume_pack.py` (RESUME Step 3b) on this session's own log, or the Step 3b filter for a CLI it does not cover. Copy the `COUNT <n>` line of `user.txt` into the section and write one `user` row per line, from the full output, not from memory or a summary.
   Copy each resumed session's `<pack>/<sid8>/timeline.md` to `<project>/.claude/footprints/<sid8>.md` (RESUME Step 3b.2d).
7. **Sources Read** - Copy this session's resume status lines exactly as the reply printed them (`full · COUNT …` / `partial (…)` / `not read (…)` / `inherited full (from …)`). Never rewrite an `inherited full` line as `full`. The next resume skips every session marked `full` or `inherited full` here.

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
- [ ] Each Sources Read `full` line's pack dir exists and its `manifest.json` has the same COUNT and TOOLS (dir name = sid8); each `inherited full (from <file>)` names an existing handoff

**Do not finalize a handoff while the validator reports BLOCKED.** It blocks on
secrets, remaining `[TODO: ...]` placeholders, missing required sections, or a
Timeline whose `user` rows differ from its COUNT total, and exits nonzero.
Everything else is a warning.

### Step 4: Confirm Handoff

Report to user:
- Handoff file location
- Validation verdict (READY / BLOCKED) and any warnings
- Summary of captured context
- First action item for next session

## RESUME Workflow

### Step 1: Find Recent Handoffs

Several sessions can work in one repo at the same time, so the newest file may belong to another
session. List the recent ones, not only the newest:

```bash
ls -lt .claude/handoffs/[0-9]*.md | head -10        # newest first
grep -H -E '^- (Written by|Session|CLI|Model|Host):' .claude/handoffs/[0-9]*.md   # writer
ls -dt .workflow/*/ | head -5                         # run dirs, newest first
```

Read the `plan.md` and `state.md` of each run dir the handoffs or the newest sessions name. They hold the task list and the last checkpoint, which the handoff text only summarizes.

Read the newest handoff for your task, then follow its "Continues from" chain back and read each handoff's text.
Also read the handoff named by the user.
Select the handoff for your task by its task, files, and chain links.
Only handoffs written by CREATE count, and a session is on the chain only when a "Continues from" link reaches its handoff. Compaction summaries (`.claude/handoffs/compact/`, older ones `compact-*.md`) serve that session's own recall: do not read them.
`Written by:` identifies the writer, which may be a previous session.
Do not treat a different writer as proof of concurrent work.
A missing or `UNCONFIRMED` writer means the writer is unknown.

### Step 2: Check Staleness

Compare the handoff's own header (timestamp, branch, commit) against the repo now:

```bash
git fetch --prune                 # origin may have moved since the handoff; the next line only sees local commits
git log --oneline -- .            # commits since the handoff was written
git status --short                # uncommitted drift
git branch --show-current         # still the branch the handoff names?
```

A handoff written on another branch, or behind many commits, is a lead rather
than a fact: re-verify anything it asserts before acting on it.

### Step 3: Load the Handoff

Read the relevant handoff document completely before taking any action.

If handoff is part of a chain (has "Continues from" link), also read the linked previous handoff for full context.

Read in full every user-reviewed work record the handoff names, in any section. Do not check it by keyword search alone.

### Step 3b: Read the Sessions Behind the Handoffs

A handoff is an agent's summary of a session, not its record. Read the record too.

1. List the sessions: the writer session of the newest handoff (`Written by:` line), every session the user names, and the holes. A hole is a session in the chain whose handoff file timestamp is within the last 24 hours and that no handoff's "Sources Read" marks `full` or `inherited full`. A session marked so there was read by an earlier resume: do not pack it again; open only the cited lines the next step depends on. Older sessions are read as handoff text only.
2. For each session, read what the user said AND what the agent did. The user's messages show what was asked and corrected; only the agent's tool calls show what was built (W46 audit: 10 of 15 resumes read only the user's side). Claude Code and Codex: build the session's reading pack.

   ```bash
   python3 <this skill's dir>/scripts/resume_pack.py --out <run dir>/pack "$LOG" [more logs]
   ```

   Put the pack in the task's run dir (open one if there is none), not the scratchpad: the scratchpad can be wiped between turns, and the pack and its `timeline.md` must outlive the turn for CREATE and the validator.

   Per log it writes `<sid8>/user.txt` (one line per user message, oldest first, ending `COUNT <n>`), `footprints.txt` (one block per turn, ending `TURNS <n>`), `tools.txt` (one line per tool call, ending `TOOLS <n>`), `slices/S01.txt`… (every tool call with its input and result, each line prefixed `S<NN>:<line>`) and `manifest.json`. A log it cannot parse exits 1: that session is `not read`, never empty. Subagent logs are packed only with `--subagents`: each agent's report is already a tool result in the main log; pack a subagent only when that result failed, was cut, or the next step depends on how the agent got it.

   `footprints.txt` is the case file. A turn opens at each typed or queued prompt `user.txt` counts (its `COUNT` = `TURNS` + `answer` lines); calls before the first prompt (a compacted session) sit in `TURN 0`; notices, hook feedback and summaries show inside it as `event L<line>` and AskUserQuestion answers as `answer L<line>`. Each turn shows `asked:` (the prompt), `said:` (the agent's closing words in full: its account, not proof) and one pointer per call of kind `edit`, `state` (commit, push, install, deploy, redirect, rm/mv/cp, `sed -i`), `shell` (any other shell call: only a command whose every part is a known read-only verb has no pointer), `delegate`, `fail` or `noresult` (never returned): `T<n> S<NN>:<line> L<line> <kind> <tool> <target>`. `S<NN>:<line>` opens the evidence in this pack; `L<line>` is the line in the log itself (with the `LOG sha256=` header it stays valid when the pack is gone). Content is never copied into it: a footprint is checked by opening what it points to.

   Read `user.txt` and `footprints.txt` with `resume_pack.py --read <file> --page <n>`, one page per call, for each page 1 to T (the first page's last line, `READ <path> page 1/T lines … sha256=…`, names T). Each page stays under the transcript's 30 KB limit and ends with that stamp, which the claim gate checks; the Read tool, `cat` or a piped `| tail` leave no valid stamp, so they do not count. Slice pages are not read whole: one call's block is printed with `resume_pack.py --call <pack>/<sid8> T<n> --page <k>` when b.2 needs it, every page 1 to K (its stamp names K).

   a. Read `user.txt` and `footprints.txt` yourself, every page; never delegate them. `tail`, `head`, a line range, a keyword grep, a tool's output preview or a compaction summary is a sample, not a read: a session read that way is `partial`.
   b. Check the account against the evidence yourself; no scout, no slice page. Build the work list: every conclusion the next step relies on; every done, pushed, deployed, fixed or verified that the handoff or a `said:` states for an open ask; every `fail` pointer (one a later call settled gets a node naming both `T<n>`, bound to the settling call); every `noresult` and `delegate` pointer that no later call on the same target settles. For each item:
      1. Current state: check it read-only, now (`git show`/`log`/`status`, `deploy.sh --check`, the file, the config, the worker list). Never replay a push, deploy, send, delete or install as a check.
      2. A past event that no current read can prove (a push to a remote, a sent message, a deleted file, an old config value, a stopped worker): print its call, every page, with `resume_pack.py --call <pack>/<sid8> T<n> --page <k>`, as the receipt Run it on its own: an output that carries a stamp is a pack read, so a live check batched with it does not count.
      3. Neither is possible (the log is not on this host, an unsupported CLI, input cut in the pack): the item is `unknown`; name what is missing.
   c. Fill the gaps the next step relies on, nothing else: for a commit it continues from, `git show --stat`, then the hunks it touches; for a page it builds on, its text (a version number or an existing file is not a read).
   d. Write `timeline.md` in `<pack>/<sid8>/`: one line per work-list item, starting `- `, each with `asked` (user quote), the claim, `evidence` and a light: `lit` (account and evidence agree, and the line is bound to an observation: a `T<n>` whose `--call` block was printed whole after the resume prompt, or a backticked output string of 8+ characters that a live check printed after it and no earlier tool input typed: quote what the check added, such as a line number, a subject or a path, not only the string you searched for; reads of the pack, handoffs or footprints and echo/printf output do not count), `dim` (account only, or a summary only), `dark` (`unknown`, account and evidence disagree, or the user corrected that turn). Each node line ends with its light as its own field (` · lit`, ` · dim` or ` · dark`); every `fail` pointer's `T<n>` is named in a `lit` or `dark` node, never a `dim` one. The claim gate checks these. The next step relies on no `dim` or `dark` node; it continues from the last `lit` node, and its Source is a user quote or evidence that the work is unfinished. At CREATE, copy each pack's `timeline.md` to `<project>/.claude/footprints/<sid8>.md`; the next resume opens only its `dim` and `dark` nodes again.

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
3. Where a user message and a handoff differ, the user message wins. Correct the handoff before you state scope.
4. Build the timeline: extend `timeline.md` (2d) by merging each handoff's Timeline, every user message, and the live record (`git log`, worker list, deploy output) into one ordered list that ends now. Write it to a file in the task's run dir, not into the chat. Until it exists and its last entry matches the live state, do not dispatch an implementation worker, write a work brief, or edit project files. A read-only subagent that runs the filter for you is allowed.

**Your first status reply lists what you read:** each handoff marked `full`, `partial (<range>)` or `not read`, and one line per session in exactly one of these shapes (the claim gate matches them):

- `- <sid8> full · COUNT <n> · TOOLS <n> · pack <dir>` — only after 2a–2d; COUNT and TOOLS are the manifest's, `user.txt` and `footprints.txt` were read whole by you, every work-list item (2b) has a `lit` or `dark` node, and `timeline.md` has no `dark` node the next step depends on.
- `- <sid8> partial (<what is missing>)`
- `- <sid8> not read (<why>)`
- `- <sid8> inherited full (from <handoff file>)` — a session an earlier resume read, skipped here by Step 3b.1. It is not your read: never write it as `full`.

Then name the timeline file and state the latest correction and authorization in it. Never present a partial read as understanding. If you skipped a session, say so; do not state its content.

### Step 4: Verify Context

Before you state scope or act on the handoff:

1. Project directory and git branch match what the handoff names.
2. Listed blockers are still blockers (they may have been resolved since).
   Read every `Q-n` and its `ans:` first: a filled `ans:` not yet acted on is an
   instruction to carry into this session verbatim; an empty `ans:` or the Suggested
   value is not approval.
3. Stated assumptions still hold — check the ones the next step depends on.
4. Modified files have no conflicting work on top of them.
5. Check every Immediate Next Step against its Source. Read the Source and confirm it supports the listed action.
   An item with no Source is a proposal. An item whose Source you cannot check is UNCONFIRMED.
   Never present a proposal, an UNCONFIRMED item, or your own new idea as the user's scope.
   A user quote beats a user-reviewed work record. Between user quotes, the later one wins.
   An agent-written item never overrides a Source. Report the conflict and correct the handoff before you state scope or act.

### Step 5: Begin Work

Before "Immediate Next Steps" item #1, check the timeline's latest human corrections and authorization.

Reference these sections as you work:
- "Critical Files" for important locations
- "Key Patterns Discovered" for conventions to follow
- "Potential Gotchas" to avoid known issues

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

When resuming from a chain, read the most recent handoff first, then each predecessor's text. Run Step 3b only on the writer session of the newest handoff and on the holes (Step 3b.1).

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
