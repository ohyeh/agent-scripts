# session-assets

A Claude Code function-hook mod. A session makes and prints things: a dev server's
`http://localhost:5173/`, a published Artifact, the files it wrote, a screenshot, a
commit. After a while you cannot tell which is which or find them again. This mod
keeps them in a band above the prompt, each one labelled with what produced it. It
is built the way `grok-bot-watch` and the `tmux-agent` workers panel are built: one
band, per-session state, and slash commands as the path that works in every terminal.

## Band

Above the prompt, only after this session has an asset. Other sessions' assets are
folded into one line.

```
▌session assets v0.1.0 · 2 url · 1 artifact · 2 file · 1 commit · /assets N opens a row   [ hide ]
   1 ● Start dev server      localhost:5173 · 2m ago
       http://localhost:5173/  /assets open 1
   2 ◈ Retro W41             claude.ai · 10m ago
   3 ⎇ fix: strip ANSI       main · 12m ago
  +3 more — /assets N
  ▸ other sessions: 12
```

| Glyph | Kind | Comes from | `/assets open N` |
|---|---|---|---|
| `●` green / `◆` cyan | `url`, local / remote | an http(s) URL in a tool's output | the browser |
| `◈` | `artifact` | an `Artifact` publish; label = its title, else the file name | the browser |
| `▤` | `file` | `Write`, `Edit`, `MultiEdit`, `NotebookEdit` | its default app |
| `▣` | `image` | a picture those tools wrote, or a picture path in Bash output (a screenshot) | Preview |
| `⎇` | `commit` | `[branch hash] subject` in the output of a Bash `git … commit` | nothing (the hash is shown) |

- A URL's label is the Bash call's `description`, else the first 60 characters of the
  command, else the tool name. `local` covers loopback, private ranges, Tailscale
  (100.64/10) and `*.local`; a tailnet host name counts as remote, its IP as local.
- `Read`, `Grep`, `Glob`, `WebFetch` and `WebSearch` add nothing: their output is file
  or page content, not something this session made. A call that failed adds nothing.
- At most 5 assets per tool call. One seen again moves to the top with its newest
  label. Each session keeps 80.
- The band draws in what `maxRows` leaves after the plugins below it (the workers
  panel, grok-bot-watch), and shows `+N more` when it runs out of room. With one row
  left it shows the newest entry. It has no hotkeys: the workers panel owns digits and
  `r x q i a`, and grok-bot-watch owns `w f o u`.

## Commands

| Command | Does |
|---|---|
| `/assets` | hide or show the band (kept across reloads) |
| `/assets N` | open or close row N: the full URL as a link (cmd-click opens it), or the path or hash |
| `/assets open N` | open row N: `open <url or path>`, as an argv; only http(s) or an absolute path |
| `/assets all` | unfold or fold the other sessions' assets |

The `[ hide ]` and `▸ other sessions` buttons do the same, but in Warp `ctrl+x tab`
does not reach the band (see the tmux-agent README), so use the commands there.

## Storage

The `$.store` key `session-assets.s.<session id>` holds one session's list, and
`session-assets.panel` holds whether the band is hidden. One key per session means two
sessions never overwrite each other's lists. A session whose newest asset is more
than 30 days old is deleted at the next session start.

## Requirements

- `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`; without it the plugin does not load.
- macOS for `/assets open` (it runs `open`).

## Install

```
/plugin install session-assets --marketplace ohyeh/agent-scripts
```

During development: `claude --plugin-dir mods/session-assets`.

## Limits

- No thumbnails. `Image` draws only in kitty or Ghostty, not in Warp or tmux.
- Only tool calls are read. A URL that appears only in Claude's reply text is not kept.
- A picture path with a space in it is not read from Bash output.
- Not checked: whether a local URL still answers, or whether a file still exists.

## Checks

```sh
MOD=mods/session-assets scripts/test-mod-permissions-smoke   # permission pin + plugin tests
scripts/test-mod-typecheck-smoke
MOD=mods/session-assets scripts/test-version-sync-smoke   # one version in manifest, marketplace, MOD_VERSION, CHANGELOG
claude plugin validate mods/session-assets
```
