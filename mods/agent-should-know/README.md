# agent-should-know

Version 0.3.0 keeps the card relay below and adds a report-only owner-ask observer.
It never denies tools or asks the Stop gate to enforce an audit.

- `/asks` shows health, native owner UUIDs, exact item spans and audit details.
- `/asks off` cancels the current epoch in memory first, then saves the session control.
- `/asks on` clears degraded state after the cause is resolved. It refuses a second audit while an old request settles.
- `/asks migrate` is an explicit owner maintenance action. Stop old 0.2 producers first. It inventories old `*.asks.jsonl`, saves byte-preserving backups, then archives them under `_v0.2-archive/`. A second run changes nothing. It preserves new `owner.asks.jsonl` files and all other owner text.

New records live under `~/.local/state/agent-should-know/<fullSid>/`: `owner.asks.jsonl`,
`audit/<bundle-sha256>.evidence.json`, the matching result JSON, and `diagnostics.jsonl`.
The historical compaction index stays at `agent-hooks/<fullSid>/asks-open.md`.
All records use schema 1. Native composer and bridge rows define owner authority;
peer, plugin, queued and unclassified text cannot create asks. Each item keeps its exact UUID and span.
The judge's interpretation stays separate. A PASS can answer tasks with reply and tool references;
constraints stay open. Missing evidence, protocol errors and timeouts produce UNKNOWN.

The audit starts once from a tracked `clock.after(0, callback)` at turn end. It uses
the turn's model, high effort, `maxTokens: 16000` and `timeoutMs: 180000` (0.3.1: the 1024-token
API default left 15 of 17 audits on 2026-10-29 as `empty-reply` or `invalid JSON`). An UNKNOWN
result file keeps `output_tokens` and the first 500 characters of the reply as `excerpt`. Before implementation, the real
model wait measured 60013 ms inside a hook (budget 10000 to 9998), and 60023 ms in
the callback (budget 10000 to 10000); the timer hook returned in 10.4 ms while tools ran.
Audit notices use `ui.log`, including headless `ui_log`, and never submit prompts.
Off, clear and a new owner message cancel the epoch; late results cannot close new asks.

At start only `file:`, `asks:`, `off:`, `duties:` and `episode:` are removed with
`store.delete`. A cleanup error stays visible as `cleanup incomplete`; tools still run.
Non-empty sid keys are not removed. Resume can use native engine recovery state;
disk-only history has unknown coverage and cannot restore current authority or a PASS.
Store read errors leave the observer degraded until explicit `on`.
Diagnostics warn above 1 MiB and never rotate or delete themselves. Writes compare the
committed bytes and use temp/replace; a changed file is preserved and reported.
No remote deployment or full device rollout is implied by local tests.

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
▌agent should know v0.3.0 · 2 heads-up · 1 handled [ ⧉ log ][ ▾ fold ][ hide ]
  log: ~/.local/state/agent-should-know/agent_automation/2026-10-20-28d2c553.log
```

- The count is this session's: cards flagged, and verdicts logged for them.
- `[ ⧉ log ]` opens the session's log (macOS `open`); before the first card it says
  nothing is logged yet.
- Open, it shows the log's path; with no card yet, one line on what will be logged where.
- `[ hide ]` takes the band away; `/heads-up` shows it again and prints the count and
  path. Narrow: `[ ⧉ ][ ▾ ][ ✕ ]`.

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
