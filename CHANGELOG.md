# Changelog

## using-skills flows 2026-09-28

- `using-skills` now chains the lock skills: a Flows section (situation → handoff → artifact → loop) for feature, bug, test plan and handoff, with conditional stages only, plus owner pointers for architecture, design, writing, tmux, loops and skill edits. Agreed by advisor and a Codex reviewer over two rounds; the loop closes on a proposal (`lessons.md`, `Status: proposed`), never a self-edit.

## skills roster 2026-09-27

- The lock drops 16 skills (64 → 48), judged by what a skill carries, not how often it ran. Removed: `karpathy-guidelines`, `git-commit`, `refactor`, `simplify`, `resolving-merge-conflicts` (generic discipline the kernel already states); `brainstorming` (its approval wait conflicts with the kernel; its visual companion goes with it); `high-end-visual-design`, `design-taste-frontend` (prose-only taste, same job as `impeccable`, now the one direction authority); `image-to-code`, `imagegen-frontend-web`, `imagegen-frontend-mobile` (the image-first pipeline is gone from `using-design-skills`); `pierre-guard` (upstream 404), `release-plannotator`, `review-renovate`, `migrate-to-shoehorn`, `update-deps` (bound to projects and tools no local repo uses). Then `wait-what` (48 → 47): the kernel-routed `simplified-english` rule already re-explains a message that did not land. The kernel, routers, router hook table and design evals drop every reference; `deploy.sh` removes the directories on each machine at its next deploy.

## grok-bot-watch 0.8.3

- `send.mjs` review fixes (Sol round 2, `VERDICT: BLOCK`, 1 P1 + 2 P2). P1: after a refused submit, the clean-up matched the composer by text only, so switching to a bot whose draft was the same text cleared that draft. `unsend` now clears only while the target bot is open. P2: `sent` matched the text anywhere in whatever transcript was open; it now needs the target bot's transcript to hold one more `You <message>` than counted just before the submit, so an old copy or another bot's text never counts. P2: a helper run that throws or prints no verdict now says `unconfirmed … check the app before resending`, not `not sent`.
- Tests now run the real page expressions over a fake DOM (`effects(ev)`), not only a model of them: 25 send tests, including hostile text, moved, edited, an old copy with a refusing form, the same-text draft on B, and B's transcript holding the text; 5 mutations of the page scripts are each caught. Live: stand-in draft → `draft`, intact; tagged message to w40 → `sent`.

## grok-bot-watch 0.8.2

- `send.mjs` review fixes (Sol review of 0.8.0, `VERDICT: BLOCK`, 2 P1 + 3 P2). P1: checks, paste and Enter were separate CDP calls, so a keystroke or bot switch between them could get a user's draft cleared or the message sent to another bot. The send is now one in-page script: check bot and empty composer, paste, check text; wait 50 ms (the app's form reads React state set after the paste: a submit in the same tick sent nothing, seen live), then with no gap check bot and text again and submit the composer's form. A switch or a keystroke in the wait is reported (`moved`, `edited`) and nothing is sent or cleared; the only text ever cleared is the script's own just-checked paste. P2: success is now the transcript showing the message, never an unreadable composer (`unconfirmed`); a CDP error or page exception rejects instead of reading as empty; text that already starts with a tag is not tagged twice; the band says `check the app before resending` for `unconfirmed`, `timeout` and `failed`.
- Live: a stand-in draft → `draft`, draft intact; a tagged message to NOVA 替身 w40 → `sent`, composer empty. Found live on the way: a synthetic Enter keydown does not send; an awaited in-page promise must be held (`Promise was collected`, the message had gone). 14 send tests, 4 mutations each caught; mod 66 tests.

## grok-bot-watch 0.8.1

- After a reload the band showed `▲ 03972e9a pending` (seen live in a control session): a kept watch had no name and no state until the first 10 s poll, drawn with the warning glyph of a failed read. The mod now reads once at session start, and a watch not read yet shows `○ reading the app…`. Test: the name and `waiting` appear with one read and no poll; dropping the start read fails it.
- Checked live that a tagged reply wakes only its sender: the store holds 4 sessions' watches; only this session watches NOVA 替身 w40 and its one wake is the reply tagged `[w:29a98092]`; the control session (US_STOCK only) has 0 wakes.

## grok-bot-watch 0.8.0

- Reply from the band, as in the workers panel: the open row (`[ ▸ ]`) starts with a reply line; Enter sends the text to that bot, prefixed with this session's tag so the answer wakes this session only, and a toast says `sent` or why not. One send at a time.
- New shared core script `scripts/send.mjs` (mod copy `bin/send.mjs`): message on stdin, opens the bot, pastes into the empty composer, checks the text landed and the same bot is still open, then a trusted Enter; `sent` once the composer empties. A draft in the composer is never touched (`draft`); a partial paste is cleared (`not-pasted`); the id is validated before any connection (`bad-id`). 7 tests over a fake app; 3 mod tests (tagged send, no line on a closed row, refusal toast). Live: `bad-id`, `no-bot`, `empty` refused before connecting; a tagged test message to NOVA 替身 w40 → `sent`, and it shows in the transcript as `You: [w:29a98092] …`.

