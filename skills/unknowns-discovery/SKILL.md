---
name: unknowns-discovery
description: Find the map/territory gap BEFORE it gets expensive. Invoke when starting a non-trivial task in unfamiliar territory (new module, new technology, work the user has not done before), when acceptance criteria are "I'll know it when I see it", when the user struggles to describe what they want, or when a long-horizon task came back wrong and a blind retry is tempting. Not for typo-level fixes or tasks with fully objective acceptance criteria.
---

# Unknowns Discovery

Derived from "A Field Guide to Fable: Finding Your Unknowns" (Thariq, Anthropic).
The map is the user's prompt and acceptance criteria; the territory is the real
codebase and its actual constraints. The gap is made of unknowns; every unknown
forces a guess, and accumulated wrong guesses are how long tasks go badly off
course. Bias: discovery over speed. Trivial tasks (typo-level fixes) skip this
skill entirely.

## §1 The four kinds of information in any task

1. Known knowns — what the prompt explicitly states.
2. Known unknowns — what the user knows they have not figured out yet.
3. Unknown knowns — standards the user holds but never wrote down because they
   felt obvious; they recognize them only on seeing output ("no, not like that").
4. Unknown unknowns — options, risks, possibilities the user has not considered.

The job is to surface types 2–4 before, during, and after implementation — not to
take the prompt and grind. Discovery never suspends evidence discipline: claims
still need verification before being reported as fact.

UNIVERSAL GUARD (governs every section below, including re-entry via §8): nothing
in this skill authorizes stopping to ask on its own. Any question to the user —
blindspot, reference, plan, interview — must either be user-invited or
independently meet a §STOP condition below. Otherwise: state the
default/assumption in one line and proceed. Surfacing an unknown is reporting,
not permission-seeking.

## §STOP When a question to the user is authorized

Ask FIRST, always (hard-stop list): data deletion, privacy exposure, external
side effects (emails, tickets, deploys, payments), irreversible operations,
production/protected-branch changes, major architectural risk.

Also stop and ask when ANY of:
- Two interpretations of the request lead to substantially different work, and
  picking wrong would touch >2 files or change a schema/API/public interface.
- Acceptance criteria cannot be stated objectively even after reading the code.
- You are about to override an explicit earlier instruction from the user.

Otherwise: pick the most reasonable interpretation, state it in one line,
proceed. Never end a turn with "Shall I proceed?" on work that is reversible and
in scope.

## §2 Blindspot pass

Apply: the user enters unfamiliar territory (new module, unfamiliar technology,
a type of work they have not done before).

- [ ] Survey the codebase/domain quickly; list what the user likely does not
      know they do not know.
- [ ] Say what "good" looks like in this domain, the historical potholes, and
      the questions they should be asking.
- [ ] Goal: teach the user to prompt better — surface the decision, do not hide
      it. Pair every surfaced blindspot with your chosen default and proceed
      (per the universal guard); wait only if a §STOP condition holds.

Positive: "You asked for a WebSocket layer. Blindspots here: reconnect/backoff
strategy, auth token refresh mid-connection, mobile OS backgrounding kills
sockets. Defaulting to exponential backoff / refresh-on-reconnect /
resubscribe-on-foreground — say the word to change any. Proceeding."
Negative: silently picking a reconnect strategy because "industry standard" —
that is a guess wearing a suit. Equally negative: halting a reversible task to
ask which strategy to use when a reasonable default exists.

## §3 Brainstorm & prototype before real code

Apply: acceptance criteria are "I'll know it when I see it" (visual design,
interaction, direction).

- [ ] Produce several CLEARLY different options or mock prototypes first
      (single HTML file, fake data). Do not touch real code.
- [ ] Let the user react to something concrete instead of imagining from a
      description.
- [ ] Only after a direction is picked does implementation start.

Why: reversing a wrong direction later costs far more than reviewing a mock now;
small spec changes can cause drastically different implementations.

## §4 Interview — one question at a time

Apply: the user explicitly asks to be interviewed ("interview me"), OR ambiguity
remains after brainstorming.

- [ ] User-invoked interview: multi-turn is authorized — one question per turn,
      wait for the answer before the next.
- [ ] NOT user-invoked: each individual question must independently meet a
      §STOP condition. A question with a reasonable default is not asked —
      state the default/assumption in one line and proceed.
- [ ] Spend the question budget on answers that would change the architecture
      (data model, API shape, user-facing behavior) — never on trivia.

## §5 Ask for references

Apply: the user struggles to describe what they want — i.e. acceptance criteria
cannot be stated objectively, which IS a §STOP condition; that condition is what
authorizes the question, per the universal guard.

- [ ] Ask: "Is there an existing implementation/component/library that looks
      like what you want? Point me at it."
- [ ] If a reasonable default interpretation exists, the §STOP condition does
      not hold — state the interpretation in one line and proceed instead.
- [ ] Source code is the best reference, even in a different language. A
      supplied reference then binds: follow it exactly first; if it fails,
      report the exact deviation before improvising.

## §6 Implementation plan review

Apply: before executing a complex task (multi-file, schema/API changes, or
>~3 steps).

- [ ] Write the plan to the project's planning convention and present it.
- [ ] Lead with what the user is most likely to change: data models, type
      interfaces, user-facing behavior.
- [ ] Bury mechanical refactoring at the bottom — they trust you on that part.
- [ ] WAIT for review only when a §STOP condition holds (hard-stop list,
      diverging interpretations, unstatable acceptance criteria). Otherwise
      present the plan and proceed in the same turn.

## §7 Explainer after large changes

Apply: after a change far larger than the user expected, or when they ask.

- [ ] Produce a change report: the context, the intuition, what was done, why.
- [ ] Offer a short quiz on the change; the user truly understands it only when
      they pass. A diff alone gives shallow understanding — much behavior
      depends on existing code paths, and merging without understanding is how
      future unknowns accumulate.

## §8 Reminders

- Too-specific instructions make you follow orders when a pivot is warranted;
  too-vague instructions make you guess with "best practices" that may not fit
  this project. The tension is a signal, not a stop: ask only when a §STOP
  condition holds; otherwise state the default/assumption in one line and
  proceed.
- A long-horizon task that came back wrong usually failed on undefined
  unknowns, not model capability. Do not blind-retry: bring the user back
  through §2–§5. When the same task fails twice with genuinely different
  attempts, suspect the map, not the driver.
