# session-assets

A Claude Code function-hook mod. A session makes things: a dev server on
`http://localhost:5173/`, a published Artifact, the files it wrote, a screenshot, a
commit. After a while neither you nor Claude can say which URL is which, whether that
server still answers, or where the screenshot went. This mod keeps a numbered list of
them per session, and puts it where both of you can use it:

| Who | Does | What happens |
|---|---|---|
| You | write `#a1` in a prompt: `#a1 掛了，修一下` | Claude gets row 1 beside your prompt: its exact URL or path, what made it, and its state now (`up: vite (pid 4242) in ./web`, `down: nothing listens on :5173`, `exists`, `missing`). No copying URLs, no guessing which server you meant. |
| Claude | calls its `assets` tool: "the preview URL from before", "is :5173 still up", "which session runs :3000" | It gets the rows that match, with the same live state, from this session or from all of them. This is how it gets an exact port, path or hash back after the context was compacted. |
| You | glance at the band, or run `/assets list`, `/assets open N` | You see what was made, by what, and when; open one in the browser or its app. |

The live state is what answers "who is who" for local URLs: the process listening on
the port, and the folder it runs in. It is checked on demand (a `#aN`, the tool,
`/assets list`), never while drawing. Remote URLs are not checked: a request from a hook
to an arbitrary host is a side effect nobody asked for.

Built the way `grok-bot-watch` and the `tmux-agent` workers panel are built: one band,
per-session state, slash commands that work in every terminal, and a tool for the model.

## Band

Above the prompt, only after this session has an asset. Other sessions' assets are
folded into one line.

```
▌session assets 2 url · 1 artifact · 1 image · 1 video · 2 file · 1 commit · #aN in a prompt · /assets list   [ hide ]
   a1 ● localhost:5173          2m ago · Start dev server
        http://localhost:5173/  /assets open 1
   a2 ◆ x.dev/docs              5m ago · reply: Docs
   a3 ▣ IMG 2026-10-08 at 20.40.56.png  6m ago · ~/Desktop
   a4 ◈ Retro W41               10m ago · claude.ai
   a5 ▶ demo.mp4                12m ago · ./web
  +3 more — /assets N
  ▸ other sessions: 3 · 12 assets
```

| Glyph | Kind | Comes from | `/assets open N` |
|---|---|---|---|
| `●` green / `◆` cyan | `url`, local / remote | an http(s) URL in a tool's output or in Claude's reply (`reply: …`) | the browser |
| `◈` | `artifact` | an `Artifact` publish; label = its title, else the file name | the browser |
| `▤` | `file` | `Write`, `Edit`, `MultiEdit`, `NotebookEdit` | its default app |
| `▣` | `image` | a picture those tools wrote, or a picture path in Bash output (a screenshot) or in a prompt you typed | Preview |
| `▶` | `video` | the same, for `mp4 mov m4v webm mkv` | its default app (`/assets preview N`: Quick Look) |
| `◇` | `source` | a page `WebFetch` or `ctx_fetch_and_index` was given (label: its `prompt`), or a link in a prompt you typed (`you: …`): what the session consulted, apart from what it made. Counted in the header, listed by `/assets list`, no band row | the browser |
| `◆` | `url` (push) | a `git push` to GitHub: the compare view (`push: main a..b`), a new tag's release page, a new branch's tree | the browser |
| `⎇` | `commit` | `[branch hash] subject` in the output of a Bash `git … commit` | nothing (the hash is shown) |

- The band's rows are for what you look at or open: links, Artifacts, pictures, videos. Files,
  commits, pushes and sources are counted in its header and listed by `/assets list`; one of
  theirs shows as a row only while it is open (`/assets N`).
- A picture or video path with spaces counts when it is quoted (a file dragged into the prompt)
  or its spaces are escaped (`demo\ run.mov`).
- A row names the thing: a URL by its host and path, a file by its name, a commit by its subject.
  What made it (the call, the reply line) follows, dim. Pushes that follow on from each other on one
  branch (`a..b`, then `b..c`) are one row, the compare view `a..c`.
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
  made. A call that failed adds nothing. Neither does a Bash command whose programs all only read
  (`cat`, `sed`, `rg`, `jq`, `tmux capture-pane`, `git log`/`show`/`diff`, with `cd`, `echo`,
  `sleep` around them): the engine does not mark all of these read-only.
  Nor does one that prints a file or a screen anywhere in it (`cat f`, `rg x f`, `git show`,
  `tmux capture-pane`): `git push && rg url docs.d.ts` keeps the push, not the doc's links.
  A heredoc's body (`python3 - <<'EOF' … EOF`) is text a program reads, not commands: it
  neither makes the call a reader nor hides or fakes a push.
