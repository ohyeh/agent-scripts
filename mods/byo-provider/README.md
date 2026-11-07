# byo-provider (Claude Code mod)

Answers the loops you choose (the main loop, one subagent, or new subagents) with a model on
your own provider: any Anthropic-format gateway (Messages API). All other loops stay on Claude.

Built and tested on Claude Code 2.1.319.

## How it works

- A `turn.step` hook checks the loop. If the loop is on your provider, the hook does not call `next(e)`.
  It POSTs the step to `<gate url>/v1/messages` with `$.http.fetch` and yields the answer as the
  step's chunks. If the loop is not on your provider, it calls `next(e)` and Claude answers as usual.
- The mod never writes env (`claude plugin validate`: `env writes: nothing`). It never reads or
  sends the Claude OAuth credential. The gate request carries only `authorization: Bearer <gate token>`.
- Request body: `{ model, max_tokens: 16384, stream: false, system, messages, tools }`.
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
  (`no answer in N s (GATE_TIMEOUT_MS)`) and an interrupt (`interrupted`, when you press Escape).
  The gate URL and token appear only in redacted form (`abcdef…(len N)`).
- In stream-json, a gate step has a `msg_hook_<uuid>` id. A real API step has a `msg_011…` id.

## Commands

| Command | Effect |
| --- | --- |
| `/provider-switch status` | Shows which loops use your provider, the new-subagent mode, the gate config (redacted), and running agents. |
| `/provider-switch use <model>` | The main loop uses your provider `<model>` from its next step. |
| `/provider-switch off [agentId]` | That loop (default `main`) goes back to Claude from its next step. |
| `/provider-switch agent <agentId> <model>` | A running subagent uses your provider from its next step. The id must be in `$.agent.list()`. |
| `/provider-switch agents follow\|claude` | New subagents follow their parent loop onto your provider (`follow`, default), or always use Claude (`claude`). |

## Setup

1. Gate target: plugin options (`userConfig`), kept in your settings, never in this repo.
   Set them once with `claude plugin configure byo-provider@<marketplace>` (or `/config`):
   - `ccSwitchProvider`: a provider row in `~/.cc-switch/cc-switch.db`; its `env.ANTHROPIC_BASE_URL`
     and `env.ANTHROPIC_AUTH_TOKEN` are the gate, read for each gated step. The query names only the
     provider; the token comes back on stdout, never in argv.
   - or `url` + `token` (the token is `sensitive`, kept in secure storage). These win over the provider.
   - `timeoutSeconds` (default 120), `agents` (`follow` default, or `claude`).
2. Env overrides of the claude process, ahead of the options (tests): `GATE_URL` + `GATE_TOKEN`,
   `GATE_TIMEOUT_MS`.
3. Load it: install from the marketplace, or `claude --plugin-dir <this folder>`.
4. Run gated work in `--permission-mode default` or `acceptEdits`, not `auto` (see Limits).

Test switches (env, read at `session.start`, for `claude -p` where you cannot type commands):

| Env | Same as |
| --- | --- |
| `GATE_TEST_MAIN=<model>` | `/provider-switch use <model>` |
| `GATE_TEST_AGENTS=<model>` | every new subagent and fork uses `<model>`, whatever main uses |
| `GATE_TEST_AGENTS_MODE=follow\|claude` | `/provider-switch agents follow\|claude` |
| `GATE_TEST_STEPS=<K>` | a gated loop goes back to Claude from step index K (`/provider-switch off`) |
| `GATE_LOG=<path>` | routing log, JSONL; never a URL or token value |

## Verified (Claude Code 2.1.319; run logs kept outside this repo)

- Load and validate: PASS, `env writes: nothing`.
- Main loop and subagents on the gate, real your provider: tool execution, parallel subagents,
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
3. The deferred set is parsed from the engine's reminder text (2.1.319 wording). A subagent's
   allowed tools for a custom agent type (its own `tools` list) are not known at run time; the
   main-loop-only set (`ScheduleWakeup`, `Workflow`) is a measured constant.
4. Non-streaming: text shows only when the full answer arrives. On a timeout or an interrupt the
   step ends, but the mod cannot cancel the HTTP request (`$.http.fetch` takes no signal); a late
   answer is ignored. Whether the host closes the connection on an interrupt is unconfirmed.
5. Privacy: a gated loop sends its full conversation (first message with all context blocks, about
   100 kB here) and the system prompt to your provider. A gated fork sends the parent's context.
6. Spawn marking happens after `agent.spawn`'s `next(e)` resolves. Every test saw the mark before
   the subagent's step 0, but the docs do not promise this order.
7. A gated subagent gets the main system prompt plus one paragraph, not its agent definition's prompt.
8. `SubagentHandback`'s schema (`{ message }`) comes from the engine's nudge text, not from a type.
9. `max_tokens` is fixed at 16384.

## Files

- `hooks/register.ts`: hooks `session.start`, `command.run{gate}`, `agent.spawn`, `turn.step`.
- `hooks/map.ts`: pure helpers (`toStep`, `failStep`, `forGate`, `loadedTools`, `deferredTools`,
  `deadline`, `redact`).
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
claude plugin test mods/your provider      # unit: response mapping, tool sets, deadline
claude plugin validate mods/your provider
```

The live tests (a loopback fake Anthropic server that logs request shapes, never secrets, and runs
against the real gateway) were run with `claude -p` and one tmux session; their harness reads the
gateway from your settings and stays outside this repo.
