---
name: gemini-web
description: Drive Gemini web (gemini.google.com) in the user's logged-in Google Chrome through codex-cu. Send a text, set the model and thinking level, and start Deep Research. Use when the user asks to give a text to Gemini, run Gemini Deep Research, or names a Gemini model (Neon, Hydrogen, Carbon) for a research or review run. Not for the Gemini API or the agy CLI.
allowed-tools: Bash(osascript:*)
metadata:
  version: "0.1.0"
---

# Gemini web through codex-cu

Read the `codex-cu` skill first. It owns browser selection, tab rules, and
failure classes. This skill adds only the Gemini page steps. Every step below
was checked on 2026-11-22 on `gemini.google.com/app` with a zh-TW UI. Quoted
labels are literal UI strings; the English after them is a gloss.

## Before you send

- Sending text to Gemini transmits it to Google. Do it only when the user's own
  message names the content and Gemini. Remove emails, names, and secrets.
- Write the prompt to the scratchpad first. Put one line on top that tells
  Gemini what to do (for example: an independent review that lists weak claims
  and facts to check). Deep Research needs a task, not only a document.

## Steps

1. Run `scripts/codex-cu-chrome-id` from the `codex-cu` skill. Resolve `cid`
   from the printed `extensionInstanceId`, then:
   `tab = await cua.createBrowserTab(cid, "https://gemini.google.com/app", { sessionName: "🔎 Gemini DR" })`.
2. Model: click `getByRole("button", { name: /Neon|Hydrogen|Carbon|自動/ })`.
   The menu rows are "自動" (auto), "全天候貼心協助" (4 Hydrogen),
   "深入分析" (4 Neon), and "程式編寫與複雜任務" (4 Carbon; it can be locked).
   Click the row the user named.
3. Thinking level: click `getByText("思考程度", { exact: true })` (thinking
   level), then the `menuitem` or `menuitemradio` whose name starts with
   "低" (low), "中等" (medium), or "高" (high). The default was low. Always set
   the level; never assume it.
4. Close the menu with `tab.pressKey(null, "Escape")` twice.
   `locator("body").press("Escape")` timed out.
5. Tool: click `getByRole("button", { name: "上傳與工具" })` (upload and
   tools), then `getByText("Deep Research", { exact: true })`.
6. Check the model, the level, and the tool in one AX read before you type:
   - `開啟模式挑選器，目前為「Neon 高」模式` (mode picker: Neon, high)
   - the button `取消選取「Deep Research」` (deselect Deep Research), which
     shows that the tool is on
   If one is wrong, fix it. Do not send.
7. Type: click `getByRole("textbox").first()`, then
   `tab.paste(null, text, { format: "text" })`. Read `innerText()` back and
   compare its length and last line with the source.
8. Send: click `getByRole("button", { name: /傳送|Send/ })`. The URL changes to
   `/app/<conversation-id>`. Record it.
9. Plan: Gemini shows "生成研究计划" (generating research plan, in Simplified
   Chinese). The page can stop updating here: the stop button goes away and no
   plan appears. Then call `tab.reload()` on the conversation URL; a reload
   does not resend. The plan
   card appears with "修改方案" (edit plan) and "开始研究" (start research,
   in Simplified Chinese).
10. Start: click `getByRole("button", { name: /开始研究|開始研究|Start research/ })`.
    The stop button comes back while the research runs.
11. Keep the tab with `await tab.markDeliverable()`. Report the conversation
    URL, the model, the level, and that the research is running.

## Waiting

- `locator.waitFor` failed after about 20 s whatever `timeout` you passed.
  Poll instead: loop `waitForTimeout(10000)` and `count()`.
- A `cua_repl` call longer than 120 s moves to the background and notifies
  when it finishes. Keep each poll under 110 s, or wait for the notification.

## Not tested

- Reading the finished report back (Deep Research takes several minutes).
- English UI labels other than the regex alternatives above.
- The mobile web layout (same menus, different placement).
