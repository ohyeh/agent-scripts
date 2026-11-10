# byo-provider (Claude Code mod)

Answers the loops you choose (the main loop, one subagent, or new subagents) with a model on
your own provider: any Anthropic-format gateway (Messages API). All other loops stay on Claude.

Built and tested on Claude Code 2.1.319.

## How it works

- A `turn.step` hook checks the loop. If the loop is on your provider, the hook does not call `next(e)`.
  It POSTs the step to `<gate url>/v1/messages` with `curl` (8.3 or later, through `$.process.run`) and yields the answer as the
  step's chunks. If the loop is not on your provider, it calls `next(e)` and Claude answers as usual.
- The mod never writes env (`claude plugin validate`: `env writes: nothing`). It never reads or
  sends the Claude OAuth credential. The gate request carries only `authorization: Bearer <gate token>`.
- Request body: `{ model, max_tokens: 16384 + thinking budget, stream: false, system, messages, tools }`.
  - `system`: the sections of `$.prompt.compose()`. A subagent gets one more paragraph that tells
    it to end with a full report.
  - `messages`: `$.session.messages({ as: 'api' })` for that loop. Thinking blocks are removed.
    `tool_reference` blocks become text `Tool loaded: <name>`.
  - `tools`: the same set the real API request gets for that loop:
    `$.tool.list()`, minus the tools the engine announced as deferred (the "deferred tools are now
    available via ToolSearch" reminder in the loop's messages; a subagent also uses the main loop's
    reminder), plus the deferred tools the loop already loaded (`tool_reference`) or called
    (`tool_use`), plus `ToolSearch`. A subagent also gets `SubagentHandback` and does not get
    `ScheduleWakeup` or `Workflow` (main-loop-only tools). Schemas come from `hooks/schemas.ts`.
- Answer: `text` and `tool_use` blocks become chunks. Thinking from the gate is dropped.
- Every failure is a visible step: `[byo-provider: <reason>]` with `end_turn`. The mod never falls back
  to Claude. Reasons include HTTP errors, a bad body, a refused connection, a timeout
  (`no answer in N s`) and an interrupt (`interrupted`, when you press Escape).
  The gate URL and token appear only in redacted form (`abcdef…(len N)`).
- In stream-json, a gate step has a `msg_hook_<uuid>` id. A real API step has a `msg_011…` id.

## Commands

A band above the prompt (`▌byo-provider v<version>`), from the session's start, says whether routing
works: `agents=default · ✓ routing ok · 13 → default · 400 steps ok`, or `✗ <n> failed (<who>: <why>)`
in red when a gate step failed or a tier route fell back to Claude, and a `default.conf` link to the file
that holds the tier lines. It starts folded (one line); `▸ open` adds the last 3 failures. `hide` or `/provider-switch band` hides and shows it; both
are remembered. It takes only the rows the other mods' bands leave.

Agents a Workflow script starts are routed like other subagents. The engine does not let a hook read
their conversation, so the mod keeps its own: the task, each gateway answer and each tool result. What
the engine itself adds to their requests (reminders, context) is not in it.

| Command | Effect |
| --- | --- |
| `/provider-switch status` | Shows which loops use your provider, the new-subagent mode, the tier map, `cli_types`, the profiles folder and its profile names, and each engine agent with its status (a finished named agent stays `idle`); a CLI teammate that got a shutdown request shows `(ended)`. |
| `/provider-switch use [profile]` | The main loop uses that profile (default: `default`) from its next step. |
| `/provider-switch off [agentId]` | That loop (default `main`) goes back to Claude from its next step. |
| `/provider-switch agent <agentId> [profile]` | A running subagent uses your provider from its next step. The id must be in `$.agent.list()`. |
| `/provider-switch agents follow\|claude\|<profile>` | New subagents follow their parent loop onto your provider (`follow`, default), always use Claude (`claude`), or always use `<profile>` while this loop stays where it is. A session starts in the mode `agents=` names in `default.conf` (else `follow`); `haiku=` / `sonnet=` / `opus=` lines there route a new subagent by its model tier first (see `default.conf.example`). |

