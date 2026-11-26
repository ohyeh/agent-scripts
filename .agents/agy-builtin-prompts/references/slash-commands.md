## <LEARN> (offset 65297457)

```text
The user invoked /learn to persist reusable behaviors from recent interactions, corrections, or successes. Iterate interactively with the user to clarify what behavior to retain as updated or new skills or rules.

## Identify What to Learn
1. **Analyze User Messages**: Prioritize analyzing recent user messages for explicit corrections, constraints, overrides, or pointers (e.g., "no", "instead", "that failed").
2. **Identify the Fix**: Compare failed attempts with the successful resolution to isolate the pivotal change.
3. **Determine Root Cause & Scope**: Address the underlying issue, not surface symptoms. Determine if it's universal or domain-specific.
4. **Verify if learning is needed**: If the interaction did not reveal any new reusable behaviors or constraints, explain this to the user and exit without proposing changes.

## Classify Rules vs. Skills
1. **Rule**: Universal behavioral guardrails, strict constraints, or formatting invariants.
2. **Skill**: Actionable multi-step tool chains, complex flag combinations, or cheatsheets.

## Create vs. Update
* **Update Existing (Prefer)**: Update an active Rule/Skill if it was used but failed, was outdated, missed edge cases, or diverged from successful actions. If updating a target file would approach or exceed its documented size/budget limits (or it is already truncated in context), propose condensing it or splitting/extracting into a scoped rule or skill instead of appending.
* **Create New**: When the behavior covers an entirely new domain or guardrail not covered by existing rules or skills, or when splitting an oversized file.

## Mandatory Proposal Workflow
Do NOT modify configuration files immediately.
1. %s
2. Create/update a learning_proposal.md artifact outlining your classification, rationale, and precise text additions/diffs.
3. Set request_feedback = true in ArtifactMetadata for user review.
4. Only execute file/tool modifications after explicit user approval.
```

## <GRILL_ME> (offset 64834973)

```text
The user has requested that you interview them about every aspect of their task until you've reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Guidelines:
- Ask the questions one at a time.
- If a question can be answered by exploring the codebase, explore the codebase instead.
- Use the ask_question tool for asking questions to the user.
```

## <TEAMWORK> (offset 65021899)

```text
The user wants the %[2]s multi-agent team to take on their request. Hand it
over as it is—do not attempt the task yourself. If the request (after any slash
command and bracket parameters such as [skip-interview]) is empty, ask the user
what they want the team to do first.

Call the %[1]s tool with TypeName: %[2]s (%[2]s is hidden from the subagents
list, but can be invoked). If %[2]s cannot be invoked, do not attempt to define
a subagent and invoke that instead; just tell the user that %[2]s is
temporarily not available. As the Prompt, pass the user's request without the
slash command (if there is one), keeping any leading bracket parameters such as
[skip-interview] at the start, exactly as typed, and adding none they did not
type. The team cannot see this conversation, so if the request refers to
earlier context here, append the relevant parts quoted.

When %[2]s or its interviewer messages you with updates, questions, or drafts
for the user, follow the instructions in each message. If the user asks how it
is going, ask the %[2]s subagent you started.
```

