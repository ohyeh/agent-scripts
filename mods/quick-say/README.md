# quick-say

A Claude Code function-hook mod that does what the owner used to ask for again and again. The
owner's session logs (2026-10-23, Claude Code and Codex, mined by sol and agy) show runs of 2-4
prompts in a row on one thing: "順利？" → "繼續處理啊" (52 sessions), "advisor review 過了？" →
"意見一次說完" → "有共識才執行" (30), "PLAN 都做好了？" → "都有 PUSH？" → "先 PUSH 啊" (19),
"都搞定？" → the `/session-handoff` wrap-up (10).

The mod works on three levels:

| Level | When | What happens |
|---|---|---|
| Gate: git | The main agent's turn ends and files this session edited are not committed, or its commits are not on the upstream | One reminder to the agent: commit what this session changed; push only where its rules allow, else say on the last line what is unpushed and why. |
| Gate: "shall I?" | The answer ends on a request for leave (`要我…嗎？`, `shall I …?`) | One reminder: if it is inside the approved scope, do it; if the user must decide, ask once with what was searched, and stop. |
| Suggestion | No gate fired | The small fast model picks the combo the owner would most likely send next; its full text shows dim in the empty prompt. Tab takes it, Enter sends it. |
| Band | Any time | Digits 6-9 in an empty prompt fill a combo's whole text into the box. Nothing is sent until you press Enter. |

Gate reminders are framed as the mod's ("The quick-say plugin sent a message"), never as your
words, and each ends with a sentence that it approves nothing. Each gate fires once per state
(the same dirty files and unpushed commits, the same question), and the mod sends at most 2 in a
row until you type a prompt yourself, so a gate cannot loop.

## Combos

| Key | Label | Replaces |
|---|---|---|
| 6 | 審過再做 | review first by sol + advisor, one round of all objections, act on consensus |
| 7 | 進度續跑 | report progress, then go on without waiting for 繼續 |
| 8 | 做完推送 | check the plan item by item, tests and pre-push check, commit, push, deploy, report shas |
| 9 | 收工 | confirm done and pushed, then handoff, recap, and a shared-memory submission |

`/quick-say` lists each combo's full text. Edit `PHRASES` in `hooks/register.ts` to change them;
`when` is what the suggestion's model reads to pick one.

## Band

```
▌quick say v0.3.1 · 4 combos · auto · 1 nudge     [ ⚡ auto ][ ▾ fold ][ hide ]
  6: 審過再做  7: 進度續跑  8: 做完推送  9: 收工
```

Follows the band rules in [`../README.md`](../README.md): folded to its header until you press
`[ ▸ open ]` (kept for the next sessions); `[ hide ]` takes it away until `/quick-say`. `[ ⚡ auto ]`
turns the gates and the suggestion on or off (kept; also `/quick-say auto`); the header counts
this session's reminders. Narrow: `[ ⚡ ][ ▾ ][ ✕ ]` and labels cut with `…`.

## Limits

- Edits made through Bash (`sed`, `perl`, a script) are not tracked: the git gate sees only
  files changed with Edit, Write or NotebookEdit, and commits made with a Bash `git commit`.
- The folder of a commit is read from `git -C <dir>` or a leading `cd <dir> &&`, else the
  session's folder. A commit made elsewhere (a quoted path, `pushd`) is missed.
- A branch with no upstream has nothing unpushed by this check.
- The suggestion costs one small-model call per main-agent answer while auto is on.
- A digit presses a band Button only in an empty prompt and while the band fits `maxRows`; while
  the band is open, a prompt that starts with 6-9 needs a space first. Digits start at 6 because
  the workers band numbers its rows from 1; with six or more workers, the band drawn later takes
  the digit.

## Install

```
/plugin install quick-say@agent-scripts
```
