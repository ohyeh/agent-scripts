# agent-should-know

A Claude Code function-hook mod for the built-in **You should know** mod
(`cc-plugin-you-should-know@builtin`). During a long task, that mod's side agent
sometimes puts a card above the prompt:

```
✦ Heads up · The fare sums two one-way tickets; the round trip on the plan page is cheaper.
  1: Learn more   2: Knew this already   0: Dismiss
```

In a long task the card is more for the agent than for you. Without this mod
you press `1`, wait, press `2`, then Enter, so that the agent reads it. This mod
does that hand-off for you:

| When | What happens |
|---|---|
| An offer card shows | The card's whole line and the explanation its Learn more would show go to the main agent as a prompt: "check it against the work; if it holds, fix it only within what the user already approved; a fix that needs the user's approval (a model tier, a push, a deletion, a change of scope) is not made: name it and ask; if it does not hold, say why in one line". Both are read from the built-in's store file, where it writes them with the card. A plugin's prompt waits until the running turn ends, so the agent is not interrupted. The prompt says when the card was flagged. The card is hidden from the band. |
| A turn is running when the card shows | That prompt can wait for hours. So the card (line and explanation), its time, and "weigh it in the work still to do" go to the agent at once, after the main loop's next tool result. A subagent's tool result, or another plugin's own tool call, does not carry it. The prompt above still follows when the turn ends, for the logged answer. |
| That prompt's turn ends | The agent's answer (first 600 characters) is added under the card's row in the log. |
| The next morning | Read the log: one folder per repo, one file per session in it. |

Each session writes its own file only, `~/.local/state/agent-should-know/<repo>/<day>-<sid8>.log`,
so sessions never write into each other's file. Every row starts with its UTC ISO time
and the session's sid8, and a verdict names its card by the card's time:

```
# agent_automation · 28d2c553-6d91-4354-a50b-878fbaaa06af · ~/github/agent_automation
2026-10-20T06:40:12Z · 28d2c553 · flagged · Heads up · The fare sums two one-way tickets.
2026-10-20T06:45:03Z · 28d2c553 · handled 06:40:12 · Fixed: the fare now uses the round-trip price …
```

One session, in order: `cat ~/.local/state/agent-should-know/agent_automation/2026-10-20-28d2c553.log`.
One repo, every session interleaved by time:

```
cat ~/.local/state/agent-should-know/agent_automation/*.log | grep -v '^#' | sort
```

The day in the file name is the UTC day of the session's first card. The session keeps
that file after a reload, across midnight too.

## Band

Above the prompt from the session start, folded to its header until you press `[ ▸ open ]`
(the choice is kept for the next sessions). It follows the band rules in
[`../README.md`](../README.md):

```
▌agent should know v0.2.0 · 1 asks open · audit FAIL E2 · coverage known · U3 糾正 · 2 heads-up · 1 handled ⚠ held: REPORTED E1: F1 still open [ ⧉ log ][ ▾ fold ][ hide ]
  log: ~/.local/state/agent-should-know/agent_automation/2026-10-20-28d2c553.log
```

- The status: owner asks still open, the last verdict and its episode, the coverage label
  (`known`, `unconfirmed` for rows read back from the transcript, `unknown` when rows may be
  missing), and the kind the classifier gave the newest rows (糾正, 指令, 一般).
- Then this session's cards: flagged, and verdicts logged for them.
- `⚠ …` in red, never dim, cut last: `held: <reason>`, `store-error:<class>`,
  `U<n> Retro stuck: /asks release U<n>`, `gate marker not written`, `off`.
- `[ ⧉ log ]` opens the session's log (macOS `open`); before the first card it says
  nothing is logged yet.
- Open, it shows the log's path; with no card yet, one line on what will be logged where.
- `[ hide ]` takes the band away; `/heads-up` shows it again and prints the count and
  path. Narrow: `[ ⧉ ][ ▾ ][ ✕ ]`.

