# Skill description limits and auto-invocation in Claude Code

Research for issue #25 (wayfinder map #23). Date: 2026-09-06.
Primary sources fetched live this session:

- S1 Claude Code skills reference: https://code.claude.com/docs/en/skills.md
- S2 Claude Code settings reference: https://code.claude.com/docs/en/settings-reference.md
- S3 Agent Skills overview (platform): https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills/overview.md
- S4 Skill authoring best practices (platform): https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills/best-practices.md

Method deviation: the `research` skill asks for a background agent; this was done inline because the researcher was already a dedicated subagent with no parallel work.

## Q1. What decides auto-invocation? Only the description, or other signals too?

**Answer:** The model matches the request against the listing of skill names plus descriptions in the system prompt. Frontmatter fields gate whether the skill is even in that listing or callable; they are not extra matching signals. `allowed-tools` is a permission grant, not a trigger input.

- S3: "Claude loads this metadata at startup and includes it in the system prompt. The `description` is what Claude matches your request against when determining whether to trigger the Skill, so it must say both what the Skill does and when to use it."
- S1 (frontmatter table): "`description` ... What the skill does and when to use it. Claude uses this to decide when to apply the skill. If omitted, uses the first paragraph of markdown content."
- S1: "`when_to_use` ... Additional context for when Claude should invoke the skill, such as trigger phrases or example requests. Appended to `description` in the skill listing and counts toward the 1,536-character cap."
- S1 (name): "`name` ... Display name shown in skill listings. Defaults to the directory name." The listing "always contains every skill name", so the name is the residual signal when a description is dropped (see Q2).
- S1 (`disable-model-invocation`): "Set to `true` to prevent Claude from automatically loading this skill." Table row: "Description not in context, full skill loads when you invoke". Also: "This removes the skill from Claude's context entirely."
- S1 (`user-invocable: false`): "Only Claude can invoke the skill." Table row: "Description always in context, full skill loads when invoked".
- S1 (`allowed-tools`): "Skills that define `allowed-tools` grant Claude access to those tools without per-use approval during the turn that invokes the skill; the grant clears when you send your next message." No trigger role stated.
- S1 (permission rules): "`Skill(name)` for exact match, `Skill(name *)` for prefix match" can allow or deny model invocation; `skillOverrides` values `"name-only"`, `"user-invocable-only"`, `"off"` do the same from settings.
- S1 (malformed frontmatter): "Claude Code loads the skill body with empty metadata, so `/skill-name` still works but Claude has no `description` to match against."

Anything about the model's internal ranking beyond "matches your request against the description" is UNCONFIRMED (not documented).

## Q2. Is there a character cap or truncation on `description`?

**Answer:** Yes, three distinct limits, all documented:

| Limit | Value | Scope | Source |
| --- | --- | --- | --- |
| Spec validation | 1,024 chars max on `description` | Agent Skills format (platform) | S3, S4 |
| Per-skill listing cap | 1,536 chars on `description` + `when_to_use` combined, text cut at the cap | Claude Code listing; setting `skillListingMaxDescChars`, default 1536 | S1, S2 |
| Listing-wide budget | 1% of the model context window; on overflow, descriptions dropped starting with least-invoked skills, names always kept | Claude Code; setting `skillListingBudgetFraction` default 0.01, or env `SLASH_COMMAND_TOOL_CHAR_BUDGET` | S1, S2 |

- S4: "`description`: Must be non-empty. Maximum 1,024 characters. Cannot contain XML tags." S3 repeats "Maximum 1024 characters".
- S1: "Put the key use case first: the combined `description` and `when_to_use` text is truncated at 1,536 characters in the skill listing to reduce context usage."
- S2 (`skillListingMaxDescChars`): "This key caps how many characters of that text Claude Code shows per skill; longer text is cut at the cap. ... Default: `1536`".
- S1 ("Skill descriptions are cut short"): "The listing always contains every skill name, but if you have many skills, Claude Code shortens descriptions to fit the listing's character budget, which can strip the keywords Claude needs to match your request. The budget scales at 1% of the model's context window. When the listing overflows, Claude Code drops descriptions starting with the skills you invoke least, so the skills you use most keep their full text."
- S2 (`skillListingBudgetFraction`): "Default: `0.01`, which reserves 1% of the context window".
- S1: "Run `/doctor` for an estimate of the listing's context cost and its biggest contributors." The `/context` Skills row "reports the size of the listing after the budget is applied" (v2.1.196+).

UNCONFIRMED: whether Claude Code itself rejects or truncates a `description` longer than 1,024 chars at load time. The Claude Code docs state only the 1,536 listing cap; the 1,024 figure is the platform spec validation rule.

## Q3. Does a longer description measurably hurt or help triggering?

**Answer:** No measured effect is published. Official docs give mechanism, not numbers: text past 1,536 chars is never seen; under listing overflow the whole description of low-use skills disappears, which "can strip the keywords Claude needs to match your request" (S1). Longer text therefore raises the chance of losing trigger keywords, and shorter descriptions leave more of the shared 1% budget for other skills, but no doc quantifies trigger rate versus length.

- S4: "being concise in SKILL.md still matters: once Claude loads it, every token competes with conversation history and other context." (about the body, not the description)
- S3 (Level 1 metadata table): "~100 tokens per Skill" is the documented expectation for name plus description.

## Q4. Official guidance for reliable triggering

- S4: "**Always write in third person**. The description is injected into the system prompt, and inconsistent point-of-view can cause discovery problems."
- S4: "**Be specific and include key terms**. Include both what the Skill does and specific triggers/contexts for when to use it."
- S4: "The description is critical for skill selection: Claude uses it to choose the right Skill from potentially 100+ available Skills."
- S4 good example: "Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction." Avoid: "Helps with documents".
- S1 troubleshooting "Skill not triggering": "Check the description includes keywords users would naturally say"; "Skill triggers too often": "Make the description more specific".
- S1: put trigger phrases in `when_to_use` if desired; it is appended to the description in the listing and shares the 1,536 cap.
- S1: "You can also trim the `description` and `when_to_use` text at the source: put the key use case first, since each entry's combined text is capped at 1,536 characters regardless of budget."

## Recommendation for router descriptions

Keep `description` + `when_to_use` under 1,024 characters, lead with the primary use case and natural trigger keywords in third person, and treat 1,536 as the hard display cutoff. Current repo state (11 SKILL.md files under `skills/`): longest is 644 chars, none exceed either cap.

## UNCONFIRMED

1. Whether Claude Code rejects or truncates a `description` over 1,024 chars at load time (only the platform spec states 1,024; Claude Code docs state only the 1,536 listing cap).
2. Any quantitative relation between description length and trigger accuracy.
3. How the model ranks between multiple matching descriptions beyond the documented "matches your request against the description".
4. Exact character value of the 1% budget for a given model (docs do not give the conversion from context window to characters).
