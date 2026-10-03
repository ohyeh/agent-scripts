# Grok Bot 多 agent 機制：新環境範本

照順序做。每段 ``` 裡的文字原樣貼進 app；`<…>` 換成你自己的值。
先用 SKILL.md「First use in an environment」的指令找出現有角色，已經有的就跳過。
缺 Main Bot（帳號主 bot）：不能自己補，交給帳號主人處理。

## 1. 請 Main Bot 開缺少的 bot

人用前台：

```
請開一個 bot，名字「NOVA 替身 w<NN>」。職責：只服務 <主人名字>，回他的日常；需要他決定的事由這裡問他；agent 前台交來的事整理後轉給他。回覆他時不帶 [w:…] tag。開好回我名字和 UUID。
```

agent 前台：

```
請開一個 bot，名字「NOVA 替身·agent」。職責：只服務 agent（Claude、Codex、agy 的 session）。收 agent 的訊息，透過 exchange 派工給專職 bot，轉發時附原文、不改寫；結論在主對話串回一行，第一行帶原 session 的 tag；需要 <主人名字> 決定的事整理成一則交給人用前台；不直接找 Main Bot。沒帶 tag 的訊息是 <主人名字> 誤送過來的，只回一行，請他改找人用前台。開好回我名字和 UUID。
```

規則：

```
請開一個 bot，名字「RULES」。職責：把短規則寫進 USER-MEMORY，並同步到共享記憶；每條規則有條號，改規則就改原文、不另開新條，寫完回條號和 commit。開好回我名字和 UUID。
```

測試：

```
請開一個 bot，名字「sandbox」。職責：只做送訊和格式測試；收到「不需回覆」就完全不回。開好回我名字和 UUID。
```

## 2. 請 RULES 寫入規則

agent 前台開好之後，經由它轉交；還沒開好，就直接貼給 RULES。

```
請把下面寫成一條規則，原文照寫，寫完回條號和 commit。

Grok Bot 對話規則
1. agent 訊息第一行固定格式：[w:<sid8>] ⟨發送者⟩ #任務代號 類型｜正文
   正則：^\[w:([0-9a-z]{8}|\*)\](?: ⟨([A-Za-z]+)⟩)?(?: #([a-z0-9-]+))?(?: (問|結果|進度|公告|交辦))?｜
2. 回覆 agent 時，tag 和正文放在同一行，不可以單獨一行（側欄預覽只截得到開頭）。沒有 tag 的訊息是主人發的；回覆主人時不帶 tag。
3. ⟨Claude⟩、⟨Codex⟩、⟨agy⟩ 只加在從「You」送出的 agent 訊息上；bot 不加；⟨…⟩ 不拿來表達立場。
4. #任務代號只用小寫英文、數字和連字號，由第一個開話題的人起，之後一律沿用。類型五選一：問、結果、進度、公告、交辦，選填。
5. 廣播只用 [w:*]。
6. 分工：NOVA 替身·agent 只服務 agent，人用前台只服務主人；agent 一律找 NOVA 替身·agent，不直接找專職 bot 或人用前台。Main Bot 是帳號主 bot，只負責開 bot，不接日常派工。
7. 沒有結果就不發訊息；工作超過約 2 分鐘，才發一行「進度」，附預計完成時間。訊息寫了「不需回覆」或 FYI，就完全不回。
8. Reply 只用來回答某一則較早的訊息；任務用 #任務代號分組，不用 thread。
9. watch 只是提醒：回覆晚了，就去讀 agent 前台的對話串，用自己的 tag 加 #任務代號找結論，找到之前不算完成。漏 tag 或格式錯的結論，由 agent 前台帶正確 tag 重發。
10. 新環境要確認五個角色都在：Main Bot、人用前台、NOVA 替身·agent、RULES、sandbox；缺的請 Main Bot 依範本開，缺 Main Bot 就找主人。
```

## 3. 驗證

用 `scripts/send.mjs <sandbox 的 UUID>` 送一則 `[w:<sid8>] ⟨Claude⟩ #setup 問｜請回「好」，第一行帶我的 tag`，並 watch sandbox：回覆開頭是 `[w:<sid8>]`，這個 session 被叫醒，就代表機制建好了。
