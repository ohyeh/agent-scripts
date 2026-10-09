# session-recall

A Claude Code function-hook mod. A session makes things: a dev server on
`http://localhost:5173/`, a published Artifact, the files it wrote, a screenshot, a
commit. After a while neither you nor Claude can say which URL is which, whether that
server still answers, or where the screenshot went. This mod keeps a numbered list of
them per session, and puts it where both of you can use it:

| Who | Does | What happens |
|---|---|---|
| You | write `#a1` in a prompt: `#a1 掛了，修一下` | Claude gets row 1 beside your prompt: its exact URL or path, what made it, and its state now (`up: vite (pid 4242) in ./web`, `down: nothing listens on :5173`, `exists`, `missing`). No copying URLs, no guessing which server you meant. |
| Claude | calls its `assets` tool: "the preview URL from before", "is :5173 still up", "which session runs :3000" | It gets the rows that match, with the same live state, from this session or from all of them. This is how it gets an exact port, path or hash back after the context was compacted. |
| You | click a row in the band, or run `/recall list`, `/recall open N` | You see what was made, by what, and when; open, preview or copy one, or put `#aN` in the prompt. |
| You | open the TUI (`/recall tui`, `[ ⧉ ]`), mark lines of an answer, press enter | They go into the prompt as `> line` blocks, each with room under it for what you say about it. No copying lines out of the reply. |

The live state is what answers "who is who" for local URLs: the process listening on
the port, and the folder it runs in. It is checked on demand (a `#aN`, the tool,
`/recall list`), never while drawing. Remote URLs are not checked: a request from a hook
to an arbitrary host is a side effect nobody asked for.

Built the way `grok-bot-watch` and the `tmux-agent` workers panel are built: one band,
per-session state, slash commands that work in every terminal, and a tool for the model.

## Band

Above the prompt, only after this session has an asset. Other sessions' assets are
folded into one line.

```
▌session recall v<version> 2 url · 1 artifact · 1 image · 1 video · 2 file · 1 commit · #aN in a prompt · /recall list   [ ⧉ ][ hide ]
   a1 ● localhost:5173          2m ago · Start dev server
       [ open ][ copy ][ reply ]  http://localhost:5173/
   a2 ◆ x.dev/docs              5m ago · reply: Docs
   a3 ▣ IMG 2026-10-08 at 20.40.56.png  6m ago · ~/Desktop
   a4 ◈ Retro W41               10m ago · claude.ai
   a5 ▶ demo.mp4                12m ago · ./web
  +3 more — /recall N
  ▸ other sessions: 3 · 12 assets
```

| Glyph | Kind | Comes from | `/recall open N` |
|---|---|---|---|
| `●` green / `◆` cyan | `url`, local / remote | an http(s) URL in a tool's output, in Claude's reply (`reply: …`), or in a prompt you typed (`you: …`) | the browser |
| `◈` | `artifact` | an `Artifact` publish; label = its title, else the file name | the browser |
| `▤` | `file` | a document `Write`, `Edit`, `MultiEdit` or `NotebookEdit` made (`.md`, `.html`, `.pdf`, `.txt`, `.csv`, office files, notebooks); a source file gets no row | its default app |
| `▣` | `image` | a picture those tools wrote, or a picture path in Bash output (a screenshot) or in a prompt you typed | Preview |
| `▶` | `video` | the same, for `mp4 mov m4v webm mkv` | its default app (`/recall preview N`: Quick Look) |
| `◇` | `source` | a page `WebFetch` or `ctx_fetch_and_index` was given (label: its `prompt`): what Claude consulted, apart from what it made. Counted in the header, listed by `/recall list`, no band row | the browser |
| `◆` | `url` (push) | a `git push` to GitHub: the compare view (`push: main a..b`), a new tag's release page, a new branch's tree | the browser |
| `⎇` | `commit` | `[branch hash] subject` in the output of a Bash `git … commit` | nothing (the hash is shown) |

- A click on a row's name opens it: `[ open ] [ preview ] [ copy ] [ reply ]` and its full URL
  (cmd-click in most terminals) or path. A button does what `/recall <verb> N` does and says how
  it went in a toast. Preview is for a file, picture or video; a commit has copy and reply only.
  A second click closes the row.
- The band's rows are for what you look at or open: links, Artifacts, pictures, videos. Files,
  commits, pushes and sources are counted in its header and listed by `/recall list`; one of
  theirs shows as a row only while it is open (`/recall N`).
- A picture or video path with spaces counts when it is quoted (a file dragged into the prompt)
  or its spaces are escaped (`demo\ run.mov`).
- A row names the thing: a URL by its host and path, a file by its name, a commit by its subject.
  What made it (the call, the reply line) follows, dim. Pushes that follow on from each other on one
  branch (`a..b`, then `b..c`) are one row, the compare view `a..c`.
- A URL's label is the Bash call's `description`, else the first 60 characters of the
  command, else the tool name. `local` covers loopback, private ranges, Tailscale
  (100.64/10) and `*.local`; a tailnet host name counts as remote, its IP as local.
