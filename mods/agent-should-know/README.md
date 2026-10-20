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
| The next morning | Read `~/.local/state/agent-should-know/log.md`: each card, where and when it showed, and what the agent did about it. |

Log rows:

```
- 2026-10-20 06:40 · agent_automation · 28d2c553 · Heads up · The fare sums two one-way tickets.
  - handled: Fixed: the fare now uses the round-trip price …
```

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

The mod draws no band of its own, so the band rules in [`../README.md`](../README.md)
do not apply.
