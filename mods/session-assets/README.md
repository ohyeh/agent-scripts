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
▌session assets 3 url · 1 artifact · 2 file · 1 commit · /assets N opens a row   [ hide ]
   1 ● Start dev server        2m ago · localhost:5173
       http://localhost:5173/  /assets open 1
   2 ◆ reply: Docs             5m ago · x.dev
   3 ◈ Retro W41               10m ago · claude.ai
   4 ⎇ fix: strip ANSI         12m ago · 9685ae2
  +3 more — /assets N
  ▸ other sessions: 3 · 12 assets
```

| Glyph | Kind | Comes from | `/assets open N` |
|---|---|---|---|
| `●` green / `◆` cyan | `url`, local / remote | an http(s) URL in a tool's output, in Claude's reply (`reply: …`), or in a prompt you typed (`you: …`) | the browser |
| `◈` | `artifact` | an `Artifact` publish; label = its title, else the file name | the browser |
| `▤` | `file` | `Write`, `Edit`, `MultiEdit`, `NotebookEdit` | its default app |
| `▣` | `image` | a picture those tools wrote, or a picture path in Bash output (a screenshot) or in a prompt you typed | Preview |
| `⎇` | `commit` | `[branch hash] subject` in the output of a Bash `git … commit` | nothing (the hash is shown) |

- A URL's label is the Bash call's `description`, else the first 60 characters of the
  command, else the tool name. `local` covers loopback, private ranges, Tailscale
  (100.64/10) and `*.local`; a tailnet host name counts as remote, its IP as local.
- A URL in Claude's reply is labelled with the rest of its line (`Preview: <url>` reads
  `reply: Preview`). A URL a tool already printed keeps its tool label. Only the main
  loop's replies count, not a subagent's. A prompt counts only when you typed it (or sent
  it through Remote Control), not a notification or a peer session's message.
- `Read`, `Grep`, `Glob`, `WebFetch`, `WebSearch`, context-mode's `ctx_search` /
  `ctx_fetch_and_index` / `ctx_index`, and any call the engine marks read-only (Bash
  `cat`, `rg`) add nothing: their output is content they read, not something this session
  made. A call that failed adds nothing.
- A URL or picture path that is in the call's own input (`curl <url>`, code a tool echoes
  back) is not kept: it is what the call was given, not what it made.
- A session with no list yet (the mod loaded mid-session, or a resumed session from
  before it) replays its transcript once at start, and `/assets clear` replays it again.
  The replay keeps what calls did (files written, Artifacts, commits) and URLs in Claude's
  replies. It does not keep what a call printed: the transcript does not say which calls
  were read-only, and a `cat` of a doc would add every link in it. Replayed entries show
  `earlier`, not an age.
- The band does not repeat the status line: no version (see `/assets` in the command
  list), and a commit shows its hash, not the branch.
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
| `/assets list` | every entry, grouped by kind (URLs, Artifacts, Images, Files, Commits), numbered as the band, with its full URL or path |
| `/assets clear` | start this session's list over from its transcript |
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
- The replay does not give back a dev server's URL that only a tool printed (see above);
  the live hook keeps it.
- A picture path with a space in it is not read from Bash output.
- Not checked: whether a local URL still answers, or whether a file still exists.

## Checks

```sh
MOD=mods/session-assets scripts/test-mod-permissions-smoke   # permission pin + plugin tests
scripts/test-mod-typecheck-smoke
MOD=mods/session-assets scripts/test-version-sync-smoke   # one version in manifest, marketplace, MOD_VERSION, CHANGELOG
claude plugin validate mods/session-assets
```
