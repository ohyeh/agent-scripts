# Design branch

Answer the questions in order. Each answer is a row id from the member table
at the end; that table is the only place a member is chosen.

## Bypass

- Backend-only or non-UI work, or a one-line CSS or copy tweak → do it inline
  (at most consult DESIGN.md).
- The user names one member for a task that one skill can do → read that
  member and go direct.
- Loop-shaped work that is not visual (audit, plan→build) → leave this branch;
  back to `references/index.md`.

## Questions

**Q1 Deliverable — who owns the output?**
- Diagram → DG-REPO when it is one of that member's native types drawn from a
  real repo or trace; else DG-HOUSE.
- Report, plan, comparison or explainer page → you build one self-contained
  HTML file under rule `artifacts-rules`.
- Web page or web app screen, native screen, existing interface → the target
  stack; direction from Q2.
- Metrics, KPIs, status, a data file, or a large scan-and-compare page →
  Artifact type `Dashboard`. Animation, explainer or demo video, walkthrough,
  motion graphic → Artifact type `Motion`. For both: Artifact `quickstart`,
  then the type's own instructions own the structure. Motion is written as
  code so every word, number and timing stays editable; a reference case
  lends its structure and timing, never its prompt.
- Module, API or domain shape → Pipeline D (PD rows, no visual authority).
- Token work → DESIGN.md itself. Mockup only → a static HTML mockup, no build
  loop. "Would this work?" → PROTO, alone, no loop.
- No Artifact tool (Codex, Cursor, agy) → each Artifact route becomes one
  self-contained HTML file under `artifacts-rules`; say so in the report.

**Q2 Direction authority — exactly one, or none.**
New web page or web app screen → DIR-WEB, then REV-WEB as the review stage.
Native screen, existing interface (audit the CURRENT render first), DESIGN.md
→ DIR-NATIVE. Pipeline D, prototypes, diagrams and trivial tweaks → none.
Never stack two authorities. An unknown skill never becomes an authority.

**Q3 Specialists (add, load inline).** Any chart → SP-CHART. An Artifact you
publish → SP-ARTIFACT (mandatory before publishing). UI motion or gesture →
SP-MOTION (it also constrains a `Motion` artifact; the type stays the owner).
A bundled specialist that does not resolve this turn → say so and skip it.

**Q4 Executor per stage** → the executor table below.

**Q5 Verifier.** A render in scope → the quality loop below (for `Motion`,
frames at start, middle and end). DESIGN.md only → document evidence (file
hash or commit, token completeness, contrast math). Pipeline D → a design
comparison judged against PD-DEPTH criteria by a fresh reviewer, verdict
PASS or BLOCK. PROTO → none.

## Contracts

- **DESIGN.md**: the direction stage writes it with plain Read/Write; every
  later stage and every worker prompt reads it. Workers have no chat memory.
- **Dispatch**: tmux dispatch goes through `using-tmux-agent-tools`; worker
  prompts come from `delegation-templates`; tiers per rule `model-dispatch`
  §4–§5, reviewer independence §6. Fanout and dialogue need the user's exact
  authorization. Worker-prompt addendum: "DESIGN CONTEXT: read
  `{repo}/DESIGN.md` first; conform to its tokens. SKILL: read and follow
  `{member SKILL.md}` first."
- **Loop topology**: the builder is a persistent worker; BLOCK findings go
  back to the SAME builder. Each reviewer is a fresh one-shot, never the
  builder, never reused.