## Owner ledger, hold and self-audit (0.2.0)

| Part | What it does |
|---|---|
| Owner ledger | Every prompt you type (`composer`), send from the phone (`bridge`) or queue is one row, kept whole, with its attachment names and the spans you quoted or pasted (material, not a command). A slash command you type is one `owner-command` row. `sdk`, `channel`, `slack-ping` and `unclassified` prompts are `unknown` rows: kept, never an ask. A message from a peer, a plugin (`asUser` too) or the system (task notifications, `scheduled-trigger`, `auto-continuation`, `observer`, `observer-activity`, `projects-relay`, `peer-send-message`) is information, not an owner instruction: no row. The file is `~/.local/state/agent-should-know/<repo>/<day>-<sid8>.asks.jsonl`. A new row waits in the engine's `$.state` queue, with a pending count beside the ledger, until the file write lands; a failed write is retried by the next change. |
| Resume | A start with a ledger for this session reads it back, adds the rows the state queue kept, and reads coverage `unknown` when the pending count names more rows than the queue holds, or the transcript holds owner text the ledger lacks. A start with no ledger but owner text in the transcript reads those rows back as `unconfirmed`. Neither lets an audit PASS until you check the ledger and type `/asks confirm`. |
| Alignment hold | Once your message reaches the model, tools that only read run. The first other call is denied, with your message quoted, until the agent's text after it holds what Haiku asked for: `U<n> 「…」 → <what I do now>` for a directive, a `Retro U<n>:` block for a correction (or when the classifier cannot answer), nothing for a passive message. A Retro is checked by Haiku before the act runs; no answer, a bad answer or an error keeps the hold. After 3 failed checks only your `/asks release U<n>` lets the act run, and that episode cannot PASS. Subagents and plugin tool calls are not held. |
| Reads | Read, Grep, Glob, ToolSearch, WebFetch, WebSearch, a named list of MCP read tools, and Bash in read shapes only: `cat`, `head`, `rg`, `grep`, `find`, `git status/diff/log/show`, `sed -n '<addr>p'`, `sort`, … per pipe segment, with no redirect and none of the options that write or run (`sed w`, `sort -o`, `git --output`, `rg --pre`, `find -exec`, a second `uniq` file, …). `rg -i` reads. |
| Self-audit | At the main loop's final step (`turn.step`: no tool use, a stop reason) a judge reads the reply (`r.answer`, verbatim) against the ledger and the evidence: a fork of the session first; when the fork does not answer, the session's model with the episode's texts, tool calls and results whole. Both race a 60 s clock. The answer must be one JSON object; each finding names where its quote comes from (`reply`, `ask`, `align`, `tool`, `coverage`) and the mod checks it there. FAIL sends the findings back, two rounds at most; after that the reply must carry each finding as its own line `[audit] <id> <problem>` (REPORTED: the asks stay open and the session is held). Only a PASS closes the asks it covered. |
| Held | `~/.local/state/agent-hooks/<sid>/audit/held` (written by the settings Stop gate, or by the mod on REPORTED and align-unchecked): every tool that does not read is denied with its reason, and the band shows it in red. Only your own message (`composer`, `bridge`) clears it; clearing does not close a finding. |

### The Stop gate's files

The settings Stop hook `.agents/hooks/claim-evidence-gate.sh` reads, under `~/.local/state/agent-hooks/<sid>/`:

| File | Written |
|---|---|
| `audit/active` | at session start and each turn start: `agent-should-know 0.2.0` (removed by `/asks off`) |
| `audit/current` | `{"generation":"<n>"}`, bumped at each turn start and each ledger change; the turn start also removes `*.json`, `chain` and `missing-chain` |
| `audit/<sha16>.json` | one per audited reply, named by the first 16 hex of sha256 over the reply with trailing ASCII whitespace trimmed: `verdict` (PASS, FAIL, UNKNOWN, REPORTED, UNAUDITED), `reason`, `generation` (the one at audit start; a result that lands after it moved is dropped), `turnId`, `episode`, `covered`, `tools`, and `findings` for FAIL and REPORTED |
| `asks-open.md` | every open row verbatim, from `## Open owner asks (agent-should-know)` to `<!-- asks-open gen=<n> end -->`, written to a temp file and renamed |

