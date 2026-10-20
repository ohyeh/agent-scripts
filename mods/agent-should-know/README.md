# agent-should-know

A Claude Code function-hook mod for the built-in **You should know** mod
(`cc-plugin-you-should-know@builtin`). During a long task, that mod's side agent
sometimes puts a card above the prompt:

```
✦ Heads up · The fare sums two one-way tickets; the round trip on the plan page is cheaper.
  1: Learn more   2: Knew this already   0: Dismiss
```

In a long task the card is more for the agent than for you. Without this mod
you press `1`, wait, press `2`, then Enter, so that the agent reads it. This mod
does that hand-off for you:

| When | What happens |
|---|---|
| An offer card shows | The card's line goes to the main agent as a prompt: "check it against the work; if it holds, correct the work, if not, say why in one line". A plugin's prompt waits until the running turn ends, so the agent is not interrupted. The card is hidden from the band. |
| That prompt's turn ends | The agent's answer (first 600 characters) is added under the card's row in the log. |
| The next morning | Read the log: one folder per repo, one file per session in it. |

Each session writes its own file only, `~/.local/state/agent-should-know/<repo>/<day>-<sid8>.log`,
so sessions never write into each other's file. Every row starts with its UTC ISO time
and the session's sid8, and a verdict names its card by the card's time:

```
# agent_automation · 28d2c553-6d91-4354-a50b-878fbaaa06af · /Users/me/github/agent_automation
2026-10-20T06:40:12Z · 28d2c553 · flagged · Heads up · The fare sums two one-way tickets.
2026-10-20T06:45:03Z · 28d2c553 · handled 06:40:12 · Fixed: the fare now uses the round-trip price …
```

One session, in order: `cat ~/.local/state/agent-should-know/agent_automation/2026-10-20-28d2c553.log`.
One repo, every session interleaved by time:

```
cat ~/.local/state/agent-should-know/agent_automation/*.log | grep -v '^#' | sort
```

The day in the file name is the UTC day of the session's first card.

## Install

```
/plugin install agent-should-know@agent-scripts
```

The built-in must be on: `/plugin enable cc-plugin-you-should-know@builtin`.

## Limits

- No API lets one plugin press another plugin's button, so the built-in's
  Learn more is not run. The main agent's answer takes its place.
- Hiding is visual. The built-in keeps the card as its view until two prompts
  that a person typed clear it (origin `composer` or `bridge`; this mod's relay
  does not count), and it runs no new check until then. So in a task that runs
  unattended overnight, the log holds the first card only. The built-in stalls
  the same way without this mod, on any card nobody answers.
- The mod reads the card from the band's tree by its two buttons (`Learn more`,
  `Knew this already`) and its tag (`Heads up ·` / `You should know ·`). A change to
  those in a Claude Code release stops the mod, silently.
- The line is cut at its first sentence end, so a two-sentence card sends one sentence.
- If the mod reloads between the send and the answer, the answer row is not logged.
- The answer row is the first main turn to end after the one the relay waited behind.
  A prompt you type while the relay waits can run first; its answer is then logged
  as the verdict. An unattended night has no such prompt.

The mod draws no band of its own, so the band rules in [`../README.md`](../README.md)
do not apply.
