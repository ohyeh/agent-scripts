# quick-say

Seven combos for 前情提要 → 規劃期 → 指揮 → 驗收 → 收工, with three modes.
Digits fill the full combo into the prompt box. Read or edit it, then press Enter to send.

## Modes

| Mode | Header button | At the end of a main-agent answer |
|---|---|---|
| 手動 | ○ 手動 | Send and suggest nothing. |
| 半自動 | ◐ 半自動 | Check the git gate, then the closing “shall I?” gate; otherwise suggest one of the seven combos, or nothing. Tab takes a suggestion; Enter sends it. |
| 自動 | ⚡ 自動 | Run the same gates first; otherwise send 續跑 or 驗收, or stop. |

The button cycles 手動 → 半自動 → 自動 → 手動.
Use `/quick-say mode 手動|半自動|自動` or `manual|semi|auto` to set the mode.
Use `/quick-say mode` to read it. The choice uses store key `quick-say.mode`.
A new session keeps 手動; every other stored value starts 半自動. Auto never carries over.
The old `quick-say.auto` key is ignored.

The git gate checks files this session edited but did not commit, and its commits absent from
the upstream. The “shall I?” gate reminds the agent to act within scope, or ask once and stop.
Each gate fires once per state. Gates and auto sends share a cap of four consecutive mod prompts.
A composer or bridge prompt from the owner resets the count and clears the stop reason.

Auto stops if the last non-✈ line ends in `？` or `?`, if four mod prompts were sent,
or if the small model picks `none`. Its stop reasons are `agent 在問問題`,
`連續送滿 4 句`, and `猜不到下一句`. While 自動 is stopped, its gates also pause until the owner types.
半自動 keeps the gates active. An owner prompt or mode change clears the stop reason.
The model chooses only 續跑, 驗收 (combo 9), or none. 續跑 uses the mod's short continuation
text, not a digit combo. Every mod-sent prompt uses plugin origin, never `asUser`, and ends
with `APPROVES_NOTHING`: it grants no new approval.

## Combos

| Key | Name | Purpose |
|---|---|---|
| 4 | 更深的問題 | Find the deeper question behind repeated discussion. |
| 5 | 前情提要 | Read the handoff and sources, explain the timeline and checkpoint, then wait for confirmation. |
| 6 | 規劃期 | Show a state model first; add code signatures for cross-module or interface work; write the plan after agreement. |
| 7 | 指揮 | Direct workers through implementation, review and acceptance. |
| 8 | 指揮＋loop | Run the agreed work to its recorded end conditions. Reuses the full text of 7. |
| 9 | 驗收 | Check model transitions and tasks against real product evidence; reviewers take objective issues, then a scope／direction card for the owner. |
| 0 | 收工 | Check delivery, write the handoff and memory submission, and record the next checkpoint. |

`/quick-say` shows or hides the band and lists all full texts.
The owner's exact texts and the model's `when` hints live in `PHRASES` in `hooks/register.ts`.

## Band and log

```
▌quick say v0.5.1 · 7 combos · 半自動 [ ◐ 半自動 ][ ▸ open ][ hide ]
```

The band starts folded. Open/fold and hide choices persist across sessions.
Use `/quick-say` to show it after hide. Narrow headers use ○, ◐ or ⚡, plus fold and hide
icons. Labels use display cells and cut with …; short row budgets remove combo rows first.
A stopped auto header adds `· 停：<原因>` without dim text.

Each shown combo, sent prompt, gate and stop appends one JSON row to
`~/.local/state/quick-say/<YYYY-MM-DD>-<sid8>.log`.
Rows contain `at` (ISO), `mode`, `event` (shown/sent/stopped/gate), `combo`, and `reason`.
A log write error goes to the debug log and does not hold the prompt.

## Changes from 0.4.0

- Replace the auto on/off button with the three-mode button.
- Remove `/quick-say auto`; use `/quick-say mode` instead.
- Replace 5 接手, 6 審過再做, 7 離席照做, 8 進度續跑, and 9 做完推送 with the new combos.
- Keep 0 收工 and append the checkpoint sentence. Add key 4; remove no digit hotkey.
- Keep fold, open, hide and the bare `/quick-say` command.

## Limits

- Key 4 can be taken by the workers band with four or more workers; the band drawn later wins.
- Auto acts only at turn completion. It cannot act while the agent runs mid-turn.
- Slash-prefixed combos: whether Enter treats the filled text as a slash command is
  **UNCONFIRMED**, pending a real engine check.
- The git gate tracks Edit, Write and NotebookEdit, not edits through Bash scripts.
- Commit paths use `git -C <dir>`, a leading `cd <dir> &&`, or the session folder.
  Quoted paths and `pushd` can be missed. A branch without an upstream has no unpushed check.
- Each main-agent answer can use one small-model call in semi-auto or auto mode.
- Digit buttons need an empty prompt and a band that fits `maxRows`. To type a prompt that
  starts with 4–9 or 0 while the band is open, put a space first.

## Install

```
/plugin install quick-say@agent-scripts
```
