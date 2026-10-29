# Episode 5：逐主張離線研究

Episode 1 重播：30 cases；PASS 14、FAIL 14、UNKNOWN 2（6.7%）；planted errors 抓到 14/14；與標註不同 0。
Episode 2 重播（四份 corpus）：50 cases；PASS 23、FAIL 23、UNKNOWN 4（8%，全是缺證控制組）；planted errors 抓到 23/23；與標註不同 0。
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
Episode 1 沒有存取遠端。Episode 2 已由 commander 提供第四個 session 的本機副本，見下節。

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

1. Episode 2 已補齊四份 corpus，但列冊與整理案例仍不等於所有自然 reply 主張都完成驗證。
2. Claims 由作者事先整理；模型沒有自己從雜亂 reply 抽主張。整體抽取召回率未測。
3. 成對、平衡且容易對照的變體不是獨立 holdout，也沒有打散同源案例。
4. 不含 timeout、空回覆、格式錯誤、模型捏造引用、取消及真實長對話成本的獨立測量。
5. 6.7% 是這 30 筆的量測比例，不是校準機率，也不能與舊全 session judge 的歷史比例作因果比較。

四份 corpus 現已補齊；接著應凍結一組未用於調 prompt 的自然 reply holdout。
分開量 claim extraction、證據取得、判定與主線修正效果；不要把 UNKNOWN 改名成 PASS。
本輪不加線上 audit、gate、hook、排程或第三個 mod。

## Episode 2：四 corpus

唯讀輸入位於 `remote-797196d8/`，沒有複製到 runtime state，也沒有修改該目錄。
`build-cases.py` 新增可重複的 `--extra-root`；重複同一 root 不會增加分母，衝突副本會直接報錯。

```sh
python3 evals/retro-metrics/2026-W44/audit-ep5/build-cases.py --extra-root evals/retro-metrics/2026-W44/audit-ep5/remote-797196d8
```

輸出固定在 `cases-episode2.json`，隔離重播結果在 `results-episode2.json`。
原 `cases.json`、`results.json` 保留，不覆寫 episode 1 的 30 案比較基準。
完整 inventory：ed52bad5 17、797196d8 10、f86fd372 5、94e952f7 4，共 36 份。
50 cases 的前 30 案與原版相同；新增 20 案涵蓋全部 10 份新 bundle。
新案含八組記錄值／觀察的正反主張、一組跨回合正反主張，以及兩個空 reply 的缺證控制。
兩個空 reply 的標註都是 UNKNOWN；其中一筆有部分工具輸出，另一筆沒有 calls。
跨回合案例附 native epoch 7／11，區分取得鎖與稍後仍在 login screen，沒有把鎖當登入證據。

重播結果：PASS 23、FAIL 23、UNKNOWN 4；planted 23/23；與標註不同 0；新增 20 案為 PASS 9、FAIL 9、UNKNOWN 2。
四筆 UNKNOWN 全是標註為缺證的控制組，所以 8% 是案例組成，不是模型的不確定率。

先前 draft 使用的跨回合順序不夠明確，該次推論結果排除。
最終案例改用 native epochs 後才重播；judge prompt 未改，沒有依模型答案調整標註。
新舊數字並列於 `opinions/mod-sol-final.md` A-5 與 `results-episode2.json` 的 previous 欄位。
本輪仍只做逐主張離線研究；不動 `mods/`，不重跑 commander 正在執行的產品驗收。
