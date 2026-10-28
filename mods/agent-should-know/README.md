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
▌agent should know v0.2.0 · 2 heads-up · 1 handled · audits 4/6 · 2→1 · 81200 tok ⚠ 1 disclosed [ ⧉ log ][ ▾ fold ][ hide ]
  log: ~/.local/state/agent-should-know/agent_automation/2026-10-20-28d2c553.log
```

- The count is this session's: cards flagged, and verdicts logged for them.
- `audits p/n · f→r · t tok` shows once the first audit ran: audits that passed of all
  audits, episodes that failed → findings resolved, and the judges' tokens.
- `⚠ d disclosed · u unaudited` and `⚠ ledger not written` show in yellow, never dim, only
  when they are not zero; the plain counts are cut first when the line is short.
- `[ ⧉ log ]` opens the session's log (macOS `open`); before the first card it says
  nothing is logged yet.
- Open, it shows the log's path; with no card yet, one line on what will be logged where.
- `[ hide ]` takes the band away; `/heads-up` shows it again and prints the count and
  path. Narrow: `[ ⧉ ][ ▾ ][ ✕ ]`.

## Owner ledger, alignment and self-audit (0.2.0)

| Part | What it does |
|---|---|
| Owner ledger | Every prompt you type (`composer`), send from the phone (`bridge`) or queue is one row, kept whole, with its attachment names and the spans you quoted or pasted (material, not a command). A slash command you type is an `owner-command` row. `sdk`, `channel`, `slack-ping` and `unclassified` prompts are `unknown` rows: kept, never an ask. Peers, plugins (`asUser` too) and task notifications are not ledgered. The file is `~/.local/state/agent-should-know/<repo>/<day>-<sid8>.asks.jsonl`; a reload reads it back. A resume adds a row that says the earlier asks are not in this ledger. |
| Compaction | Each main-loop compaction tells the summarizer to quote every owner message verbatim, in order (after any instructions already given). After it, the next main-loop tool result and your next prompt carry the ledger: whole up to 60,000 characters, else the open rows, the newest 20 and the path. |
| Alignment hold | Once your message reaches the model, tools that only read run (Read, Grep, Glob, ToolSearch, WebFetch, `rg`/`git log`-style Bash, …). The first other call is denied, with your message quoted, until the agent's text after it holds `U<n> 「…」 → <what I do now>`. When Haiku classifies the message as a correction (or cannot answer), the line is not enough: the text must hold a `Retro U<n>:` block (what was claimed, what the tools show, the rule missed, the corrected act). Subagents and plugin tool calls are not held. |
| Self-audit | When a main turn ends, a judge reads the reply against the ledger and the evidence: a fork of the session first; when the fork does not answer, an evidence package (texts, tool calls with write bodies elided, results head 1,500 + tail 500 characters) goes to the session's model. Its JSON findings are checked by the mod (each quote must be in the reply, each ref in the ledger or the tool calls). FAIL blocks the stop with the findings, two rounds at most; then the reply must close with a `未解決的稽核項目` section that lists them (DISCLOSED). When no judge answers, or the answer is malformed, the reply must carry `自我稽核未執行：<reason>` (UNAUDITED). A block from a settings Stop hook and the audit's go out as one reason. |

Log rows: `ask`, `align`, `retro`, `held <tool> U<n>`, `gate pass|block`, `audit-pass`,
`audit-fail <ids>` (with its round), `audit-resolved <ids>`, `audit-disclosed`, `audit-unknown`,
`finding-invalid`, `disclose-missing`. Each audit row carries the path that answered (`fork` or
`alt`), its latency and its token usage.

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
- Bash counts as reading only by its first word per pipe segment; `-i` anywhere (also `rg -i`)
  and redirects hold it. `sed -n` with a `w` command or `git diff --output` still pass.
- The audit runs at every main-turn end and costs a judge call (high effort). Whether
  `$.model.fork` answers inside a Stop hook, and what it costs, is measured in the log rows, not
  promised here.
- Unledgered origins: `scheduled-trigger`, `auto-continuation`, `observer`, `observer-activity`,
  `projects-relay` and `peer-send-message` are not ledgered until the owner rules on them.
- An alignment duty closes when its turn ends without a block, met or not; the audit's checks
  (c) and (d) judge that turn.
- The `gate` row folds every settings Stop hook into one verdict; it cannot say which one blocked.
