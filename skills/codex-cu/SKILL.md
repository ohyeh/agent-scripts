---
name: codex-cu
description: Drive macOS apps and Chrome through the local Codex cua_repl MCP (server name codex-cu). Use this whenever the user says computer use, browser use, cua, codex-cu, or a task needs a browser page or a native app. Where it runs it is the default browser tool (the user's logged-in Chrome, background tab first), ahead of agent-browser. Not for the Cursor built-in browser harness, and not for hover or document.cookie (those go to Claude in Chrome or agent-browser).
allowed-tools: Bash(ps:*), Bash(pgrep:*), Bash(open:*), Bash(osascript:*)
---

# Codex computer use

`cua_repl` is the MCP server inside the ChatGPT Mac app's Computer Use plugin.
Claude Code, Cursor, and agy call it under the name `codex-cu`. Clicks go into
the target app. They do not move the user's pointer, but the computer surface
brings the target window to the front, so the user sees it take the screen. See
[Background first](#background-first-hard-rule).

The long write-up is the Claude artifact `codex-cu 接線手冊`. Open it in a browser
when this file does not answer a case.

https://claude.ai/artifact/VQQdp75aeC1PzqRwK581PU?sk=Usf3jftJdhrPrHUCB76Nuw

## Background first (hard rule)

The user keeps the screen. Take the first rung that works; go down only when it
fails, and say why.

1. Background, no window: a CLI, an API, or a read of the data.
2. Background tab: the browser surface (`createBrowserTab`, `getTab`), or an
   osascript tab in Google Chrome. These keep the front app as it was.
3. Foreground: the computer surface (`cua.getApp`, coordinate clicks) or
   `open -a`. Only when rungs 1–2 cannot do the step. Say so before you do it.

Tab mechanics (each checked 2026-10-16 with `lsappinfo front` before and after):

- Open: `osascript -e 'tell application "Google Chrome" to make new tab at end of tabs of window 1 with properties {URL:"<url>"}'`.
  Never `activate`. `open -a` and also `open -g -a` brought Chrome to the front
  (and the `open -g` tab did not appear).
- Close a tab this run opened with `createBrowserTab`: `await tab.close()`.
- Close any other tab: `osascript -e 'tell application "Google Chrome" to close (every tab of every window whose URL contains "<marker>")'`.
  `cua.getTab({url}) … close()` on a tab the run did not create hung until the
  timeout and reset the runtime.
- Close every tab you open. List the tab URLs before and after the run (the
  osascript `get URL` line in Quickstart step 1, wrapped in
  `if application "Google Chrome" is running then …` so the check never starts
  Chrome); a new URL in the after list
  is a leak: close it and report it. A report of "closed my tab" is not a check.
- Click with `tab.playwright.locator(sel).click()`, never `.click()` inside
  `evaluate`: it threw `el.click is not a function` (2026-10-19).
- After a click that changes data (delete, submit), check the result with rung 1,
  not the page: `getAXState` timed out on `DOMSnapshot.captureSnapshot` right
  after a delete.

## Quickstart (read first)

Setup not done (no check PASS on this Mac)? Do [Setup](#setup-once-per-machine) first.

1. First call: `await cua.getState()` and nothing else (no `{ emit: false }`: the
   browser list must print). Every Chromium browser with the ChatGPT extension
   (Arc, Brave, Edge, …) is listed as `name: "Chrome"`, and how many there are
   differs per Mac. Find the real Google Chrome by its open tabs:

       osascript -e 'tell application "Google Chrome" to get URL of every tab of every window'

   Pick the entry with the most URLs in common with that list. The lists need
   not be equal, and a URL that is open in two browsers does not decide. If
   nothing decides (Chrome has no tabs, or each URL is also open elsewhere), open
   a probe tab `https://example.com/#cu-<random>` with the osascript line in
   [Background first](#background-first-hard-rule), call `getState` again, pick
   the entry that shows it, then close that tab with osascript. The
   `osascript` call starts Google Chrome if it is not running, and its first run
   can ask for Automation permission (a headless worker cannot grant it). Do this
   on every run: ids and the number of browsers differ per Mac and can change
   within a day.
2. Never pass the name `"chrome"` to `createBrowserTab`, even though the tool
   description shows it: it can select another Chromium browser. Example: on one
   Mac it selected Arc, where `createBrowserTab` and `close` hung until the
   timeout and left `about:blank` tabs.
3. To read a web page, use the browser surface: `cua.getTab(tabId, { browser: id })`
   or `cua.createBrowserTab(id, url, { sessionName })` with the `id` from step 1
   (both verified 2026-10-16; Statsig `NetworkError` lines in the output are noise;
   the first call also returns the full API docs, with your result at the end), then
   `getAXState()`,
   `tab.playwright.frameLocator(...).locator(...).innerText({})`, or
   `nodeRepl.emitImage(await tab.screenshot({}))`. Never use `cua.getApp` or
   coordinate clicks for a web page: they drive the app window on the user's screen
   (seen 2026-10-16: an agent took the user's screen this way).
4. One step per call. Read each result before the next step. Use only the APIs that
   the returned documentation lists. Print with `nodeRepl.write`; the REPL cannot
   write files (`EPERM`).

## Setup (once per machine)

Codex does not need this: `cua_repl` is native there. For Claude Code, Cursor
and agy, run the check first:

    bash ~/.agents/skills/codex-cu/scripts/check-codex-cu.sh

PASS: setup is done. Skip this section. The check never opens an app, so a
PASS is not proof that an app call works. SKIP with `no Computer Use plugin`:
the user must install the ChatGPT Mac app and its Computer Use plugin, then use
computer use there once (that grants Screen Recording and Accessibility). A
FAIL `launcher cannot resolve a usable version` (the installer says SKIP `no
usable Computer Use version yet`): show the user the reason text after the colon.
Only a missing or empty plugin cache means "still downloading, try later". In both
cases stop and tell them. Any other FAIL, or no `codex-cu` tool: ASK the user
which mode. Never pick for them:

- `all`: accept every prompt from codex-cu with no question, including any
  that is not an app prompt. Logged-in pages in a browser app become readable.
- `safe`: auto-accept Calculator, TextEdit, Preview, Freeform. It is an
  auto-accept list, not a sandbox: Claude still asks the user for other apps and
  the user may accept them; agy and Cursor are refused for other apps. The
  browser surface has no per-app approval in either mode.

Then run:

    bash ~/.agents/skills/codex-cu/scripts/install-codex-cu.sh all   # or: safe

It installs into `~/.local/bin`, registers `codex-cu` at user scope for Claude
Code and Cursor when their config file exists and for agy when the `agy` command
exists (the check prints a line per registered runtime), writes `~/.config/codex-cu/approve`, and ends with the
check. If you cannot ask (print mode, worker), stop and show the user both
commands. After setup, tell the user to start a new session: MCP servers load
at session start. To switch mode later, run the installer with the other word,
or edit the policy file (it takes effect at the next prompt, no restart).

The installer skips the first gate on purpose. Terminal, system settings and
Codex itself stay `forbidden` until the user runs
`defaults write -g ComputerUseAllowForbiddenTargets -bool YES` themselves.

## Two surfaces

Computer surface treats the target as an app. Read the AX tree, then click or
type. This surface does not need turn metadata. `scripts/codex-cu-mcp` is the
launcher.

Browser surface enters the page. Read the DOM, run JS, use Playwright locators.
Each `tools/call` needs Codex turn metadata. `scripts/codex-cu-proxy` injects
`_meta["x-codex-turn-metadata"]`. Computer surface does not need the metadata,
but its app approvals also go through the proxy (see below).

`cua.getState()` can return a full `apps` list and a `browsers` error together.
A metadata error on `browsers` does not mean the computer surface failed.

## Pick the real Google Chrome

Every Chromium browser with the ChatGPT extension reports `name: "Chrome"`.
The numeric `id` and `metadata.extensionInstanceId` differ per Mac and the `id`
is not stable. `profileName` can be absent. Do not use any of them as a fixed
value: find the entry by its tabs ([Quickstart](#quickstart-read-first) step 1).

Never drive Arc: it is the owner's own browser. Before any browser call, run
`scripts/codex-cu-chrome-id`. It reads Google Chrome's tab URLs with AppleScript
(read only, no focus change) and picks the one entry that holds them all; only if
that does not decide, it opens a probe tab, then closes it and hands the screen
back. It prints the `extensionInstanceId`. The numeric `id` differs per cua
runtime (the same Chrome was `"1"` in one and `"2"` in another, 2026-10-21), so
name Chrome by that `extensionInstanceId` in the same call and resolve this
runtime's id from it (`getBrowser()` returns no `.id`):
`const cid = (await cua.getState({ emit: false })).browsers.find(x => x.metadata?.extensionInstanceId === "<printed>")?.id;`
then `cua.getTab(tabId, { browser: cid })` or `cua.createBrowserTab(cid, url, …)`.
Open pages with `createBrowserTab`, not osascript: an osascript `make new tab`
raised Chrome to the front on 2026-10-21. The Claude hook `codex-cu-chrome-gate.sh` denies a browser call that does
not, any literal id or `"chrome"`, a proof older than 30 minutes, and `getApp`
on Arc or another Chromium browser.

Before a long call you can also confirm which app hosts the extension:

```sh
ps -o ppid= -p $(pgrep -f "ChatGPT for Chrome")
```

The parent path must be Google Chrome. On an instance of another Chromium
browser (example: Arc), `createBrowserTab` and `nameSession` may never return;
a 120s wait still fails, and the call can leave `about:blank`.

## Browser surface

Use the Google Chrome instance from Quickstart step 1. Keep related browser steps in
one live `cua_repl` session. With `scripts/codex-cu-remote`, pass dependent JS
files in one invocation; a new invocation cannot rely on the previous tab's
browser tab ID alone.

For a user-supplied `@Browser` tab mention, pass its complete `plugin://` URL
to `cua.getTab({ mention: url })`. If the tab belongs to another browser
session, use a new Chrome tab in the current session instead of retrying the
same binding.

1. `cua.getBrowser({ extensionInstanceId })`.
2. `browser.nameSession` with a short name, before any new tab.
3. Record ids from `browser.user.openTabs()`.
4. Open one new tab and go to the URL.
5. Check the page. On example.com, `getByRole("link", { name: "Learn more", exact: true })` is visible.
6. Close only that tab.
7. Read `openTabs()` again. Prior ids match. The new id is gone.

A tab stays on the `session_id` that created it. A refused `createBrowserTab`
can still leave `about:blank`. Close it in that same session. Set `CU_SID` on
the proxy when you must reuse the session, and verify that it actually reattaches
before issuing page actions.

A new SPA tab can initially expose only `AXWebArea`. Wait for a specific page
element, then read `tab.playwright.domSnapshot()` and wait for data loading to
finish before interpreting counts. `domSnapshot()` belongs to `tab.playwright`,
not to `tab`.

`document.cookie` is not available. `chrome://` URLs are not allowed. There is
no hover method. Browser surface does not ask for per-app approval.

Rehearsal that passed 2026-10-05: select that Mac's Chrome, `nameSession` returns
at once, `URL=https://example.com/`, `learnMoreVisible=true`, the new tab is
closed, the prior tab ids are unchanged.

## Computer surface

On this surface a browser is an app, not a browser target. The steps use Arc as
the example app; use the display name of the app you target.

1. Open a URL with `open -a Arc "<url>"`. Command-T is less stable.
2. `cua.getApp("Arc")`. Use the display name. Do not use a bundle id.
3. After a page change, `getAXState({ disableDiffing: true })`. The first read can show the old page.
4. Click by element index. Use `setValue` when `typeText` changes case.

`cua.computer.launch_app` and `cua.listWindows` are not in this runtime.

`getApp` needs the second approval, `Allow Computer Use to use X?`. The proxy
answers it from `~/.config/codex-cu/approve`, for every client (Claude, agy,
Cursor):

- `all` on its own line: accept every prompt (full mode, the deploy default).
- One display name per line: accept only those apps (safe mode).
- `all` mixed with names means only those names.
- Any other app, or no policy file: the prompt goes to the client. agy and
  cursor-agent cannot answer, so the proxy declines it for them. With no file,
  every app is refused in agy and Cursor.
- A Claude `Elicitation` hook that accepts codex-cu prompts overrides `safe` for
  forwarded apps. Remove such a hook; the policy file is the single source.

`scripts/test-codex-cu-proxy` runs the proxy against a fake child (accept,
forward, child death, slow client, two-way backpressure, bad policy, shutdown).

Shutdown: once the proxy has seen the client close stdin, it drops (and logs)
an approval prompt instead of answering or forwarding it. A prompt already
forwarded can still meet the close. `elicitation accept` in the log means the
reply was queued to the child. After the child exits, the proxy waits while
output still reaches the client; after 30 s with no progress it ends non-zero
(output may be incomplete), at most 5 s later if stderr is blocked.

A refusal reads `Computer Use was not approved to use X`. Add the display name
to the file; the next prompt reads it, no restart. The Chrome display name is
`Google Chrome`.

## Remote Mac (SSH)

`scripts/codex-cu-remote` sends JS files to `cua_repl` in order, in one
runtime, through `codex-cu-proxy`. Set `CU_HOST` to drive another Mac.

    scripts/codex-cu-remote a.js b.js                  # this Mac
    CU_HOST=<ssh host> scripts/codex-cu-remote a.js    # another Mac

- The other Mac needs the setup above (check PASS there) and a logged-in GUI
  user. SSH must work with `BatchMode=yes`: a key, no password prompt.
- The other Mac's `~/.config/codex-cu/approve` decides app prompts. This
  client cannot answer a prompt, so the proxy declines what the policy does
  not accept.
- Variables persist from one file to the next in one run. Each run is a new
  runtime, so put dependent steps in the same run.
- Pick the browser on that Mac: run the parent check over SSH. Instance ids
  differ per Mac.
- `CU_SID` reuses a browser session (to close a leaked tab). `CU_TIMEOUT_MS`
  sets the per-call limit (default 90000). Exit 1 when a step fails.

## Do not

WARNING: `getApp` returns the window text. Do not bind Notes, Mail, Messages,
Keychain Access, a password manager, or a terminal unless the user names that
app in the current message.

- Do not treat a metadata error as a dead computer surface.
- Do not pick a browser by numeric id.
- Do not call `nameSession` or `createBrowserTab` on an instance that is not
  Google Chrome.
- Do not close tabs that were already open.

## Not tested

A Stop hook that sends `turn_ended`, many Chrome profiles, two Chromium browsers at
the same time, Freeform drag, AppleScript JS
inside a browser app, and `claude setup-token` over SSH. Computer surface through
`codex-cu-remote` (2026-10-13: the remote screen was locked,
`-10005: cgWindowNotFound`; browser surface passed on the same run).