- A URL in Claude's reply is labelled with the rest of its line (`Preview: <url>` reads
  `reply: Preview`), a link you paste `you: …`. A URL already listed keeps its row and label. Only the main
  loop's replies count, not a subagent's. A prompt counts only when you typed it (or sent
  it through Remote Control), not a notification or a peer session's message.
- `Read`, `Grep`, `Glob`, `WebFetch`, `WebSearch`, every context-mode tool (`ctx_execute`
  and `ctx_batch_execute` too: their code analyses what is already there), an MCP tool named
  for a read (`get_…`, `list_…`, `search_…`, `read_…`, `query…`, `fetch_…`, `find_…`,
  `peek`), the codex-cu `js` REPL (it prints the screen and every open tab), and any call
  the engine marks read-only (Bash `cat`, `rg`) add nothing: their output is content they
  read, not something this session made. A call that failed adds nothing. Neither does a Bash command whose programs all only read
  (`cat`, `sed`, `rg`, `jq`, `tmux capture-pane`, `git log`/`show`/`diff`, with `cd`, `echo`,
  `sleep` around them): the engine does not mark all of these read-only.
  Nor does one that prints a file or a screen anywhere in it (`cat f`, `rg x f`, `git show`,
  `tmux capture-pane`): `git push && rg url docs.d.ts` keeps the push, not the doc's links.
  `ssh host '<cmd>'` and `timeout N <cmd>` are read as `<cmd>`.
  A heredoc's body (`python3 - <<'EOF' … EOF`) is text a program reads, not commands: it
  neither makes the call a reader nor hides or fakes a push.
- A local URL on an ephemeral port (49152 and up, a debugger or CDP endpoint) or to a
  file a page loads (`/assets/a.js`, `/data/x.json`) is not kept: 12,554 of 16k local
  URLs in past sessions' tool output were of that kind.
- A URL or picture path that is in the call's own input (`curl <url>`, code a tool echoes
  back) is not kept: it is what the call was given, not what it made.
- A session with no list yet (the mod loaded mid-session, or a resumed session from
  before it) replays its transcript once at start, and `/recall clear` replays it again.
  The replay keeps what calls did (files written, Artifacts, commits) and URLs in Claude's
  replies. It does not keep what a call printed: the transcript does not say which calls
  were read-only, and a `cat` of a doc would add every link in it. Replayed entries show
  `earlier`, not an age.
- The band's title shows the mod's version, so a reload can be seen to have taken. An open
  commit row shows its hash, not the branch: the status line has the branch.
- At most 5 assets per tool call. One seen again moves to the top with its newest
  label. Each session keeps 80.
- The band draws in what `maxRows` leaves after the plugins below it (the workers
  panel, grok-bot-watch), and shows `+N more` when it runs out of room. With one row
  left it shows the newest entry. It has no hotkeys: the workers panel owns digits and
  `r x q i a`, and grok-bot-watch owns `w f o u`.

## Commands

| Command | Does |
|---|---|
| `/recall` | hide or show the band (kept across reloads) |
| `/recall N` (or `a N`, `#aN`) | open or close row N: the full URL as a link (cmd-click opens it), or the path or hash |
| `/recall open N` | open row N: `open <url or path>`, as an argv; only http(s) or an absolute path |
| `/recall copy N` | put row N's URL, path or hash on the clipboard |
| `/recall reply N` | put `#aN ` in the prompt, to write the rest around it |
| `/recall preview N` | a file, picture or video in Quick Look (`qlmanage -p`); a URL in the browser |
| `/recall list` | every entry, grouped by kind (URLs, Artifacts, Images, Videos, Files, Commits, Sources) and by `today` / `this week` / `older`, numbered `#aN` as the band, with its full URL or path and, for the first 10 local URLs and paths, its state now |
| `/recall clear` | start this session's list over from its transcript |
| `/recall all` | unfold or fold the other sessions' assets |
| `/recall tui` | open the TUI (below) |

The `[ ⧉ ]`, `[ hide ]` and `▸ other sessions` buttons and a row's buttons do the same. In Warp a mouse
click reaches them (checked 2026-10-09), but `ctrl+x tab` does not (see the tmux-agent README):
there the keyboard way is the commands.

## TUI

`bin/tui.mjs`, full screen, in a pane of its own: the band has a few rows, the TUI has every row and the last answers.
`/recall tui` or the band's `[ ⧉ ]` opens it in a tmux split (full window height) when the session runs in tmux. In Warp
it writes the launch configuration (a feature Warp calls legacy, replaced by Tab Configs) `~/.warp/launch_configurations/session-recall.yaml` (named `session-recall TUI`, one
for all sessions, rewritten each time) and opens it with `warp://launch/`, a new Warp window running the TUI: Warp
splits no pane from a command. Elsewhere (iTerm), or when that fails, the command goes on the clipboard, to paste in a
new pane. Needs `node` (22 or later) on the PATH; it has no dependencies.

