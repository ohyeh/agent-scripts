# Findings：agy = Google Antigravity CLI（補件，2026-08-01）

修正案：原盤點「agy unused」錯誤（找 ~/.agy；實際 store 為 ~/.gemini/antigravity-cli/，兩機皆存在）。使用者質疑觸發，指揮者親查 binary strings 定位。

## Volume
- 本機：窗內 conversation db 36（總 172）；history.jsonl 窗內 154 行、unique conversationId 9（下界，多數訊息不帶 cid）。日分佈峰值 07-26:34、07-31:74。workspace：paul-photo-gallery 9、healthgo-mobile 1。
- 遠端：目錄存在、85 db，窗內 mtime 命中僅 1、history 窗內 5 行（1 conv, healthgo-mobile）。遠端低用量合理；mtime 判讀差異原因 UNCONFIRMED。
- 跨 CLI：claude 175 / codex 137 / agy ~36——最小但非零。

## 用途
多輪 packet-based 開發/審查工作流（P3/P5/Round N gate 制），集中 paul-photo-gallery；一筆 healthgo-mobile「用我瀏覽器」。

## Friction
- 07-30 RECOVERY→FINAL→TERMINAL RECOVERY 三連：worker-owned background test process 卡死，實際卡關。
- 07-26 GLM P3 review BLOCK 迴圈 8 筆（正常審查回饋，非崩潰）。
- 07-31 一筆使用者糾正（HealthGo Design System 排序）。
- 「abandon」命中為 prompt 用詞誤中，無真棄置證據。

## Caveats
conversation .db 為 protobuf blob 未逐筆解析；語意分析僅基於 history.jsonl。

## 教訓（進 retro 系統性觀察）
盤點 CLI store 不能猜 dotdir 名，要從 binary strings / --help / 實際執行反查；zero-result duty 這次形式上做了（證明搜尋模式有效）但搜錯了候選集——「找得到已知正例」不等於「候選路徑完備」。