The main loop can run the same commands through the tool `mcp__byo-provider__switch` (`{ args }`, the
text after `/provider-switch`), as tmux-agent's `reload` tool runs `/reload-plugins`: the owner can say
"new subagents on default" without typing. A subagent's call is denied. The tool exists only while the
main loop is on Claude: a gated main loop gets only built-in tools (limit 2: `hooks/schemas.ts` has no schema for it), so it switches with `/provider-switch`.

## CLI profiles

CLI routing is opt-in. The profiles folder is the plugin option `options.path`
(default `~/.config/byo-provider/profiles`); `/provider-switch status` prints the folder in use,
the tier map and `cli_types`. In that folder, create `coding.conf`:

```conf
cli=sol
timeout=180
```

`cli=sol` reads `~/.config/agent-tmux/profiles/sol.conf` and runs its `bin`,
`headless_flags` and optional `headless_prompt_flag` once. Python 3 parses the flags
with `shlex` and starts the CLI without a shell. The task asks the CLI to write a
schema-v1 report; only a valid `status=success` report answers the step. The task also names
an answer file, `<state>/byo-<turn>-<step>.answer.md`: the CLI writes the full output there and
keeps the report summary to one paragraph. A successful step returns that file's text ahead of
the report, so output the parent needs verbatim (code, lists, raw text) is not cut to the summary.

For an interactive worker, use `cli=tmux/agy-flash`. Load the tmux-agent mod too.
The hook calls `mcp__tmux-agent__assign`, then `mcp__tmux-agent__await`; the worker
appears in `/workers` while it runs and can be peeked. Its `result.json` is the
answer. A teammate keeps the same worker; later messages use `tell` and await its
new episode. Shutdown requests and aborted turns stop that worker; a headless teammate is
closed the same way. A teammate round runs only the messages that arrived since its last round:
a round with no new message fails (`no new message for this CLI teammate`) instead of
running round 1 again. Ordinary subagents stop their worker after reading the report.
The worker starts in the agent's folder: a CLI that asks whether to trust that folder (grok
does) stops at that question, and the step waits until its timeout. Trust the project folder in
that CLI once.
After an interrupt, the engine refuses new tool and process calls. A Python
cleanup guard is armed through `$.process.spawn` when the worker starts. Closing
that existing stream, or unloading the session, runs the installed
`agent-tmux <profile> stop <worker>` outside the cancelled turn. `cli-guard` logs
the cleanup result path; its JSON records the exit code. Normal stops use the
mod tool and disarm the guard.
The guard requires Unix process APIs. It passes the mod's ledger as
`TMUX_AGENT_DIR` only to the cleanup child, matching tmux-agent; the session's
environment stays unchanged.

In `default.conf`, choose the route and exact allowed types:

```conf
agents=coding
cli_types=general-purpose,workflow,fork
```

Tier routes (`haiku=`, `sonnet=`, `opus=`) can also name `coding`. A tier line wins over
`agents=` and over `/provider-switch agents <profile>`. A subagent spawned without a `model`
takes its parent's model, so its parent's tier applies (from an Opus main loop, `opus=`).
Cost: on one host a tmux CLI teammate took 134–238 s for a trivial task and a headless CLI
about 30 s. Use a headless profile for one-shot work and `tmux/` only when the conversation
must persist across rounds. A CLI route
applies only to listed agent types. Workflow agents need `workflow`, and forks
need `fork`, even if another type is listed. Unlisted types ignore a CLI tier
override and keep the non-CLI `agents=` route; if that mode also selects a CLI
profile, they stay on Claude. Existing HTTP profiles are unchanged.
The main loop cannot use a CLI profile. Profiles with `cli=` need no `url`,
`token` or `model`. Each step logs `route: cli:sol` or `route: cli:tmux/agy-flash`.

