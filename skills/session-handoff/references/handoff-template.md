# Handoff Template

Use this template structure when creating handoff documents. The smart scaffold script will pre-fill metadata sections; complete the remaining sections based on session context.

## Table of Contents

- [Session Metadata](#session-metadata)
- [Current State Summary](#current-state-summary)
- [Codebase Understanding](#codebase-understanding)
  - [Architecture Overview](#architecture-overview)
  - [Critical Files](#critical-files)
  - [Key Patterns Discovered](#key-patterns-discovered)
- [Work Completed](#work-completed)
  - [Tasks Finished](#tasks-finished)
  - [Files Modified](#files-modified)
  - [Decisions Made](#decisions-made)
- [Pending Work](#pending-work)
  - [Immediate Next Steps](#immediate-next-steps)
  - [Agent Proposals (not requested)](#agent-proposals-not-requested)
  - [Mistakes and Corrections](#mistakes-and-corrections)
  - [Blockers/Open Questions](#blockersopen-questions)
  - [Deferred Items](#deferred-items)
- [Context for Resuming Agent](#context-for-resuming-agent)
  - [Important Context](#important-context)
  - [Assumptions Made](#assumptions-made)
  - [Potential Gotchas](#potential-gotchas)
- [Environment State](#environment-state)
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

## Current State Summary

[One paragraph: What was being worked on, current status, and where things left off]

## Codebase Understanding

### Architecture Overview

[Key architectural insights discovered during this session - how the system is structured, main components, data flow]

### Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| path/to/file | What this file does | Why it matters for this task |

### Key Patterns Discovered

[Important patterns, conventions, or idioms found in this codebase that the next agent should follow]

Anything this session made that could be useful beyond it (a workflow that emerged, a method, a fact) is a shared-memory-intake submission; name each file here, or write "nothing to submit". Do not copy its text here.

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

### Immediate Next Steps

1. [Most critical next action] — Source: [user quote + date | user-reviewed work record, file:line or section]
2. [Second priority] — Source: [...]
(If no user-requested next step exists, remove the numbered placeholders and write: "No user-requested next steps are recorded. Agent Proposals are not approved scope." This is a status statement, not an action item; it needs no Source.)

### Agent Proposals (not requested)

- [An idea of this session with no Source, or "none". Never present a proposal as the user's scope. A task the user requested but deferred goes under Deferred Items.]

### Mistakes and Corrections

- [What went wrong or what the user corrected] - Evidence: [quote or file:line] - Fix: [what changed]. A rule proposal goes to `~/.agents/retro-inbox/pending/` (maintenance §3); name that file here. "none" if there were none.

### Blockers/Open Questions

- [ ] Blocker: [description] - Needs: [what's required to unblock]
- [ ] Q-1: [unclear aspect] - Suggested: [potential resolution]
  - ans:

### Ruled-Out Paths

Required when any Blocker is listed. The successor must not re-verify these unless it first refutes the evidence.

- Path: [approach tried] - Evidence: [metric/error that killed it] - Cost: [tokens/turns/time burned]

### Deferred Items

- [file or backlog row that holds it] (deferred because: [reason]). Name where it lives; do not copy a proposal's text here.

## Context for Resuming Agent

### Important Context

[Critical information the next agent MUST know to continue effectively - this is the most important section for handoff]

### Assumptions Made

- Assumption 1: [what was assumed to be true]
- Assumption 2: [another assumption]

### Potential Gotchas

- [Things that might trip up a new agent - edge cases, quirks, non-obvious behavior]

## Environment State

### Tools/Services Used

- [Tool/Service]: [relevant configuration or state]

### Active Processes

- [Any background processes, dev servers, watchers that may be running]

### Environment Variables

- [Key env vars that matter for this work - DO NOT include secrets/values, just names]

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
