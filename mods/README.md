# mods: band and TUI rules

These rules apply to every surface the ecosystem draws in a terminal: a mod's band (Claude Code's
`AbovePrompt` render site, the area above the prompt) and a full-screen TUI. Today these are
session-recall (band + `bin/tui.mjs`), grok-bot-watch (band), `grok-bot-tui`
(`skills/using-grok-bot-app`), and in `ohyeh/tmux-agent-tools` the workers band and `tmux-agent-tui`.
That repo follows this file; it does not keep a second copy.

"Band" is Claude Code's name for that site, not an industry term. Tags: **Band**, **TUI**, **Both**.

The rules merge two community skills (`gfargo/tui-design-skill`, `pageton/tui-design-skill`), the
TUIKit guidelines, research through the Grok Bot front (2026-10-16), and a review by the four
collaborators (Claude, sol, agy, advisor). Where a rule cites a fixed standard, the cite is given.

| # | Tag | Rule |
|---|---|---|
| 1 | Both | A band is inline: it draws in the host's frame and never takes the screen. A full-screen TUI uses the alternate screen (`\e[?1049h`), so the shell's scrollback stays as it was. |
| 2 | TUI | Restore the terminal on every way out: q, Ctrl-C, Esc, SIGINT, SIGTERM, SIGHUP, an uncaught exception, `exit`. Restore = show the cursor, raw mode off, bracketed paste off (`\e[?2004l`), leave the alternate screen (`\e[?1049l`). Make the restore run once. |
| 3 | Band | Draw inside what the host gives: `maxRows` minus the rows below, and `bodyColumns`. A tree taller than `maxRows` scrolls and disarms the band's digit hotkeys. When even the header does not fit, draw nothing. |
| 4 | Both | Dim is for secondary information only (times, separators, a place). An element you can act on (`[ ↩ quote ]`, `[ ⧉ tui ]`, `[ hide ]`, `[ + new ]`) or a state that matters (`⚠ down`, `! stale`) is never dim alone. |
| 5 | Both | Meaning is never color alone: give a symbol with the color (`✓ up`, `⚠ down`, `● local`, `◆ remote`). Honor `NO_COLOR` (no-color.org) where the surface sets its own colors. |
| 6 | Both | No border inside a border. Separate with a blank line, a rule (`─`) or a column gap. |
| 7 | Band | Buttons are `[ icon word ]` when the header has room, `[ icon ]` when it does not. Room test (the workers band's): `cells(header text) + cells(buttons with words) <= bodyColumns`. |
| 8 | Both | Band: no help text, except in the empty state. TUI: a footer of 3 to 5 key hints made from the keymap, keys in bold; `?` shows the rest. A message takes the footer's place for one screen. |
| 9 | Both | Width is display cells, not string length: CJK, fullwidth and most emoji take 2 cells (UAX #11). |
| 10 | Both | Cut to fit, never wrap a row: a path is cut in the middle, prose at the end, with `…`. Only a detail pane may wrap. |
| 11 | Both | The title is `▌name vX`, then dim status (` · 7 assets`). Every band and every TUI shows its version, at every width: when room runs short the status gives way, never the name and version. The version comes from the plugin manifest, or for a skill's TUI from `metadata.version` in its SKILL.md. A row you can point at shows its token as you type it (`#a5`, not `a5`). |
| 12 | TUI | Show the selection in reverse video. q, Ctrl-C and Esc all quit (Esc goes back first when a sub-view is open). Turn bracketed paste on (`\e[?2004h`) and never read pasted text as keys. |
| 13 | TUI | Width ladder: wide (120 or more columns) = list and detail side by side; standard (80 to 119) = list with a detail line; narrow (under 80) = one pane, Enter opens the detail, Esc comes back. Below the floor (about 40 x 10), show one line that says to make the pane bigger. |
| 14 | Band | Every band can fold to its title bar: `[ ▾ fold ]`, then `[ ▸ open ]` (icons only when narrow). Fold is not hide: a folded band stays, its counts and warnings still change. Hide takes the band away until its command shows it again. |

## How to check a surface

- Band: render it in the mod's test at a wide and a narrow `bodyColumns` and assert the button labels and the
  header; assert that no row is dim where rule 4 says it must not be.
- TUI: a tmux smoke on a private socket. Paste a `q` with `paste-buffer -p`: the TUI must still run. Send Escape:
  it must quit. Kill it with SIGTERM: the pane must show the shell again, not raw mode.
