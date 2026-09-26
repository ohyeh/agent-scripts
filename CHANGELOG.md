# Changelog

## grok-bot-watch 0.4.0

- An open row shows the conversation itself when that bot is the one open in the app: the last 5 messages of both sides, oldest first, with their times. The helper parses them from the transcript already on screen in the same read-only eval (0.59.1 has no per-message node: sender, body, then a `9:58 PM` line); it still never clicks. Another bot's row keeps the 0.3.0 list of replies that woke us. Review 0.4.0 (1 medium, 6 low): the sender is the line before the first blank line and the body is kept whole, so a message whose text ends in a time is no longer dropped; a failed read clears the conversation instead of showing a stale one. 12-hour times only (the app's format on 0.59.1). 53 + 6 tests pass; live: the helper read 5 messages from NOVA's open transcript.

## grok-bot-watch 0.3.0

- `[ ▸ ]` on a row (`o` with one watch) opens it to the last 5 replies that woke this session, newest first, plus the reply already there at watch time (`before watch`). They are the sidebar previews (≤ 140 chars) the mod already read, kept in the watch record (~1 KB per watch): no transcript read and no click in the app. A same-text reply is its own entry, so a repeat or a stopped reply shows in the list. The open row's lines come out of the same row budget (up to 9 rows), so the workers panel keeps its rows and digits.
- The tick and the wake/lost counts now rewrite a record one at a time, in call order, so a count landing mid-tick no longer writes a stale `armed` over the tick's (review 0.2.1, low). Unwatch and a new watch go through the same queue, so a tick mid-rewrite cannot write a deleted watch back (review 0.3.0, medium); unwatch closes the open row; stored previews are cut to 200 chars. 50 tests pass; each new behaviour put back fails a test (9 mutations).

## grok-bot-watch 0.2.1

- A reply whose text equals the last one now wakes when a read saw it streaming. Live 0.2.0: NOVA answered `收到` twice and the second never woke, because `armed` was only set before the first baseline. Replies that start and settle inside one 10 s tick with the same text still merge. 43 tests pass; each half of the fix put back fails the new test.

## grok-bot-watch 0.2.0

- Renamed from `grok-watch`: plugin `grok-bot-watch@agent-scripts`, tools `mcp__grok-bot-watch__watch` / `__unwatch`, store keys `grok-bot-watch.*`. Breaking: uninstall `grok-watch@agent-scripts`, install `grok-bot-watch@agent-scripts`, and watch again; old watches are not carried over.
- The panel is a band of its own: a magenta `▌grok bot watch` header with the version, bot count, how many are replying and the age of the last read, then one line per bot with its live state (`waiting`, `replying`, `new reply`, `draft in composer`, or the failed read), wake count and age, lost wakes, and the bot's last preview. `[ hide ]` folds it to the header (never gone while a watch is armed); `[ unwatch ]` stops a watch from the panel. Wake counts live in the watch record, so they survive a reload. Letter hotkeys only (`f`, `u`), none of the workers panel's `r`, `q` or digits.
- Review 0.2.0 fixes (fable 5.1, 4 medium + 3 low): the band's height is `maxRows` minus the rows the panels below drew, so it never pushes the workers panel into scroll mode (which disarms its digits); one row left shows the header only, two rows for many bots show the first bot, more add `+N more`. `u` is bound only when one watch shows. A wake is counted only when the submit is accepted. The state is fitted before the name, so a narrow band keeps it and `[ unwatch ]`. The panel shows the preview the `watch` call read before the first tick. The skill points at `grok-bot-watch`. 42 tests pass; each fix put back fails its test (8 mutations).

## grok-watch 0.1.2

- `mods/grok-watch` 0.1.2 — review 0.1.1 fixes (fable 5.1, 1 medium + 6 low). The helper reports `node-too-old` when the login-PATH node has no global `WebSocket` (Node < 22) instead of a misleading `eval-error`; README names Node 22+. A tick writes back from the fresh record, so a lost count that lands mid-tick survives. A submit answering `drop: undefined` is accepted, not lost. After a machine sleep, prune waits ORPHAN_MS (not one round) for other sessions to beat. The `watch` receipt carries only a full-UUID row id and labels the bot name as app data. New tests for each, plus the empty-preview arm and the tick gen guard: 29 pass, and each fix put back fails its test. Live: an external write to the store file is seen and pruned by this session, and a fresh one survives its writes.

## grok-watch 0.1.1

- `mods/grok-watch` 0.1.1 — the watch receipt names the mod version (`grok-watch 0.1.1: watching …`), so after a reload the session can see which code it loaded. Adds `scripts/test-version-sync-smoke`: marketplace entry, plugin manifest, `MOD_VERSION` and this file must agree.

## grok-watch 0.1.0

- `mods/grok-watch` 0.1.0 — first version: `watch` / `unwatch` tools, a 10 s read-only CDP sidebar read, one wake per new settled reply (ack-first), an AbovePrompt panel with orphaned rows from other sessions.
