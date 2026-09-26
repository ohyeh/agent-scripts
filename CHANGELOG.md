# Changelog

## grok-bot-watch 0.2.0

- Renamed from `grok-watch`: plugin `grok-bot-watch@agent-scripts`, tools `mcp__grok-bot-watch__watch` / `__unwatch`, store keys `grok-bot-watch.*`. Breaking: uninstall `grok-watch@agent-scripts`, install `grok-bot-watch@agent-scripts`, and watch again; old watches are not carried over.
- The panel is a band of its own: a magenta `▌grok bot watch` header with the version, bot count, how many are replying and the age of the last read, then one line per bot with its live state (`waiting`, `replying`, `new reply`, `draft in composer`, or the failed read), wake count and age, lost wakes, and the bot's last preview. `[ hide ]` folds it to the header (never gone while a watch is armed); `[ unwatch ]` stops a watch from the panel. Wake counts live in the watch record, so they survive a reload. Letter hotkeys only (`f`, `u`), none of the workers panel's `r`, `q` or digits. 34 tests pass; each new behaviour put back fails its test.

## grok-watch 0.1.2

- `mods/grok-watch` 0.1.2 — review 0.1.1 fixes (fable 5.1, 1 medium + 6 low). The helper reports `node-too-old` when the login-PATH node has no global `WebSocket` (Node < 22) instead of a misleading `eval-error`; README names Node 22+. A tick writes back from the fresh record, so a lost count that lands mid-tick survives. A submit answering `drop: undefined` is accepted, not lost. After a machine sleep, prune waits ORPHAN_MS (not one round) for other sessions to beat. The `watch` receipt carries only a full-UUID row id and labels the bot name as app data. New tests for each, plus the empty-preview arm and the tick gen guard: 29 pass, and each fix put back fails its test. Live: an external write to the store file is seen and pruned by this session, and a fresh one survives its writes.

## grok-watch 0.1.1

- `mods/grok-watch` 0.1.1 — the watch receipt names the mod version (`grok-watch 0.1.1: watching …`), so after a reload the session can see which code it loaded. Adds `scripts/test-version-sync-smoke`: marketplace entry, plugin manifest, `MOD_VERSION` and this file must agree.

## grok-watch 0.1.0

- `mods/grok-watch` 0.1.0 — first version: `watch` / `unwatch` tools, a 10 s read-only CDP sidebar read, one wake per new settled reply (ack-first), an AbovePrompt panel with orphaned rows from other sessions.