- A local URL on an ephemeral port (49152 and up, a debugger or CDP endpoint) or to a
  file a page loads (`/assets/a.js`, `/data/x.json`) is not kept: 12,554 of 16k local
  URLs in past sessions' tool output were of that kind.
- A URL or picture path that is in the call's own input (`curl <url>`, code a tool echoes
  back) is not kept: it is what the call was given, not what it made.
- A session with no list yet (the mod loaded mid-session, or a resumed session from
  before it) replays its transcript once at start, and `/assets clear` replays it again.
  The replay keeps what calls did (files written, Artifacts, commits) and URLs in Claude's
  replies. It does not keep what a call printed: the transcript does not say which calls
  were read-only, and a `cat` of a doc would add every link in it. Replayed entries show
  `earlier`, not an age.
- The band does not repeat the status line: no version (see `/assets` in the command
  list), and an open commit row shows its hash, not the branch.
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
| `/assets N` (or `a N`, `#aN`) | open or close row N: the full URL as a link (cmd-click opens it), or the path or hash |
| `/assets open N` | open row N: `open <url or path>`, as an argv; only http(s) or an absolute path |
| `/assets copy N` | put row N's URL, path or hash on the clipboard |
| `/assets reply N` | put `#aN ` in the prompt, to write the rest around it |
| `/assets preview N` | a file, picture or video in Quick Look (`qlmanage -p`); a URL in the browser |
| `/assets list` | every entry, grouped by kind (URLs, Artifacts, Images, Videos, Files, Commits, Sources) and by `today` / `this week` / `older`, numbered `#aN` as the band, with its full URL or path and, for the first 10 local URLs and paths, its state now |
| `/assets clear` | start this session's list over from its transcript |
| `/assets all` | unfold or fold the other sessions' assets |

The `[ hide ]` and `▸ other sessions` buttons do the same, but in Warp `ctrl+x tab`
does not reach the band (see the tmux-agent README), so use the commands there.

## Pointing at a row: `#aN`

`#a3` anywhere in a prompt you typed (or sent through Remote Control) refers to row 3.
The prompt itself is not changed; the rows go to Claude beside it as a note it reads and
you do not see. `#123` (an issue number) and `x#a3` are not references. A number past the
end of the list is reported to Claude as `no such row`.

## Pasted hashes and session ids

Past sessions show the habit: a commit hash pasted to say "this one is verified, tag it",
often from another session, and a session id pasted to relay "that one is done". A
commit hash (7 to 40 hex, with a letter and a digit) that any session here committed
goes to Claude beside the prompt as `<hash> = commit "<subject>" on <branch>, made in
session <sid8> (<project>)`. A pasted session id goes with that session's 8 newest
assets. Unknown ones add nothing.

## The model's tool: `assets`

`mcp__session-assets__assets` with `query` (words that must all appear in the label,
URL or path, host or folder, or project), `kind`, `all_sessions` (default false) and
`check` (default true). It answers up to 30 rows, one per line:

```
#a2 url "Start dev server" http://localhost:5173/ · localhost:5173 · 3m ago · up: vite (pid 4242) in ./web
- url "Start api" http://localhost:3000/ · localhost:3000 · 1h ago · down: nothing listens on :3000 · session 3f2a91c0 (api)
```

Its own answers are not kept as assets.

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
- A picture or video path with a space in it is read only when quoted or escaped.
- A remote URL is never checked.
- The replay reads what `$.session.messages()` gives: at most the newest 4096 messages.
  It runs at session start when the list is empty, and `/reload-plugins` starts the session again
  only when the plugin's version changed; to replay at any time, use `/assets clear`.

## Checks

```sh
MOD=mods/session-assets scripts/test-mod-permissions-smoke   # permission pin + plugin tests
scripts/test-mod-typecheck-smoke
MOD=mods/session-assets scripts/test-version-sync-smoke   # one version in manifest, marketplace, MOD_VERSION, CHANGELOG
claude plugin validate mods/session-assets
```
