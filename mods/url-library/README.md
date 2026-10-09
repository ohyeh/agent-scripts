# url-library

A Claude Code function-hook mod. During a session tools print URLs: a dev server's
`http://localhost:5173/`, a deploy preview, a share link. After a while you cannot tell
which is which. This mod keeps each one in a library, labelled with what produced it.

- After each tool call, the mod reads the result text and keeps up to 5 URLs from it.
  It skips `Read`, `Grep`, `Glob`, `WebFetch`, `WebSearch` and `NotebookEdit`: their
  output is file or page content, not something the session made.
- The label is the Bash call's `description` (else the first 60 characters of the
  command), or the tool name for other tools. The project is the session cwd's basename.
- `local` covers loopback, private ranges, Tailscale (100.64/10, `*.ts.net`) and `*.local`.
  Everything else is `remote`.
- A URL seen again moves to the top with its newest label. The store keeps 300 entries
  across sessions.
- `/urls` opens the pane, grouped Today / This week / Older. Click a link to open it.

## Requirements

- `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`; without it the plugin does not load.

## Install

```sh
claude plugin marketplace add ohyeh/agent-scripts
claude plugin install url-library@agent-scripts
```

During development: `claude --plugin-dir mods/url-library`.

## Limits

- No thumbnails. `Image` draws only in kitty or Ghostty, not in Warp or tmux.
- Only tool output is read. A URL that appears only in Claude's reply text is not kept.

## Checks

```sh
claude plugin validate mods/url-library
claude plugin test mods/url-library
npx -y -p typescript@5.6.3 tsc -p mods
```