## grok-bot-watch 0.7.6

- `ensure.mjs` review fix (Sol r5 `VERDICT: BLOCK`, P1): waiting for the app to exit gave up early when the next 2 s `pgrep` could not finish inside the window, so an app that died 2.5 s after `pkill -9` was left down with no relaunch. The wait now runs its whole window and ends on a look that starts at or after the window's end; that last look is counted in `QUIT_MS` (now 25 s), so the budget still holds. 18 tests: a kill that lands at 2.5 s is relaunched, one past its window returns `failed:quit` inside the budget, the quit phase stays inside `QUIT_MS` when the kill lands at the window's end, and the late-lock check runs with the lock freed at 16 s and at 22 s. Seven mutations each fail a test. Live: the app without the port, three callers → one `restarted`, two `ok`, one process.

## grok-bot-watch 0.7.5

- `ensure.mjs` review fixes (Sol r4 `VERDICT: BLOCK`). P1: the 75 s budget was checked only on entry, so slow real effects could still run past the callers' 90 s, even between a quit and its relaunch. Every effect now has a fixed bound (`T`: fetch 1.5 s, lsof/pgrep/pkill 2 s, sidebar 4 s, open 10 s), the real effects use those bounds as their timeouts, and each step starts only when its bound still fits: no wait round past the end, quit polling on the clock, not a count, a quit that hangs for 10 s is forced (`pkill -9`) so the relaunch still fits, and no quit starts without the time for quit plus relaunch (else `busy`). P2: a connection to the lock port no longer holds up the release. 14 tests, with each effect taking its whole bound in the new ones; six mutations (each guard, the forced quit, the count-based polling, the lock's dropped connections) each fail a test. Live: the app without the port, three callers → one `restarted`, two `ok` in 4 s, one process.

## grok-bot-watch 0.7.4

- `ensure.mjs` review fixes (Sol r3 `VERDICT: BLOCK`, two P1). The recovery lock is a listening socket on `127.0.0.1:<port+1>` instead of a lock directory: the kernel makes it exclusive and frees it when the holder exits or is killed, so there is no stale takeover to race and no other caller's lock to release. Lock wait and recovery share one 75 s budget inside the callers' 90 s, and nothing destructive starts with less than 45 s left (reopen, quit, launch): a caller that gets the lock late returns `busy`. 10 tests; dropping the budget guard fails the late-lock one; the lock test kills a holder with SIGKILL and takes the port. Live: three callers after a kill → one `launched`, two `ok`, one process.

## grok-bot-watch 0.7.3

- A wake says who the reply is for, before the app text: "it answers a message from this session" when it starts with this session's tag, else "it may answer another session's message … check the conversation before acting". Seen live: an untagged NOVA reply to the agent-scripts session woke a us-options-terrain session, which took it as its own.

## grok-bot-watch 0.7.2

- `ensure.mjs` review fixes (Sol r2 `VERDICT: BLOCK`, two P1). Recovery is serialized across processes by a lock (`$TMPDIR/grok-bot-ensure-<port>.lock`, stale after 2 min) and re-checked under it, so a late caller after one outage no longer quits the app an earlier caller just relaunched; a caller that waits returns `ok` once the port answers, or `busy` after 90 s. A listener counts as Grok Bot only when every listening pid (`lsof -t`) is a `Grok Bot` process: another program answering an empty target list is `port-taken` and nothing is opened or quit (0.7.0 reopened, then quit Grok Bot). `recover()` takes its effects as arguments; 7 tests drive it over a fake app, and dropping the re-check or the owner check fails them. Live: two callers after a kill → one `launched`, one `ok`, one process; a foreign listener → `port-taken`, Grok Bot's pid unchanged.

## grok-bot-watch 0.7.1

- Review fixes (Sol r1 `VERDICT: BLOCK`, P1). A session tag is a UUID session id's first 8 characters, else an 8-character hash of the whole id: two `local-` fallback ids shared `[w:local-ab]` under 0.6.2. A tag is exactly `[w:` + 8 `[0-9a-z]` + `]` at the start of the reply, so other bracketed text no longer counts. The new fallback test fails with the 0.6.2 token (59 pass, 1 fail).
- README states what the tag does not do: the echo is best effort, a quoted tag misroutes, one preview per bot drops a reply when two settle inside one read, streaming arms every watcher, and every watcher sees the panel's preview.
- `ensure.mjs` gets 90 s from the mod and the TUI (its slow path is about 57 s).
- `using-grok-bot-app` "Sending is gated": a message to one of our own agents inside an approved task goes without approval of its text (owner ruling 2026-10-03); hard-stop actions still need it.

## grok-bot-watch 0.7.0

