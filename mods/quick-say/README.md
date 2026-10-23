# quick-say

A Claude Code function-hook mod: canned prompts in a band above the prompt. In an empty prompt,
press a digit and the phrase goes to the agent as your own words (`asUser`), once the running
turn ends.

```
▌quick say v0.1.0 · 5 phrases                    [ ▾ fold ][ hide ]
  5: 開場  6: 繼續  7: 進度？  8: 照做  9: 收工
```

| Key | Label | Replaces what was typed | Sends |
|---|---|---|---|
| 5 | 開場 | `update title` | Update the session title per `~/.agents/rules/session-titles.md`; with no task yet, set only the status and marker and wait. |
| 6 | 繼續 | `繼續啊`, `繼續推進`, `持續推進 別偷懶` | Do the next step of the plan without asking inside the approved scope; stop only at acceptance or a decision only the user can make, and name it. |
| 7 | 進度？ | `順利？`, `都好了？`, `所以現在？` | Report: what the user must do first, then done (with verification output run this session), left, blocked; unverified items marked `UNCONFIRMED`. |
| 8 | 照做 | `處理啊`, `可以` | Go ahead with the plan in the last reply, its scope only; ask again only beyond it. |
| 9 | 收工 | `/session-handoff and /recap and 給一些犯錯回饋、開發建議 投稿 /shared-memory-intake` | Handoff (session-handoff skill), a recap, then mistakes and suggestions, sub-agents and tmux workers included, submitted with the shared-memory-intake skill. |

The phrases come from the owner's session logs (2026-10-23): the most repeated opener, closer
and mid-session prompts, rewritten so each is one explicit instruction. Edit `PHRASES` in
`hooks/register.ts` to change them.

They are the person's words, sent by the person's keypress, so unlike other mods' prompts
(`../README.md`, Mod prompts) they do approve what they say: `8 照做` is a go-ahead.

## Band

Follows the band rules in [`../README.md`](../README.md): folded to its header until you press
`[ ▸ open ]` (kept for the next sessions); `[ hide ]` takes it away until `/quick-say`, which
also lists every phrase in full. Narrow: `[ ▾ ][ ✕ ]` and labels cut with `…`.

## Limits

- A bare digit presses a band Button only in an empty prompt, and only while the band's tree
  fits `maxRows`: when the band scrolls, the phrase row is left out instead.
- Digits start at 5 because the tmux-agent workers band numbers its rows from 1. With five or
  more workers listed, the two bands share a digit and the band drawn later takes it.
- The phrase does not pass through the slash-command parser: the wrap-up names its skills in
  words, and the agent loads them.

## Install

```
/plugin install quick-say@agent-scripts
```
