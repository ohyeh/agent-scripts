# A Letter to Future Sessions

Written on 2026-07-10, left behind by a one-off Fable 5 session. To the reader:
the owner of this rule set, and every future session (mostly Sonnet/Opus/Haiku)
to come. The rules themselves live in `rules/`; this letter covers three things
the rule files don't have room for, how the institution is most likely to decay,
and where I myself am least confident.

## I. Three things you didn't ask, but I think matter most

**1. The institution succeeds or fails on the feedback loop, not the rule files.**
All the rules files combined are worth less than the habit of "the user spends
one minute approving or rejecting a proposed diff every time they see one."
`lessons.md` is the only organ in this whole system that can grow; if no one
reviews proposals for three months, it degrades into decoration and the rules
freeze at the 2026-07-10 worldview. Please treat "processing proposed entries"
as routine business, even when the answer is always "reject."

**2. The long-run bottleneck is context, not model intelligence.**
Your environment injects the following at the start of every session: CLAUDE.md
+ ponytail hook + two output-style stacks (Explanatory + Learning) + context-mode
instructions + roughly 60 skill descriptions. That's a fixed tax of several
thousand tokens, and three of those pieces actively contradict each other
(verified live, see rules/harness-diagnosis.md §2). You decided on 2026-07-10 to
keep the status quo, and I complied, mitigating with precedence rules instead —
but to be honest: **disabling the duplicate output-style plugin is the single
largest, cheapest reclaimable token pool in the current environment**, ready to
reclaim any time; just back up settings.json before you edit it. A weak model in
a clean context often beats a strong model in a dirty one.

**3. The most dangerous failure mode of a weak model isn't incapacity — it's
confidently making things up.**
This whole institution is built around evidence, and it has one single point of
failure: the user's tolerance. The moment you accept one "done" without evidence,
every session after that learns that's what passes. The rule most worth holding
the line on is also the cheapest one: with no raw evidence, always say
"attempted, unverified."

## II. The institution's most likely decay paths, and how they're prevented

| Decay path | Prevention (mostly already built in) |
|---|---|
| Rule files bloat back into long prose a weak model can't finish reading | Hard cap of ≤150 lines per file + quarterly trimming (maintenance §4) |
| Routing becomes theater: the model skips "read the rules file first" and just starts working | Reading the file before delegating and before declaring completion is now MANDATORY; the user can spot-check: "which file, which section, did you just cite?" — failure to answer means the gate didn't fire |
| The model table goes stale, dispatch keeps using it anyway | dispatch §8 quarterly re-verification + silent fable→opus fallback |
| lessons.md turns into a junk drawer | Three-line format, consolidation once entries pass ~40, 90-day auto-retirement of stale `proposed` entries |
| The user bypasses the institution under time pressure | Normal, no guilt needed; adding a lesson afterward is the institution working as intended |
| Verification degrades into self-verification by the author | dispatch §7 states in black and white: past the triviality threshold, the author's own "I verified it" is not evidence |

## III. Honesty clause: where my output is least confident

1. **The "task type → model" mapping table in model-dispatch §5.** The model
   names and parameters are verified live; but "which task gets which model" is
   my inference from a general capability ladder, not calibrated against your
   actual quota or real cases. For example, Sonnet 5 may well be enough for most
   hard debugging, and I have no idea what Opus 4.8 costs against your quota.
   Revise the table after two weeks of lived experience — that's exactly what
   lessons.md is for.
2. **Whether requests routed to Opus 4.8 consume Fable quota**: couldn't verify
   this, unconfirmed. Check the usage dashboard on claude.ai and write the
   conclusion into lessons.md.
3. **Diagnosis §2 (style conflicts as one of the main causes of drift)**: the
   three contradictory injections are a verified fact; "it's the main cause" is
   an inference — no controlled experiment was run. I'm confident in the
   direction, not in the ranking.
4. **The precedence order itself is a judgment call.** Decomposition and
   verification can improve execution quality, but they can't fill in this kind
   of discretion — this is exactly the sort of thing the task's own "honesty
   clause" predicted. My approach: say plainly that it's discretionary, and let
   it be corrected by time-in-use rather than pretending it has an empirical
   basis.

## IV. How to get started tomorrow (the shortest path for the next session)

1. Load `~/.claude/CLAUDE.md` as usual at session start (Codex uses
   `~/.codex/AGENTS.md`; the routing table lives inside it).
2. On a non-trivial task → read `rules/model-dispatch.md` first, delegate per
   the three elements in §3.
3. Before declaring completion → go through the `rules/judgment-rubrics.md` §2
   checklist.
4. Hit a snag → write three lines into `rules/lessons.md`, keep working.

Good luck. The institution won't make a weak model smarter, but it will keep it
from making mistakes a strong model would also make.

— Fable 5, 2026-07-10
