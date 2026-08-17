# 盤點：本機（含指揮者復核）

| Store | Path | 7d .jsonl（復核值） |
|---|---|---|
| Codex sessions | ~/.codex/sessions（年/月/日層級） | 105 |
| Codex archived | ~/.codex/archived_sessions（平面目錄） | 367 |
| Claude projects | ~/.claude/projects/<proj>/<session>.jsonl | 172 |
| Codex rollout summaries | ~/.codex/memories/rollout_summaries | 數百（輔助來源） |
| agy = Google Antigravity CLI | ~/.gemini/antigravity-cli/（conversations/ 每對話一個 SQLite .db） | 633 files(7d) |

- ⚠ 修正（2026-08-01，使用者質疑後指揮者親查）：原盤點「agy 無 store」錯誤——worker 只找 ~/.agy、~/.config/agy；實際在 ~/.gemini/antigravity-cli/。教訓：CLI 的 store 要從 binary strings/--help 反查，不能只猜 dotdir 名。

- ⚠ Haiku 盤點 worker 回報 claude=1、codex sessions=1，指揮者以 `find -mtime -7` 復核為 172/105 —— 計數錯誤，retro 素材（Haiku 不可靠案例 again）。
- archived 的 mtime 是「封存時間」，實際活動期需看檔內 timestamp 過濾 >= 2026-07-25。
- Codex jsonl 首行 payload 含 session_id/cwd/originator/model_provider/forked_from_id。
