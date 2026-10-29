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
4. **Decisions Made** - Choices with rationale (not just outcomes)
5. **Mistakes and Corrections** - Wrong turns and user corrections, with evidence; a rule proposal goes to `~/.agents/retro-inbox/pending/` and only its file name goes here
6. **Timeline** - The session in order: each user message, ruling and correction as a `user` row (UTC time, short verbatim quote), and each state change (commit, push, deploy, worker start/stop) with its evidence. Run the RESUME Step 3b filter for your CLI on this session's own log. Copy its `COUNT <n>` line into the section and write one `user` row per printed line, from the full output, not from memory or a summary.

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
ls -lt .claude/handoffs/*.md | head -10              # newest first
grep -H -E '^- (Written by|Session|CLI|Model|Host):' .claude/handoffs/*.md   # writer: manual and compact handoffs
```

Read every handoff from the last two days whose task or files overlap yours.
Also read the handoff named by the user or linked by the task's handoff chain, even if it is older.
Select the handoff for your task by its task, files, and chain links.
`Written by:` and `compact-<session id>.md` identify the writer, which may be a previous session.
Do not treat a different writer as proof of concurrent work.
A missing or `UNCONFIRMED` writer means the writer is unknown.

### Step 2: Check Staleness

Compare the handoff's own header (timestamp, branch, commit) against the repo now:

```bash
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

1. List the sessions. Take the writer session of every handoff you selected in Step 1 (`Session:` line, or the id in `compact-<id>.md`), every session in their chains, and every session the user names. Several handoffs often point to several sessions.
2. For each session, read ALL of the user's messages, first to last, and the agent's last reply. Run the filter for your CLI below. It prints one line per user message (newlines become spaces), oldest first, and ends with `COUNT <n>`: jq counts, not you. `tail`, `head`, a line range, a keyword grep, a tool's output preview or a compaction summary is a sample, not a read: a session read that way is `partial`. Read the whole output, in pages if it is long; never cut it. It holds no tool output, so it is small (one 26,000-row Claude Code log: 99 messages, 32 KB). To keep it out of your own context, run it in `ctx_execute` and print every line, or give it to a read-only subagent that returns every line and the `COUNT` line; check that the first line it returns is the first line of your own run. A predecessor handoff whose Timeline has a `COUNT` line counts as the read of its session up to the handoff's time; run the filter for anything after that time.

   | CLI | Session log | Cheap read |
   |---|---|---|
   | Claude Code | `~/.claude/projects/<project>/<session-id>.jsonl` | `ctx_execute`, or an `explore-bounded` subagent |
   | Codex | `~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<session-id>.jsonl` | `ctx_execute` if context-mode is installed; else write the output to a scratch file and read it in pages |
   | Cursor CLI | `~/.cursor/projects/<project-slug>/agent-transcripts/<session-id>/<session-id>.jsonl` | `ctx_execute` if context-mode is installed, or an `explore` subagent |
   | agy | `~/.gemini/antigravity-cli/brain/<conversation-id>/.system_generated/logs/transcript.jsonl` | `invoke_subagent` with model `flash`, or `run_command` output into the conversation's `scratch/` |

   Set `LOG` to the session log first; an empty path makes jq wait on stdin.

   Claude Code:

   ```bash
   jq -rn 'def txt: if type=="string" then . else (map(if .type=="text" then .text elif .type=="image" then "[image]" else empty end)|join(" ")) end;
     def slash: (capture("<command-name>(?<c>[^<]*)</command-name>")?.c // "") + " " + (capture("<command-args>(?<a>[^<]*)</command-args>")?.a // "");
     [inputs | select(.origin.kind!="plugin" and .isMeta!=true) | .timestamp as $ts
      | (if (.toolUseResult|type)=="object" and (.toolUseResult|has("answers")) then [.message.content[]|select(.type=="tool_result")|.content|txt]|join(" ")
         elif .type=="user" and ((.message.content|type)=="string" or (.message.content|map(.type)|index("tool_result"))==null) then .message.content|txt
         elif .type=="attachment" and .attachment.type=="queued_command" then .attachment.prompt|txt
         else empty end) as $t
      | select($t|test("^\\s*<(?!pasted_content|command-|!-- attach)|^Base directory for this skill|^Stop hook feedback|^This session is being continued|^Here is a note offered by a side agent|^Another Claude session sent a message|^The .+ plugin sent a message")|not)
      | "\($ts[0:19])  \(if ($t|test("^\\s*<command-")) then ($t|slash) else $t end | gsub("[\\r\\n\\t]+";" "))"]
     | (.[]), "COUNT \(length)"' "$LOG"
   jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' "$LOG" | tail -60   # last reply only; never a substitute for the user-message list
   ```

   It keeps typed messages, messages sent while the agent worked (`queued_command`), AskUserQuestion answers (`toolUseResult.answers`), pasted text, quote replies (`<!-- attach -->`), images (`[image]`) and slash commands (`/name args`). It drops plugin rows (`origin.kind=="plugin"`), meta rows, hook feedback, skill bodies, side-agent notes and messages from other sessions. `[Request interrupted by user]` stays: the user stopped the agent.

   Codex:

   ```bash
   jq -rn '[inputs | select(.type=="response_item" and .payload.type=="message" and .payload.role=="user")
     | ([.payload.content[]? | if .type=="input_text" then .text elif .type=="input_image" then "[image]" else empty end] | join(" ")) as $t
     | select($t|test("^\\s*(# AGENTS\\.md instructions|<[a-z_]+[ >])")|not)
     | "\(.timestamp[0:19])  \($t|gsub("[\\r\\n\\t]+";" "))"] | (.[]), "COUNT \(length)"' "$LOG"
   ```

   User words are `response_item` rows with `payload.role=="user"`; text that starts with a tag or `# AGENTS.md instructions` is injected context. A message sent while Codex worked, or an answer to its own question, was not seen in a Codex log on 2026-10-30 (UNCONFIRMED): if you find user words in another record type, include them and say so.

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

   Typed messages, messages sent while agy worked, and answers to its questions are all `type=="USER_INPUT"`; images are in `media`.
3. Where a user message and a handoff differ, the user message wins. Correct the handoff before you state scope.
4. Build the timeline: merge each handoff's Timeline, every user message, and the live record (`git log`, worker list, deploy output) into one ordered list that ends now. Write it to a file (the task's run dir or scratchpad), not into the chat. Until it exists and its last entry matches the live state, do not dispatch an implementation worker, write a work brief, or edit project files. A read-only subagent that runs the filter for you is allowed.

**Your first status reply lists what you read:** each handoff and each session, marked `full`, `partial (<range>)` or `not read`. For each `full` session, quote three lines verbatim from the filter output: the first line, the last message line, and the `COUNT` line. A tail cannot supply the first line. Then name the timeline file and state the latest correction and authorization in it. Never present a partial read as understanding. If you skipped a session, say so; do not state its content.

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

When resuming from a chain, read the most recent handoff first, then every predecessor and its session with RESUME Step 3b. Do not stop at the newest handoff.

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