```
▌session recall v0.8.0 · agent-scripts    1 answers  2 assets
answer 1/16 · 12 lines · 2m ago · 2 marked   ← → older/newer
[x] **D1**: rename the band
[ ] keep `#aN`
[x] q4 | 寫死 timeout
────────────────────────────────────────────
q4 | 寫死 timeout
space mark · enter quote into the prompt · c copy · a all · esc unmark · tab assets · q quit
```

- Answers (`1`): the lines of the last 16 answers of the main loop (the newest and 15 before it), newest first (← → or
  `[ ]` for older and newer): list items without their marker, table rows as written (not the header), prose lines;
  not headings or code. Marks stay on the answer they were made in when a new one comes in; on the newest with nothing
  marked, the view follows the newest. Past sessions show
  why: 204 follow-ups pasted one line of an answer back with a short comment, 61 pasted several, each with its own,
  and 31% quoted an answer older than the last one. Space marks, `a` marks all, enter puts the marked lines (or the
  one under the cursor) in the prompt at the cursor as `> line` blocks with an empty line under each (every line of a
  quote gets its `>`); `c` copies them. The marks stay until the session says the quotes are in.
- Assets (`2`): every row, numbered as the band. Enter opens, `p` previews (Quick Look), `c` copies, `r` puts `#aN`
  in the prompt: the TUI sends the row's URL or path, and the mod numbers it as its list stands then.
- How it talks to the session: the mod writes `~/.local/state/session-recall/<sid>.json` (the list and the answers'
  lines) after each change, and the TUI redraws when it changes. A process outside Claude Code cannot type into its
  prompt box, and a paste of several lines folds into `[Pasted text]`, so the TUI writes a request and the mod puts
  its text in the prompt (it looks twice a second). Each request is a file of its own, `<sid>.ask/<time>-<pid>-<n>.json`,
  so no TUI writes over another's, and two TUIs on one session both send; they are done in the order made. The mod
  does each one once and answers it under the same name in `<sid>.done/`, `ok` or why not. Before it fills the prompt
  it puts down the mark of one taken there, so a reload in between never fills it again (the TUI then says to check
  the prompt), and an answer it could not write it writes at its next look. The TUI says done only on `ok`, removes the
  request, and then the answer (never the answer while the request stays). A refused one keeps its marks, to send
  again. The mod checks what it reads: 1 to 60 quotes of at most 4000
  characters, or a ref in the list; anything else is refused whole, never cut. A request older than 30 s (made while
  the session was not listening) is answered as not done. No answer in 5 s: the TUI says so, and keeps waiting.
- Without `--sid` the TUI shows the session whose snapshot (`<sid>.json`) changed last.
- `tests/tui-smoke.sh` runs the real TUI in a detached tmux pane: it draws, marks two lines, sends them, and the smoke
  answers as the mod would; then a row by its ref, refused; one taken and never answered; one it cannot remove; one it
  cannot write; then two TUIs on one session, two requests. It also checks that marks stay on their answer. `open`,
  `pbcopy` and `qlmanage` are stand-ins there.

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

`mcp__session-recall__recall` with `query` (words that must all appear in the label,
URL or path, host or folder, or project), `kind`, `all_sessions` (default false) and
`check` (default true). It answers up to 30 rows, one per line:

```
#a2 url "Start dev server" http://localhost:5173/ · localhost:5173 · 3m ago · up: vite (pid 4242) in ./web
- url "Start api" http://localhost:3000/ · localhost:3000 · 1h ago · down: nothing listens on :3000 · session 3f2a91c0 (api)
```

Its own answers are not kept as assets.

## Storage

The `$.store` key `session-recall.s.<session id>` holds one session's list, and
`session-recall.panel` holds whether the band is hidden. One key per session means two
sessions never overwrite each other's lists. A session whose newest asset is more
than 30 days old is deleted at the next session start.

## Requirements

- `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`; without it the plugin does not load.
- macOS for `/recall open` (it runs `open`).

## Install

```
/plugin install session-recall --marketplace ohyeh/agent-scripts
```

During development: `claude --plugin-dir mods/session-recall`.

## Limits

- No thumbnails. `Image` draws only in kitty or Ghostty, not in Warp or tmux.
- The replay does not give back a dev server's URL that only a tool printed (see above);
  the live hook keeps it.
- A picture or video path with a space in it is read only when quoted or escaped.
- A remote URL is never checked.
- After the TUI puts quotes in the prompt, the cursor is on the empty line under the last one: the engine moves it to
  the end of each fill, and no hook can place it (tried 2026-10-09: an insert then an append still ends at the end).
  Move up to comment on the others.
- The replay reads what `$.session.messages()` gives: at most the newest 4096 messages.
  It runs at session start when the list is empty, and `/reload-plugins` starts the session again
  only when the plugin's version changed; to replay at any time, use `/recall clear`.

## Checks

```sh
MOD=mods/session-recall scripts/test-mod-permissions-smoke   # permission pin + plugin tests
scripts/test-mod-typecheck-smoke
MOD=mods/session-recall scripts/test-version-sync-smoke   # one version in manifest, marketplace, MOD_VERSION, CHANGELOG
claude plugin validate mods/session-recall
mods/session-recall/tests/tui-smoke.sh   # the TUI in tmux
```
