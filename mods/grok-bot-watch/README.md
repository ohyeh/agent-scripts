# grok-bot-watch

A Claude Code function-hook mod. You watch a Grok Bot bot by UUID; the mod
reads the app's sidebar every 10 s and submits one prompt to this session when
the bot finishes a new reply. The session no longer has to poll.

## Requirements

- `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`; without it the plugin does not load
  and the tools do not appear.
- Node 22+ (global `WebSocket`) as the `node` on the login `PATH`: the mod runs
  `command -v node` through `/bin/sh -lc`, which on macOS can differ from your
  shell's node. An older one shows `node-too-old` in the panel.
- Grok Bot started with `--remote-debugging-port=9231` and its window open (see
  the `using-grok-bot-app` skill). The mod never starts, restarts or clicks the app.

## Install

```sh
claude plugin marketplace add ohyeh/agent-scripts
claude plugin install grok-bot-watch@agent-scripts
```

During development, load the directory: `claude --plugin-dir mods/grok-bot-watch`.

## Tools

| Tool | Input | Does |
|---|---|---|
| `mcp__grok-bot-watch__watch` | `botUuid`: full UUID or an 8+ char prefix | Records a watch for this session; the current reply is the baseline |
| `mcp__grok-bot-watch__unwatch` | `botUuid` | Deletes the watch; no new wake is submitted |

## Panel

Above the prompt, only while a watch or an orphan exists:

```
▌grok bot watch v0.2.0 · 1 bot · 1 replying · read 4s ago [ hide ]
  ◐ NOVA 替身 w39 201040cc · replying [ unwatch ] 「第 4 條只當輔助…」
```

| Glyph | Means |
|---|---|
| `●` waiting | idle; the next new reply wakes this session |
| `◐` replying | the bot is streaming; the wake comes when it settles |
| `✦` new reply | woke this session in the last 2 minutes |
| `▲` a state | the read failed (`port-down`, …); fixes: `using-grok-bot-app` skill |
| `○` orphaned | another session's watch that nobody polls |

The row also counts wakes (`woke 2× 5m ago`) and lost wakes, and ends with the
bot's last preview. `[ hide ]` (`f` with the band focused) folds the band to its
header line; it never disappears while a watch is armed. `[ unwatch ]` (`u`,
one watch only) stops that watch. The band takes at most 4 rows, and only what
the band's `maxRows` leaves after the plugins below it drew theirs, so a workers
panel keeps its rows and digit hotkeys; with one row left it shows the header
only. It uses letter hotkeys only. The row count of the panels below is measured
from their rendered tree, a heuristic: a line that wraps counts as one.

## What counts as a new reply

A read is *settled* when the row's `data-grok-state` is `idle` (or the row has
none, like a pinned note) and its preview
is non-empty and does not start with `Draft:`. A wake fires when a settled
preview differs from the last settled one. A reply already streaming when you
watch fires once it settles. Observed on Grok Bot 0.59.1.

## Limits

- **Once per preview, not per message.** Two replies inside one 10 s tick can
  merge; two replies with the same preview text merge.
- **Ack first.** The watch is marked seen before the prompt is submitted, so a
  wake is never duplicated; a submit the engine refuses is lost, counted in
  the panel and toasted, never retried.
- **Unwatch is not a cancel.** A prompt already handed to the engine may still
  arrive.
- **Only the registering session polls.** If it stops, other sessions show its
  watches as `orphaned` after 90 s; they are deleted after a day.
- App text in a wake is data: control characters and code fences are stripped,
  name capped at 80 and preview at 500 characters, inside a fenced block.

## How it reads the app

`bin/sidebar.mjs` fetches `/json/list` on `127.0.0.1:9231`, opens the renderer
page's own WebSocket and sends one `Runtime.evaluate` with a constant
expression. It prints one JSON line (`ok`, `port-down`, `renderer-missing`,
`wrong-url`, `selector-not-observed`, `eval-error`, `timeout` or `node-too-old`) and exits
within 2.5 s. The panel adds `no-process` (no `node`) and `helper-failed`
(the run itself failed; the error is in the debug log). It sends no other CDP method.

## Checks

```sh
scripts/test-mod-permissions-smoke   # pinned permission surface + plugin test
scripts/test-mod-typecheck-smoke     # tsc over mods/
node --test mods/grok-bot-watch/bin/sidebar.test.mjs
```
