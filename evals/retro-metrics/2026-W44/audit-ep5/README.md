# Episode 5：逐主張離線研究

一次重播：30 cases；PASS 14、FAIL 14、UNKNOWN 2（6.7%）；planted errors 抓到 14/14；與標註不同 0。
這是整理過的案例集結果，不是正式流量正確率，也不是上線許可。

## 資料與重現

- `cases.json`：固定案例、預先標註、原生 call ID、解碼後輸出及來源 manifest。
- `build-cases.py`：唯讀取本機保存的 bundle，以 stdout 印出相同案例集；沒有 mod audit 程式。
- `judge-prompt.txt`：判定問題只問當前 claim；沒有把整個 session 的舊要求重新當成待辦。
- `results.json`：一次模型重播的完整 30 筆判定、理由、來源及計數。

執行 `python3 evals/retro-metrics/2026-W44/audit-ep5/build-cases.py` 可重建 stdout。
本次已比對解析後 JSON：`case set reproducible True`。

完整存量列冊：ed52bad5 17、f86fd372 5、94e952f7 4，共 26 份 evidence bundle。
其中 13 份提供案例來源；不是宣稱每個原始 reply 的所有主張都已 audit。
797196d8 本機 state 為 0；另搜尋本機 42 個近期 run 目錄的 JSON／JSONL，也沒有存檔命中。
本次沒有存取遠端。第四個指定 session 的 corpus 尚待提供本機副本。

案例分布：純文字 8、檔案主張 16、跨回合 4、證據不足 2。
前 28 筆含 14 個原始證據支持的主張及 14 個只改主張、不改證據的錯誤變體。
跨回合案例保留前後兩份來源，以證明當前的內容延續主張。
不因較早 pointer task 的任務檔缺席，就把當前已有檔案輸出的主張改成 UNKNOWN。

## 重播邊界

CLI：`claude -p --tools '' --disable-slash-commands --no-session-persistence --output-format json --json-schema … --system-prompt …`。
stdin 只含 cases 的 id、kind、task、claim、evidence、source；移除 expected、label_reason、planted。
模型沒有工具；來源資料內的指令只當資料。既有登入供本機 CLI 使用，沒有修改 settings 或安裝 plugin。
這裡的「離線」是對已存 bundle 做評估；推論使用既有 CLI 模型服務，沒有查詢 live 工作 session。

實際模型由回傳 metadata 確認為 `claude-sonnet-4-6[1m]`；未指定模型，也未假稱使用 5.5。
它是本次研究的受測模型，不是發佈 reviewer。沒有用其輸出降低 review、批准 push 或啟用 audit。
CLI exit 0，duration_ms 51095。原始回傳留在 `.workflow/20261030-sol-ep5/judge-raw.json`；
本次 runner 留在同目錄 `judge-replay.py`。stdout 為結構化結果，不依靠寬鬆 JSON 修復。

UNKNOWN 的兩筆不是錯誤漏抓：一筆只有 owner ledger 檢查，沒有 dashboard／cmp 證據；
另一筆沒有可支持 NOVA 歷史回覆的工具結果。兩者不應當 PASS，也不能僅因缺證就當 FAIL。

## 尚不能據此上線

1. 第四份 corpus 缺席，不能把三個 session 的結果說成四個 session 的完整驗證。
2. Claims 由作者事先整理；模型沒有自己從雜亂 reply 抽主張。整體抽取召回率未測。
3. 成對、平衡且容易對照的變體不是獨立 holdout，也沒有打散同源案例。
4. 不含 timeout、空回覆、格式錯誤、模型捏造引用、取消及真實長對話成本的獨立測量。
5. 6.7% 是這 30 筆的量測比例，不是校準機率，也不能與舊全 session judge 的歷史比例作因果比較。

建議先補齊本機第四份 corpus，再凍結一組未用於調 prompt 的自然 reply holdout。
分開量 claim extraction、證據取得、判定與主線修正效果；不要把 UNKNOWN 改名成 PASS。
本輪不加線上 audit、gate、hook、排程或第三個 mod。
