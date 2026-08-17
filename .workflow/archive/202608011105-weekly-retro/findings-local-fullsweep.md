# Findings：本機全量補掃（2026-08-01）＋指揮者裁決

## ⚖ 數字裁決（兩 worker 衝突，指揮者親跑判定）
- 補掃 worker 稱窗內 474 unique session；指揮者以同口徑（首行 session_meta.timestamp ∈ [07-25, 08-02)）重跑全庫 1614 檔 → **138 unique**。**474 REFUTED；原 137（±1 視窗邊界）CONFIRMED。**
- 補掃 worker 的窗內過濾有 bug，但以下定性成果不依賴該數字，保留（涉及計數處標「口徑膨脹」）。

## 07-28 spike 全量分解（by 檔名日期，獨立口徑，可信）
- 當日 5 個 ppg repo 共 120 檔＝**83 root + 37 fork children**（原報告的 91 為手算漂移，修正為 83 root）。
- 分佈：root p50 duration 566s、p50 293 行、p50 2 user msgs；結局 119 normal / 1 abandoned。
- **判定：健康平行 fanout**——children 型態清楚（review 27%、fix-followup、branch-experiment、verification 分流），correction 關鍵字命中深讀後多為 AGENTS.md/skill 注入文字誤中，非真人糾錯循環。
- 5 個 deep-read：最大者 019fa8e5（49 user msgs/42663s）為「全程指揮模式」持續下令，非糾正。

## Fork 鏈（全量 28 條列出；原「12」與新「28」口徑皆未能對齊，計數方式 UNCONFIRMED）
- 大鏈：019f9db8（95 children：experiment 55/review 23/fix 17）、019fadfa（39）、019fa271（37）、019fb915（31, healthgo, agent_path 缺失）。
- 所有 child cwd 與 parent 一致，無跨 repo fork。型態靠 agent_path 關鍵字推斷。
- ⚠ 鏈數受窗內過濾 bug 影響，28 為口徑膨脹上界；鏈內容明細本身可信。

## Codex 工具統計（掃描母體含窗外，數字為膨脹上界，相對排序可信）
- function_call 7139：exec_command 2002、wait_agent 1782、ctx_batch_execute 513、send_message 378、spawn_agent 284…
- 關鍵洞見：**編排主要走 codex 原生 spawn/wait/send tool-call 通道**，shell 顯式 `./agent-tmux` 僅 27 次——own-tools 報告把「codex 側 agent-tmux 404 次」視為主通道的解讀需修正（該 404 含文字命中，原生通道才是大宗）。
- shell 首字排行：sed 363、git 288、rg 207、node 182。

## agy .db 逐筆（172/172 全掃，可信）
- schema：僅 trajectory_meta 非 blob；steps/gen_metadata 等全 protobuf blob。
- 窗內 36 db、4408 steps（全庫 22842）；11 個 WAL 鎖定檔用 immutable=1 全數讀通。
- blob 內 model 名稱字串抽取 0 命中——需 .proto 定義才能結構化解碼，UNCONFIRMED。
- 窗內最大對話：7e163ffe（22.4MB/1055 steps, 07-26）。

## 教訓
- 三個 retro 數字（91/12/137）中：137 經裁決站得住、91→83 手算漂移、12 的口徑無法重現。**retro 數字一律附產生指令**（原 acceptance 有此要求，91/12 兩處漏了）。
- 兩個 worker 用不同口徑各自宣稱「全量」——衝突時裁決者必須親跑同一口徑，不能挑一份信。