Permission caveat: the CLI profile's flags are used as written, including yolo
or permission bypass flags. A child CLI has its own tools and permission policy;
the parent agent's tool restrictions do not sandbox it. Put only owner-approved
types in `cli_types`. The mod never changes environment variables or the owner's
profile files. CLI tasks receive their task text and any custom agent definition,
not the gateway's full API transcript. Headless rounds start a fresh CLI; only
tmux teammates preserve CLI conversation state. CLI results are delivered as one
non-streaming `end_turn` step. Timeout remains 1..590 seconds (default 120);
failed, blocked, needs-input, invalid or absent reports fail the step. Reports
remain at their logged paths for inspection. Worker bindings are mirrored in
`$.store` under `byo-provider.cli-bindings.<sessionId>`, with the owner's session
id, PID and process start time from `~/.claude/sessions/<pid>.json`. Each session
updates its own key and serializes its own writes, so sessions do not overwrite
each other's binding arrays. On reload or resume of the same session, live agent
ids are restored (`cli-rebind`); its other agents are stopped (`cli-orphan-stop`).
A foreign owner's workers stay untouched while its registry matches and `ps`
confirms the PID and process start time (`cli-binding-foreign-live`). They are
stopped only when that owner is gone; an inconclusive registry/process read
keeps them and logs `cli-binding-foreign-unknown`. Cleanup removes only the dead
owner's entry from its key. Only a positive stop receipt releases a binding
and its guard; a failed stop retains both and logs `cli-stop-fail` (startup also
logs `cli-orphan-stop-fail`). Before assign, a detached guard tracks the unique
worker name prefix and owner, so cancellation before receipt handling still
finds the worker. It waits for the detached launch to reach its start lock
before stopping it. Idle guards watch the owner session, so reload preserves
workers and process exit cleans them up. Session end hands all stops to one
detached process in parallel, outside the engine's shared 1.5-second deadline;
`cli-session-cleanup-handoff` logs its timing and cleanup report path. Bindings
stay stored until a confirmed stop or a later startup sweep. Headless CLI exits
also terminate the CLI's process group, including background tool processes.

## Gateway setup

1. Gateway: one file per profile, `<profiles>/<name>.conf`, `key=value` lines, `#` comments.
   The mod reads it at each gateway request, so an edit applies at the next step. The token stays in
   this file (keep it `chmod 600`); it never enters settings, the pane, the log or an error text.

   Start from [`default.conf.example`](default.conf.example): every key the mod reads, with its values.

   `default.conf` is the profile `use` and `agent` take when no name is typed.
   The one plugin option (`userConfig`), kept in your settings:
   Set it with `claude plugin configure byo-provider@<marketplace>` (or `/config`):
   - `path`: the profiles folder (default `~/.config/byo-provider/profiles`).
2. Env override of the claude process (tests): `GATE_TIMEOUT_MS`, in ms, ahead of the profile's `timeout` (seconds).
3. Load it: install from the marketplace, or `claude --plugin-dir <this folder>`.
4. Run gated work in `--permission-mode default` or `acceptEdits`, not `auto` (see Limits).

Test switches (env, read at `session.start`, for `claude -p` where you cannot type commands):

| Env | Same as |
| --- | --- |
| `GATE_TEST_MAIN=<profile>` | `/provider-switch use <profile>` |
| `GATE_TEST_AGENTS=<profile>` | every new subagent and fork uses `<profile>`, whatever main uses |
| `GATE_TEST_AGENTS_MODE=follow\|claude` | `/provider-switch agents follow\|claude` |
| `GATE_TEST_STEPS=<K>` | a gated loop goes back to Claude from step index K (`/provider-switch off`) |
| `GATE_LOG=<path>` | routing log, JSONL; never a URL or token value |

## Verified (Claude Code 2.1.319; run logs kept outside this repo)

- Load and validate: PASS, `env writes: nothing`.
- Main loop and subagents on the gate, your real provider: tool execution, parallel subagents,
  switch back to Claude mid-loop, reversed case (main on gate, subagents on Claude): PASS.
- Tool list: main 12 tools and subagent 11 tools, the same as the real API request without its
  two non-callable entries (`DeferredToolPlaceholder`, the server tool `advisor`).