- The CDP port moves from 9231 to 39231 (Chrome and Node debuggers sit at 9222-9230; other tools collided). `GROK_BOT_CDP_PORT` overrides it for the sidebar helper, `grok-bot-tui` and the mod (the engine runs the helper over its own environment). Each read reports the port it used.
- The tools keep the port up themselves, per the owner's standing rule (2026-10-02: restart Grok Bot without asking; an app update relaunches it without the flag). New `scripts/ensure.mjs` (skill; synced to the mod's `bin/`): renderer answers → nothing; port up with no window → `open -a`; app running without the port → quit and relaunch with it; not running → launch; another app on the port → left alone (`port-taken`). The mod runs it beside the tick on `port-down` / `renderer-missing`, at most once per 2 minutes, and toasts the outcome; the TUI does the same once per minute and shows it under the header. `sidebar.mjs` stays read-only. Permission surface: `$.process.run` is now also via `ensureApp`. Live on app 0.66.0: restart from 9231 to 39231 in 3 s, a second run `ok`, launch from stopped `launched`; `ensure` waits for the sidebar to list bots (the renderer answers a moment before it draws), and a reopen that fails falls through to quit-and-relaunch (a quitting app still listens with no page).

## grok-bot-watch 0.6.2

- A shared (primary) bot no longer wakes every watcher for every reply, once the bot echoes a tag. The watch receipt gives this session's tag, `[w:<sid8>]`; the session starts what it sends with it, and a settled reply that starts with another session's tag is recorded as seen but wakes nobody here. An untagged reply wakes every watcher, as before, so nothing changes until the bot echoes. Does not fix two replies settling inside one 10 s read (one preview per bot); per-task watch is the follow-up once the app's async-task rows are mapped.

## grok-bot-watch 0.6.1

- The conversation read names an email card's sender. A "New email" card (From … Subject, then the body) has no sender line; the parser took its last field label, so the open row showed `Subject` as who said it. It now reads `<sender above> · New email`. Seen live on US_STOCK (app 0.66.0); the new parse case fails on 0.6.0.
- `grok-bot-tui`: the list scrolls with the selection (a `↓ N more` line keeps its own row), a degraded read says how to fix it (the skill's Connect steps), the header counts replying and unread bots, and the detail wraps long messages and keeps the newest when the terminal is short (`↑ N earlier lines`). 8 TUI tests.

## grok-bot-watch 0.6.0

- Two packages, one core, as tmux-agent-tools does for workers. The row model (`settled`, `inProgress`, the draft/replying state, `clean`, `fit`, `ago`, the UUID checks) and the sidebar helper now live in the skill: `skills/using-grok-bot-app/scripts/{lib/core.ts,sidebar.mjs}`. The mod carries byte-identical copies (`hooks/lib/core.ts`, `bin/sidebar.mjs`) written by `scripts/sync-mod-core`; `test-version-sync-smoke` fails on drift. Why two: the mod is a Claude Code-only plugin whose cache holds only its own dir, and people install the skill differently (`npx skills` global or project, a checkout), so the mod must not depend on the skill's install and the skill must reach every host.
- New `skills/using-grok-bot-app/scripts/grok-bot-tui`: a full-screen, read-only sidebar view for any terminal (Codex, Cursor, agy, a shell). Bots with state and preview, Enter shows the conversation of the bot open in the app. Watches stay in the mod's session store and are not shown. Nothing is added to PATH.

## grok-bot-watch 0.5.2

- The band no longer vanishes on the last `[ unwatch ]` (live 0.5.1: the next watch then needed `/grok-bot-watch` again). A session that has watched a bot keeps `0 bots [ + ] [ close ]`; `[ close ]` (`f`, the fold slot, since there is nothing to fold) hides it until the next watch. A session that never watched still shows nothing. 57 tests pass; dropping the flag fails the unwatch test (1 fail).

## grok-bot-watch 0.5.1

- Live 0.5.0 fixes: the command's reply no longer reads `grok-bot-watch: grok-bot-watch:` (the engine already prefixes the plugin name), and a row whose bot name was never read (the app's CDP port was down at watch time) draws its uuid8 once, not `201040cc 201040cc`. 57 tests pass; the new test fails with the old row (1 fail).

## grok-bot-watch 0.5.0

- Watch without asking the model. `[ + ]` (`w`) in the panel header opens a bot-id field; Enter on a UUID or an 8+ char prefix watches it through the same path as the `watch` tool (`watchBot`), a refused id stays in the field with a toast saying why, Enter on nothing closes it. `/grok-bot-watch <id>` watches at once; bare, it opens the field, the way in while no watch keeps the band up. Mobile has no Input, so there only the command works. Deleting was already `[ unwatch ]`.

## grok-bot-watch 0.4.1

- The panel draws this session's watches only. 0.2.0 copied the workers panel's orphan idea without its other half: there an orphan is adopted by a collector in the same cwd so the result still lands; here a wake only means something to the conversation that armed it, so no session can take another's watch, and the `○ orphaned` row stayed in every session until the day-old prune. Each session watches its own bot; a dead session's record is still pruned after a day.

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
