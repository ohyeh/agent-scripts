# Retro Inbox — 常設，隨時追加，retro 時倒空

用法：兩節都是一行一筆、格式自由。下次 retro §6.5 先倒空本檔逐條處理
（成案 → backlog / lessons；棄案 → 標記後刪），處理完清空重來。

> 上輪（2026-08-07 議題裁決輪）已於 2026-08-08 倒空：全部條目經
> `open-questions.md` A–F 逐條裁決（結果表在該檔頂部），成案項落
> `next-week-backlog.md`（含 Layer 2 重跑新增 N1–N3）與 lessons.md，
> 未研究三題（E-1/E-3/E-5 部分）排下輪，E-5 短 session 群已就地結案。

## 待討論議題（臨時動議與訴求）

（空）

## 本週隨手記（發生了什麼，給下次 retro 的 §2–4 當線索）

格式：`日期 | 事件一行 | 好/壞/中性`。

- 2026-08-08 | 使用者連三次糾正 retro 執行姿態：別鑽文件、解決問題本質、以完整完成為目標不搞最小交差——W32 裁決的執行一度又滑回文書工作 | 壞→修正
- 2026-08-08 | `.gitignore` 第 1 行殘留 lessons.md local-only 忽略規則，policy 改了機器層沒改，首次 commit 靜默漏檔——機器閘門命題的活例 | 壞→好
- 2026-08-08 環境層（已修，留週期觀察）：本機 Claude Code 背景 Bash task 約 10 分鐘被 exit 144 回收、tmux server 陪葬。對策已落地：`assign --detach`（tmux-agent-tools 276ec29，smoke PASS），model-dispatch §4＋SKILL.md 已載明本機用 detach＋bounded harvest。下輪 retro 驗：本機派發零 lost-liveness。