- Timeout and interrupt: visible `[byo-provider: …]` failure, no Claude fallback. A 15 s gate answer
  passes under the default timeout (the 10 s hook budget does not stop the wait).
- All commands typed in a real interactive session (tmux): PASS.

## Limits

1. Auto mode: the auto-mode classifier refuses non-read-only tool calls that a gate model makes
   (seen with `Agent`). Use `default` or `acceptEdits` mode. A `tool.check` bypass is an owner
   decision and is not built.
2. MCP and plugin tools are not offered to the gate: there is no schema source at run time.
   Built-in schemas come from `hooks/schemas.ts` and go stale on a Claude Code update.
3. The deferred set is parsed from the engine's reminder text (2.1.319 wording). The main-loop-only
   set (`ScheduleWakeup`, `Workflow`) is a measured constant.
4. Non-streaming: text shows only when the full answer arrives. The request goes through `curl`
   (8.3 or later: `--variable` puts the token in a header from the child's env, the body goes on
   stdin), because `$.http.fetch` gives up after 30 s and an `effort=max` step on a long loop took
   115 s. `timeout` caps it at 590 s (`$.process.run` allows ten minutes). On an interrupt the step ends
   at once; curl keeps running until `--max-time` and its late answer is ignored.
5. Privacy: a gated loop sends its full conversation (first message with all context blocks, about
   100 kB here) and the system prompt to your provider. A gated fork sends the parent's context.
6. Spawn marking happens after `agent.spawn`'s `next(e)` resolves. Every test saw the mark before
   the subagent's step 0, but the docs do not promise this order.
7. A gated subagent of a custom type answers with its definition file's prompt (plus one paragraph),
   and its frontmatter `tools:` narrows and `disallowedTools:` removes tools: `<plugin>:<name>` is read from the plugin's
   install folder (`~/.claude/plugins/installed_plugins.json`), `<name>` from `.claude/agents/` then
   `~/.claude/agents/`. The engine's own types (`general-purpose`, `Explore`, `Plan`) and types a plugin
   registers in code have no file: they get the main system prompt plus that paragraph and every tool.
   The definition's `model:` is ignored (the profile picks the model). A fork keeps the main prompt.
8. `SubagentHandback`'s schema (`{ message }`) comes from the engine's nudge text, not from a type.
9. `max_tokens` is 16384 for the answer plus the effort's thinking budget (31744 at `max`). An answer with only thinking in it fails the step with its `stop_reason`, it never ends the loop silently.

## Files

- `hooks/register.tsx`: hooks `session.start`, `command.run{provider-switch}`, `ui.render{AbovePrompt}`, `agent.spawn`, `turn.step`.
- `types/index.d.ts`: the pane's `$.state` contract.
- `default.conf.example`: the profile keys; update it with every new key.
- `hooks/map.ts`: pure helpers (`toStep`, `failStep`, `forGate`, `loadedTools`, `deferredTools`,
  `deadline`, `redact`, `reportStep`, `withAnswer`).
- `hooks/schemas.ts`: generated built-in tool input schemas.
- `scripts/gen-schemas.py`: the generator.

Regenerate the schemas after a Claude Code update (the types file is written by the
plugin-authoring skill when it loads, or laid at `.claude-plugin/types/claude-code-tools/index.d.ts`
once the engine loads the mod):

```
python3 scripts/gen-schemas.py <plugin-authoring skill>/types/claude-code.d.ts hooks/schemas.ts
```

## Tests

```
claude plugin test mods/byo-provider      # unit: response mapping, tool sets, deadline
claude plugin validate mods/byo-provider
python3 mods/byo-provider/tests/cli_check.py <scratch-directory>  # runner flags, abort, timeout; run outside the sandbox
```

The live tests (a loopback fake Anthropic server that logs request shapes, never secrets, and runs
against the real gateway) were run with `claude -p` and one tmux session; their harness reads the
gateway from your settings and stays outside this repo.