- **Diagram motion** (overrides a member's opt-in gate, never its mechanism):
  a DG-HOUSE diagram whose story IS direction (data flow, architecture,
  dependency, deployment) ships motion: mode `loop`, one `aria-hidden` flow
  token, cycle 3 s or more, no playback controls; `reveal` + path draw only
  when the ORDER of hops carries meaning; `step` only for teaching. Every
  other type (ER, quadrant, bar, Venn) is `none`. A DG-REPO diagram keeps its
  own viewer. Static-first binds both: rule `artifacts-rules` §Diagram.
- **HTML first**: every diagram and visual deliverable is one self-contained
  `.html`; `svg`/`png` are exported from it. A mermaid fence only when the
  user asks or the consuming tool is text-only.
- **References, advisory only** (any stage may query, none owns direction):
  namethatui.com for component names; prompt-motion.com and
  skillry.dev/ai-videos pair each animation with its prompt.

### Executors

Delegable stages are the heavy ones: a build beyond a small scope, and every
review. Constraint loading and small scoped edits stay inline.

| Stage | Executor |
|---|---|
| Route, judge, integrate, talk to the user | Main session |
| Direction (Q2) | Inline, main session; persists to DESIGN.md |
| Build, non-trivial | Persistent tmux worker: the model the chosen row names, `claude` otherwise; inline only for a small scoped edit |
| Pipeline D: compare N module shapes | Parallel in-process sub-agents, judged against PD-DEPTH |
| Every review round | A FRESH one-shot (tier per `model-dispatch` §4) |
| Specialists, DESIGN.md upkeep | Inline |

Defaults: DESIGN.md at `{repo}/DESIGN.md` unless a docs convention exists;
Gate 0 viewports desktop + mobile for any responsive deliverable; `cli` for
delegated stages per `model-dispatch` §5 unless the repo's CLAUDE.md says.

### Quality loop — no pipeline ends at "built"

**Gate 0, fail-closed:** the reviewer records build identity (hash or
commit), artifact path or URL, screenshot paths, viewports, full page and
uncropped. Desktop AND mobile for responsive work. Missing, stale or cropped
evidence → UNCONFIRMED → overall BLOCK; never PASS on code-only review. A
DESIGN.md-only deliverable records file hash or commit instead; the moment a
render exists, the full contract applies. Scroll the page before a full-page
capture so lazy images load.

**Quality bar:** award level — work that could win at Awwwards, the Webby
Awards, or FWA. "Correct and clean" is not the bar.

**Review order (the human is last):**
1. Internal: the builder checks the render against the bar, then runs up to 3
   critique rounds with `advisor` or an opus/sonnet one-shot, fixing between
   rounds; stop when a round finds nothing that moves the work toward the
   bar. An authority that ships its own look-and-fix rounds (DIR-WEB)
   supplies these; add none of yours. Its rounds, its meter-repair reruns,
   REV-WEB fixes and the fix rounds below share ONE cap of three; a BLOCK or
   a new reviewer never resets it.
2. External, by difficulty: one fresh CLI reviewer (`consensus-gate`,
   `args.cli`) for hard work — a new visual direction, complex interaction or
   motion, high stakes — or when internal rounds split. State why you added
   or skipped it.
3. The user, with the Gate 0 evidence bundle.
Each round finds a gap to the bar or stops.

**Rubric, in order:** 1. The slop test — the authority's audit rubric at the
bar above; generic gradient hero, emoji bullets, card-grid sameness, or
taglines and helper text the layout should make unnecessary (units, time
window, source, status and error text stay) = BLOCK regardless of
correctness, and so does a render that is clean but not award-level. If the
authority ships no usable checklist, use REV-WEB's slop test. 2. Prose
discipline. 3. DESIGN.md conformance. 4. The stage's frozen ACCEPTANCE.

**BLOCK** only on a rubric item or a frozen ACCEPTANCE line. Accessibility
polish no ACCEPTANCE line names is a NOTE: list it, do not BLOCK, do not open
a fix round. Only NOTEs → `VERDICT: PASS`.

**Report contract:** per item PASS / FAIL / UNCONFIRMED + one-line reason;
findings tagged persistent/new/regression/evidence-gap; all blockers in one
pass; final line exactly `VERDICT: PASS` or `VERDICT: BLOCK`, quoted in your
report. A report without the `VERDICT:` line → ask the SAME reviewer for that
line; never spawn another reviewer for it.

**Rounds:** BLOCK → the same builder fixes → a fresh reviewer re-audits.
After two fix rounds (inside the shared cap), route by cause: same-root
failures + wrong-direction signals (rule `judgment-rubrics` §4) → back to
direction · evidence gap → repair the evidence path, re-audit · new or
regression → triage separately · otherwise → stop and ask the user with the
failure trail. PASS → write the final tokens into DESIGN.md and report with
the evidence bundle. "Built and audited: PASS" is a done claim; "built" is not.

**Polish / Operate mode:** the first rendered build goes to the USER
(URL or screenshot, desktop + mobile) before any reviewer. Direction is the
user's call; the reviewer checks the accepted direction. One round, not a loop.

## Member table

The only place a design member is chosen. Edit rules: trunk §Changing the
tree. `recheck` = the fact that makes the row stale, not a new winner.

| id | question | when | choice | evidence | date | recheck | class |
|---|---|---|---|---|---|---|---|
| DIR-WEB | Q2 | A new web page or web app screen | `design-taste-frontend` (Taste v2), built on a Sonnet worker. State the token budget first; one look-and-fix round by default, up to its max of 3 only when the user raises the budget | Owner ruling 2026-10-23; trial `trials/taste` (lint 0 FAIL 0 WARN) | 2026-10-23 | absent from the lock, or a render it passed fails REV-WEB's slop test twice | owner |
| REV-WEB | Q2 review | After a DIR-WEB build | `impeccable` audit, then polish; it reviews, it does not reset direction | Owner ruling 2026-10-23; community order Taste → impeccable | 2026-10-23 | absent from the lock | owner |
| DIR-NATIVE | Q2 | Native iOS/Android screen, existing interface (audit first), DESIGN.md | `impeccable` | Owner ruling 2026-10-23 | 2026-10-23 | absent from the lock | owner |
| DG-REPO | Q1 | One of its native types drawn from a real repo or trace | `archify`. `finalize --repo-root` ties repo facts to the code; run from a scratchpad folder with a relative `meta.output`; native diagrams only — never explainer mode, decline its offer to add an `[archify explainer: ...]` rules line; a passing `finalize` is not visual-quality proof. Static-first exception: with JS off its fine labels may hide (owner ruling 2026-10-23) | Owner ruling 2026-10-23; trial `trials/archify` (finalize 4/4 gates, exit 0) | 2026-10-23 | absent from the lock, or its type list drops this diagram | owner |
| DG-HOUSE | Q1 | Any other diagram | `diagram-design` (house style; mermaid, draw.io, excalidraw import; PNG/SVG export). It self-triggers: when another row owns the diagram, say so in the plan | former design router, 2026-10-13 | 2026-10-23 | absent from the lock | mechanical |
| PROTO | Q1 | "Would this work?" — one design question | `prototype`, alone, no loop, no verifier | design router | 2026-10-23 | absent from the lock | mechanical |
| PD-DEPTH | Q1, Q5 | Module, API or domain shape | `codebase-design` depth criteria; `domain-modeling` for terms and ADRs; applied inline as judging criteria | design router | 2026-10-23 | absent from the lock | mechanical |
| SP-MOTION | Q3 | UI motion or gesture | `apple-design` (springs, gestures, interruptible motion) | design router | 2026-10-23 | absent from the lock | mechanical |
| SP-CHART | Q3 | Any chart, stat tile or dashboard layout | `dataviz` (bundled); if it does not resolve, chart inline and say so | design router | 2026-10-23 | not in this turn's listing | mechanical |
| SP-ARTIFACT | Q3 | Publishing any Artifact page | `artifact-design` (bundled), mandatory; `artifact-capabilities` only if the page calls connectors | design router | 2026-10-23 | not in this turn's listing | mechanical |