UNKNOWN reasons: `timeout`, `judge:<why>`, `protocol` (not one JSON object), `protocol:pass-with-findings`,
`protocol:pass-not-complete`, `protocol:fail-without-valid-finding`, `coverage:<label>`, `align-unchecked:U<n>`,
`hook-error:<class>`. UNAUDITED: `judge-cap` (3 judge calls since the last owner row), `store-error:<class>`
(two ledger writes failed in a row).

### `/asks`

Only from your own Enter (`composer`, `bridge`): `/asks` prints the open count, the coverage and the last verdict;
`/asks release U<n>` lets a stuck correction's act run (align-unchecked); `/asks confirm` sets coverage known;
`/asks off` turns the hold and the audit off for this session and removes `audit/active`.

Log rows: `ask`, `asks-open`, `classify`, `align`, `retro`, `passive`, `retro-check`, `held <tool> U<n>`,
`held`, `released`, `judge` (path, latency, usage, `tok`), `audit-pass|fail|unknown|reported|unaudited`,
`audit-stale`, `audit-resolved <ids>`, `finding-dropped`, `store-error`, `coverage`, `confirm`, `release`, `off`.

## Install

```
/plugin install agent-should-know@agent-scripts
```

The built-in must be on: `/plugin enable cc-plugin-you-should-know@builtin`.

## Limits

- The line and explanation come from the built-in's own store file,
  `~/.claude/plugins/store/cc-plugin-you-should-know_builtin-*.json`, an internal
  format. When it cannot be read (moved, renamed, `CLAUDE_CONFIG_DIR` set), the relay
  sends the line cut from the band, says why the explanation is missing, and a
  two-sentence card then keeps its first sentence only.
- Hiding is visual. The built-in keeps the card as its view until two prompts
  that a person typed clear it (origin `composer` or `bridge`; this mod's relay
  does not count), and it runs no new check until then. So in a task that runs
  unattended overnight, the log holds the first card only. The built-in stalls
  the same way without this mod, on any card nobody answers.
- The mod reads the card from the band's tree by its two buttons (`Learn more`,
  `Knew this already`) and its tag (`Heads up ·` / `You should know ·`). A change to
  those in a Claude Code release stops the mod, silently.
- If the mod reloads between the send and the answer, the answer row is not logged.
- The early card needs one more tool call in the running turn. A turn that only writes its answer
  after the card shows reads the card in the queued prompt only. During one long tool call (a build,
  a wait), the card arrives when that call ends.
- With a turn running, the agent reads each card twice: early, then with the check. The log keeps
  the second answer only, so the verdict row stays the answer to this card, not the long task's.
- The answer row is the first main turn to end after the one the relay waited behind.
  A prompt you type while the relay waits can run first; its answer is then logged
  as the verdict. An unattended night has no such prompt.
- The repo folder is the last part of the session's start folder, not the git root:
  a session started in a subfolder files under that subfolder's name.
- The alignment hold reads the agent's text from the transcript at each tool call. If the engine
  does not show the running turn's text there yet, an Align line written in the same turn is not
  seen, and the write stays held until the next turn. A message the transcript reformats is never
  seen as delivered, so it opens no hold; a command row matches on `/name` only.
- A Bash shape outside the read list holds, also when it only reads (`python3 -c`, `awk`): the
  list is shapes, not programs.
- The audit runs at every main-turn end and costs a judge call (high effort). Whether the fork's own
  model request comes back through `turn.step` is not known; the mod skips its own audit while one runs.
- Only a PASS closes an ask. An ask answered by a later owner message stays open until an audit passes.
