# Handoff Template

Use this template structure when creating handoff documents. The smart scaffold script will pre-fill metadata sections; complete the remaining sections based on session context.

## Table of Contents

- [Session Metadata](#session-metadata)
- [Handoff Chain](#handoff-chain)
- [Current State Summary](#current-state-summary)
- [Immediate Next Steps](#immediate-next-steps)
- [Blockers/Open Questions](#blockersopen-questions)
- [Working Methods](#working-methods)
- [Standing Authorizations](#standing-authorizations)
- [Timeline](#timeline)
- [Codebase Understanding](#codebase-understanding)
  - [Architecture Overview](#architecture-overview)
  - [Critical Files](#critical-files)
- [Work Completed](#work-completed)
  - [Tasks Finished](#tasks-finished)
  - [Files Modified](#files-modified)
  - [Decisions Made](#decisions-made)
- [Pending Work](#pending-work)
  - [Agent Proposals (not requested)](#agent-proposals-not-requested)
  - [Mistakes and Corrections](#mistakes-and-corrections)
  - [Deferred Items](#deferred-items)
- [Context for Resuming Agent](#context-for-resuming-agent)
  - [Important Context](#important-context)
  - [Assumptions Made](#assumptions-made)
  - [Potential Gotchas](#potential-gotchas)
- [Environment State](#environment-state)
- [Artifacts](#artifacts)
- [Related Resources](#related-resources)
- [Template Usage Notes](#template-usage-notes)

---

# Handoff: [TASK_TITLE]

## Session Metadata
- Created: [TIMESTAMP]
- Written by: [CLI] session [SESSION_ID] (filled by the script from CLAUDE_CODE_SESSION_ID or CODEX_THREAD_ID)
- Model: [MODEL_ID] (from `--model`; no CLI exposes it in the environment)
- Host: [MACHINE_NAME] (filled by the script)
- Project: [PROJECT_PATH]
- Branch: [GIT_BRANCH]
- Session duration: [APPROX_DURATION]

## Handoff Chain

- **Continues from**: [[previous handoff file]](./[previous handoff file]) — or `None (fresh start)`; the scaffold fills it from `--continues-from`
- **Supersedes**: [older handoffs this replaces, or "None"]

## Current State Summary

[One paragraph: What was being worked on, current status, and where things left off]

## Immediate Next Steps

1. [One next action checked against the latest user corrections and authorization] — Source: [user quote + date | user-reviewed work record, file:line or section]
(If no user-requested next step exists, remove the numbered placeholders and write: "No user-requested next steps are recorded. Agent Proposals are not approved scope." This is a status statement, not an action item; it needs no Source.)

## Blockers/Open Questions

[Name any unverified item or anything likely to look settled. Write "None" if clear.]

- [ ] Blocker: [description] - Needs: [what's required to unblock]
- [ ] Q-1: [unclear aspect] - Suggested: [potential resolution]
  - ans:

**Start here** — [List the artifact paths or URLs the next step needs first, or write "None". List every other required read in Artifacts.]

## Working Methods

How this task is done here, from this and every earlier session. One row per method or tool:
- [what it does, on which device or env] · worked | failed · [YYYY-MM-DD] · [one run record: path:line or commit sha] · [conditions it held under, or unknown]
- none · [reason] (only when the task used no method worth repeating)

The record is the run record (state.md, evidence file, log, commit), never a brief, a plan, or "used before". The last field is required: the conditions the result holds under (device, build, what it proved), or `unknown`. The validator compares carried rows whole, conditions included. Copy every row of the handoff this one continues from whole; drop a row only as `- retired: <what> · <old record> · <record that replaced it>`. A retired row can drop at the next handoff; the row that replaced it carries on.

## Standing Authorizations

[Each standing approval the user gave, quoted with its date and the scope it covers; revoked or used-up ones with the user's words; "None" if there are none]

## Timeline

### Nodes

| # | Time (UTC) | Asked (user quote) | Achieved (files, behavior) | Evidence | Status |
|---|------------|--------------------|----------------------------|----------|--------|
| 1 | [START–END] | [「verbatim request」] | [what changed] | [sha / test output / page] | [verified / open / dropped] |

### Rows

`user.txt` of session [SESSION-ID]: `COUNT [n]` (one `user` row below per line)

| Time (UTC) | Who | Event (user quote verbatim, or the state change and its evidence) |
|------------|-----|------------------------------------------------------------------|
| [TIME] | user | [「verbatim request, ruling or correction」] |
| [TIME] | agent | [commit / push / deploy / worker start or stop, with its evidence] |

## Sources Read

[This session's resume status lines, exactly as its reply printed them. The next resume reads a session marked `full` or `inherited full` here through its footprint, through its log when the footprint is missing, and opens the record behind any node the next step depends on.]

- [SID8] full · COUNT [n] · TOOLS [n] · pack [dir]
- [SID8] inherited full (from [handoff file])

## Codebase Understanding

### Architecture Overview

[Key architectural insights discovered during this session - how the system is structured, main components, data flow]

### Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| path/to/file | What this file does | Why it matters for this task |

## Work Completed

### Tasks Finished

- [x] Task 1 - brief description of what was done
- [x] Task 2 - brief description

### Files Modified

| File | Changes | Rationale |
|------|---------|-----------|
| path/to/file | Description of changes | Why this change was made |

### Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| Chose X over Y | X, Y, Z | Why X was chosen |

## Pending Work

### Agent Proposals (not requested)

- [An idea of this session with no Source, or "none". Never present a proposal as the user's scope. A task the user requested but deferred goes under Deferred Items.]

### Mistakes and Corrections

- [What went wrong or what the user corrected] - Evidence: [quote or file:line] - Fix: [what changed]. Name an existing proposal by filename. "none" if there were none.
- For a correction of a class of behavior (for example, not reading earlier work): [the user's words] - Record they pointed at: [path:line] - First check of the next session: [the check; also an Immediate Next Step] - maintenance §2: [gate, rule or skill fix, or backlog row file]

### Ruled-Out Paths

Required when any Blocker is listed. The successor must not re-verify these unless it first refutes the evidence.

- Path: [approach tried] - Evidence: [metric/error that killed it] - Cost: [tokens/turns/time burned]

### Deferred Items

- [file or backlog row that holds it] (deferred because: [reason]). Name where it lives; do not copy a proposal's text here.

## Context for Resuming Agent

### Important Context

[Critical information the next agent MUST know to continue effectively - this is the most important section for handoff. List project conventions the next step depends on (branch rules, file layout), each with its source file. Name existing shared-memory submissions by filename.]

### Assumptions Made

- [A claim not run yet. A method that ran goes in Working Methods, not here.]

### Potential Gotchas

- [Things that might trip up a new agent - edge cases, quirks, non-obvious behavior]

## Environment State

- Remote hosts holding artifacts: [host:absolute-path, or none; do not infer absence from local disk]

### Tools/Services Used

- [Tool/Service]: [relevant configuration or state]

### Active Processes

- [Any background processes, dev servers, watchers that may be running]

### Environment Variables

- [Key env vars that matter for this work - DO NOT include secrets/values, just names]

## Artifacts

Every product of this session (required; the validator blocks without it):
- [path or URL] · [artifact | md | memory | run-dir | other] · must-read: [yes | no] · [what it holds]
- none · [reason] (only when the session made no product)

## Related Resources

- [Link or path] — user-reviewed: [date | no]
- [Related file paths]
- [External resources consulted]

---

## Template Usage Notes

When filling this template:
1. Be specific and concrete - vague descriptions don't help the next agent
2. Include file paths with line numbers where relevant (e.g., `src/auth.ts:142`)
3. Prioritize the "Important Context" and "Immediate Next Steps" sections
4. Don't include sensitive data (API keys, passwords, tokens)
5. Focus on WHAT and WHY, not just WHAT - rationale is crucial for handoffs
