# 盤點：遠端 100.64.190.44（macOS, ssh OK）

| Store | Path | 7d files | Size |
|---|---|---|---|
| Codex v0.146.0 | ~/.codex/sessions（年份子目錄, 1 session/jsonl） | 32 | 1.4G total |
| Claude projects | ~/.claude/projects | 333 | 535M |
| Claude sessions | ~/.claude/sessions | 1 | 8K |
| Claude transcripts | ~/.claude/transcripts | 0 | 54M |
| agy | 未使用（binary 在 ~/.local/bin/agy，無 config dir） | 0 | — |

- Codex 封存：內建 `codex archive/unarchive`，無獨立 archive dir。
- Codex jsonl 首行：`timestamp/type=session_meta/payload{session_id,cwd,cli_version,model_provider}`。
- 近期活動：codex 2026-07-27 起（healthgo-mobile）；claude projects 用到 07-31。
- 注意：claude「333 modified files」是 project 目錄內檔案數，非 session 數，分析時以 .jsonl session 檔為單位重算。
