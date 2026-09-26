#!/usr/bin/env node
// Read-only Grok Bot sidebar read over CDP. One JSON line on stdout, always.
// Sends exactly one CDP method, Runtime.evaluate with the constant READ below;
// it never attaches, navigates, clicks or closes anything but its own socket.
// Exit 0 = state "ok"; exit 2 = a known degraded state; the JSON says which.
// Usage: sidebar.mjs [port=9231]

const PORT = Number(process.argv[2] ?? 9231)
const DEADLINE_MS = 2500
const RENDERER = /app\.asar\/dist\/renderer\/index\.html$/

const READ = `(() => [...document.querySelectorAll("button[data-agent-id]")].map(b => {
  const label = b.getAttribute("aria-label") || "";
  return {
    id: b.getAttribute("data-agent-id"),
    name: label.replace(/, Unread activity$/, ""),
    unread: label.endsWith(", Unread activity"),
    preview: b.getAttribute("aria-description") || "",
    busy: b.querySelector("[data-grok-state]")?.getAttribute("data-grok-state") ?? null,
    current: b.getAttribute("aria-current") === "page"
  };
}))()`

const done = (state, extra = {}) => {
  process.stdout.write(JSON.stringify({ state, ...extra }) + '\n')
  process.exit(state === 'ok' ? 0 : 2)
}

setTimeout(() => done('timeout', { ms: DEADLINE_MS }), DEADLINE_MS).unref()

let targets
try {
  targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
} catch (e) {
  done('port-down', { error: String(e.cause?.code ?? e.message) })
}
const pages = targets.filter(t => t.type === 'page')
if (pages.length === 0) done('renderer-missing')
const page = pages.find(t => RENDERER.test(t.url))
if (!page) done('wrong-url', { urls: pages.map(t => t.url.slice(-80)) })

const ws = new WebSocket(page.webSocketDebuggerUrl)
ws.onerror = e => done('port-down', { error: String(e.message ?? 'websocket error') })
ws.onopen = () => ws.send(JSON.stringify({
  id: 1, method: 'Runtime.evaluate', params: { expression: READ, returnByValue: true },
}))
ws.onmessage = m => {
  const msg = JSON.parse(m.data)
  if (msg.id !== 1) return
  ws.close()
  const err = msg.error?.message ?? msg.result?.exceptionDetails?.text
  if (err) done('eval-error', { error: err })
  const rows = msg.result.result.value
  done(rows.length ? 'ok' : 'selector-not-observed', { rows })
}
