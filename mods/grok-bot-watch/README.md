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
- Grok Bot started with `--remote-debugging-port=39231` and its window open (see
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

The person can watch without asking the model: `/grok-bot-watch <uuid or 8+ char
prefix>` watches at once, bare `/grok-bot-watch` opens the panel's field.

## Panel

Above the prompt, only while this session has a watch. Another session's
watch is never shown: a wake belongs to the conversation that armed it.

```
▌grok bot watch v0.5.2 · 1 bot · read 4s ago [ + ] [ hide ]
  ● NOVA 替身 w39 201040cc · waiting · woke 2× 5m ago [ ▾ ] [ unwatch ] 「第二次收到」
    reply to NOVA 替身 w39, tagged [w:29a98092] — Enter sends          [ send ]
      2:03 AM You · 「請再回一次「第二次收到」」
      2:03 AM NOVA 替身 w39 · 「第二次收到」
```

| Glyph | Means |
|---|---|
| `○` reading the app… | no read yet since this session started or reloaded; the first read runs at once |
| `●` waiting | idle; the next new reply wakes this session |
| `◐` replying | the bot is streaming; the wake comes when it settles |
| `✦` new reply | woke this session in the last 2 minutes |
| `▲` a state | the read failed (`port-down`, …); fixes: `using-grok-bot-app` skill |

The row also counts wakes (`woke 2× 5m ago`) and lost wakes, and ends with the
bot's last preview. `[ hide ]` (`f` with the band focused) folds the band to its
header line; it never disappears while a watch is armed. After the
last `[ unwatch ]` the band stays as `0 bots [ + ] [ close ]`, so the next watch
is one key away; `[ close ]` hides it until the next watch. `[ unwatch ]` (`u`,
one watch only) stops that watch. `[ + ]` (`w`) opens a field above the rows:
type a UUID or an 8+ char prefix and Enter watches it; a refused id stays in
the field with a toast saying why, and Enter on nothing closes it. The field
is the same path as the `watch` tool. Mobile has no text field: use the command. `[ ▸ ]` (`o`, one watch only) opens the row.
The open row starts with a reply line (the workers panel's tell line): type
and Enter sends it to that bot, prefixed with this session's tag and the sender
mark `⟨Claude⟩` so its answer wakes this session only (Sharing a bot between
sessions); text that already starts with a tag goes as typed. `bin/send.mjs`
opens the bot in the app, sends it and opens the bot that was open before again; a toast says `sent`, `… check the app before resending` when it may
have gone but was not seen (`unconfirmed`, `timeout`, `failed`, or the helper run
itself failing), or why not. A
draft already in the app's composer is someone typing: nothing is sent and the
draft is never cleared (`draft`). One send at a time. Mobile has no text field. When the bot is the one open in the app, the row shows the last 5 messages of both
sides, oldest first, read from the transcript on screen (only a send clicks a
bot open). Otherwise it shows the last 5 new replies the mod saw (a lost wake is listed too), newest
first: the sidebar previews (≤ 140 characters on 0.59.1, stored cut to 200),
kept in the watch record. Read the
transcript (skill) for more. The band takes at most 4 rows (9 with a row open), and only what
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

## Sharing a bot between sessions

A primary bot serves many sessions, and every session watching it sees the same
sidebar row. The watch receipt gives this session's tag, `[w:<sid8>]`. Start each
message you send the bot with it and the sender mark (`[w:<sid8>] ⟨Claude⟩ …`), and
have the bot start its reply with the same tag on the same line. Only two replies
wake a session (0.9.0, NOVA consensus 2026-10-04):

| Reply starts with | Means | Wakes |
|---|---|---|
| `[w:<sid8>]` | an answer to that session | that session only |
| `[w:*]` | a broadcast, e.g. a RULES announcement | every watcher |
| no tag | an answer to Paul (his messages carry no tag) | nobody; recorded as seen |

The app shows Paul's messages and ours as `You`, so the tag and the mark are the
only way the bot and Paul tell them apart. The tag is a UUID session id's first
8 characters, else an 8-character hash of the id.

It cuts noise; it is not isolation or delivery (review: Sol r1, NOVA 2026-10-03):

- The bot's echo is best effort. A reply that drops the tag, or has it cut off
  the preview, wakes nobody: the session sees it only in the panel or the transcript.
- There is no separate thread (seen live on 0.66.0, sandbox bot): a `reply_to`
  reply shows in the main transcript under a quote of the message it answers,
  and the sidebar preview still starts with the reply's own tag, so it wakes as usual.
- A reply that opens by quoting another tag is taken as that session's.
- The sidebar shows one preview per bot. Two replies settling within one 10 s read
  keep only the last: the first session's reply is never seen.
- A reply seen streaming arms every watcher of the bot, so a reply for B that
  stops before settling can wake A on A's old text (pre-existing).
- Anyone who watches the bot sees its preview and open transcript in the panel.

## Limits

- **Once per preview, not per message.** Two replies inside one 10 s tick can
  merge; two replies with the same preview text merge unless a read saw the
  second one streaming.
- **A stopped reply wakes too.** A reply seen streaming that is stopped and
  falls back to the old text still wakes once, with that old preview.
- **Ack first.** The watch is marked seen before the prompt is submitted, so a
  wake is never duplicated; a submit the engine refuses is lost, counted in
  the panel and toasted, never retried.
- **Unwatch is not a cancel.** A prompt already handed to the engine may still
  arrive.
- **Only the registering session polls.** If it stops, its watches stop
  too and are deleted after a day; a new session runs `watch` again.
- App text in a wake is data: control characters and code fences are stripped,
  name capped at 80 and preview at 500 characters, inside a fenced block.

## How it reads the app

`bin/sidebar.mjs` (a synced copy of the skill's `scripts/sidebar.mjs`; see Core below) fetches `/json/list` on `127.0.0.1:39231`, opens the renderer
page's own WebSocket and sends one `Runtime.evaluate` with a constant
expression. It prints one JSON line (`ok`, `port-down`, `renderer-missing`,
`wrong-url`, `selector-not-observed`, `eval-error`, `timeout` or `node-too-old`) and exits
within 2.5 s. The panel adds `no-process` (no `node`) and `helper-failed`
(the run itself failed; the error is in the debug log). It sends no other CDP method.

`bin/send.mjs` (the skill's `scripts/send.mjs`) is the only writer. It reads the
message from stdin and clicks the bot's sidebar row unless it is already open.
The send is one `Runtime.evaluate`, so no click or keystroke lands between its
checks and its actions: the bot is open and the composer empty, paste, the
composer holds the text (whitespace-normalized); then 50 ms for the app's form
state, and again with no gap: same bot, same text, submit the composer's form.
It clears only a paste it just checked, and only while that bot is still open.
It prints `sent` once the target bot's transcript holds one more message from
`You` with exactly this body than just before the submit (an old copy, a bot's
echo or another bot's transcript never counts; no transcript before the submit
means no baseline, so at best `unconfirmed`); otherwise `unconfirmed`, `draft`, `moved` (another
bot opened in the 50 ms; the text stays in the first bot's composer), `edited`,
`not-pasted`, `not-sent`, `no-bot`, `not-open`, `down`.

## Checks

```sh
scripts/test-mod-permissions-smoke   # pinned permission surface + plugin test
scripts/test-mod-typecheck-smoke     # tsc over mods/
node --test skills/using-grok-bot-app/scripts/{sidebar,ensure,send}.test.mjs
scripts/sync-mod-core --check       # the copies match the skill (also in test-version-sync-smoke)
```

## Core

`hooks/lib/core.ts` and `bin/{sidebar,ensure,send}.mjs` are copies of
`skills/using-grok-bot-app/scripts/{lib/core.ts,sidebar.mjs,ensure.mjs,send.mjs}`, shared with the
skill's `grok-bot-tui`. Edit the skill's files, then run `scripts/sync-mod-core`.
Why two packages: this mod is a Claude Code-only plugin whose cache holds only
this dir, and the skill is installed differently per person, so neither may
depend on the other's install. See the header of `scripts/sync-mod-core`.
