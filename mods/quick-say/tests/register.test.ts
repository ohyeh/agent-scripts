import { expect, test } from 'claude-code/testing'

import { PHRASES } from '../hooks/register.ts'
import { cells } from '../hooks/lib/band.ts'

const PLUGIN = 'quick-say'
const start = { cwd: '/work/agent-scripts', surface: 'terminal' as const, isInteractive: true }
const cmd = { command: 'quick-say', args: '', origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 120 } }

const band = (bodyColumns = 120, maxRows = 20) => ({
  surface: 'terminal' as const,
  component: 'AbovePrompt' as const,
  requestId: 'above',
  props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns, scroll: { offset: 0, bodyRows: maxRows - 1 }, view: {} },
})

function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  const el = node as { type?: string; props?: Record<string, unknown>; children?: unknown }
  const p = el.props ?? {}
  const label = el.type === 'Button' ? (p.plain ? `${String(p.hotkey)}: ${String(p.label)}` : `[ ${String(p.label)} ]`) : ''
  return `${label}${textOf(el.children)}${el.type === 'Box' && p.flexDirection === 'column' ? '\n' : ''}`
}

type On = Parameters<Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>>[1]

// The engine beneath the mod: a store, and the prompts it submits.
function world(on: On, store = new Map<string, unknown>()) {
  const sent: { text: string; origin: unknown }[] = []
  const filled: string[] = []
  const files = new Map<string, string>()
  on('prompt.fill', (_, e) => (filled.push(e.text), { isFilled: true, text: e.text, cursor: e.text.length }))
  on('prompt.submit', (_, e) => (sent.push({ text: e.text, origin: e.origin }), { text: e.text }))
  on('session.id', () => ({ value: '12345678-session' }))
  on('env.get', () => ({ value: '/h/me' }))
  on('fs.exists', (_, e) => ({ value: files.has(e.path) }))
  on('fs.read', (_, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', (_, e) => (files.set(e.path, e.text), { value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // Another plugin's row changes on every draw, with no space at the joint.
  let draws = 0
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: `workers v0.46.14 · tmux ${++draws}` }))
  return { sent, filled, store, files }
}

test('the band starts folded, opens, and a combo button fills its whole text into the prompt, unsent', async ($, on) => {
  const w = world(on)
  await $.session.start(start)

  const folded = textOf(await $.ui.render(band()))
  expect(folded).toContain('▌quick say v0.5.0 · 7 combos · 半自動 [ ◐ 半自動 ][ ▸ open ][ hide ]')
  expect(folded).not.toContain('0: 收工')

  await $.ui.press({ plugin: PLUGIN, key: 'fold', requestId: 'above' })
  expect(w.store.get('quick-say.fold')).toBe('open')
  const open = textOf(await $.ui.render(band()))
  expect(open).toContain('[ ▾ fold ]')
  expect(open).toContain('4: 更深的問題  5: 前情提要  6: 規劃期  7: 指揮  8: 指揮＋loop  9: 驗收  0: 收工')

  await $.ui.press({ plugin: PLUGIN, key: 'say-0', requestId: 'above' })
  expect(w.filled).toEqual([PHRASES[6].text])
  expect(w.sent.length).toBe(0)

  // The open choice is kept for the next session; folding again is kept too.
  await $.session.start(start)
  expect(textOf(await $.ui.render(band()))).toContain('0: 收工')
  await $.ui.press({ plugin: PLUGIN, key: 'fold', requestId: 'above' })
  expect(w.store.get('quick-say.fold')).toBe('folded')
  await $.session.start(start)
  expect(textOf(await $.ui.render(band()))).toContain('[ ▸ open ]')
})

test('narrow: icons only, labels cut, never wrapped; no room: the phrase row goes, then the header', async ($, on) => {
  world(on, new Map([['quick-say.fold', 'open']]))
  await $.session.start(start)

  const narrow = textOf(await $.ui.render(band(40)))
  expect(narrow).toContain('▌quick say v0.5.0')
  expect(narrow).toContain('[ ◐ ][ ▾ ][ ✕ ]')
  // Seven labels use two rows; each label fits its share.
  expect(narrow).toContain('4: 更深…  5: 前情…  6: 規劃…  7: 指揮')
  expect(narrow).toContain('8: 指揮…  9: 驗收  0: 收工')
  // Room for one phrase row only: one row, labels cut.
  expect(textOf(await $.ui.render(band(40, 3)))).toContain('4: ')

  // maxRows 2 leaves one row under the workers row: the header alone; 1 leaves none.
  const tight = textOf(await $.ui.render(band(120, 2)))
  expect(tight).toContain('workers v0.46.14')
  expect(tight).toContain('▌quick say')
  expect(tight).not.toContain('6: 規劃期')
  expect(textOf(await $.ui.render(band(120, 1)))).not.toContain('quick say')
})

test('hide takes the band away across sessions until /quick-say shows it again', async ($, on) => {
  const w = world(on, new Map([['quick-say.fold', 'open']]))
  await $.session.start(start)

  await $.ui.render(band())
  await $.ui.press({ plugin: PLUGIN, key: 'hide', requestId: 'above' })
  expect(w.store.get('quick-say.hidden')).toBe('hidden')
  expect(textOf(await $.ui.render(band()))).not.toContain('quick say')
  await $.session.start(start)
  expect(textOf(await $.ui.render(band()))).not.toContain('quick say')

  const shown = await $.command.run(cmd)
  expect(shown.text).toContain('band shown')
  expect(shown.text).toContain(`0 收工: ${PHRASES[6].text}`)
  expect(w.store.get('quick-say.hidden')).toBe('shown')
  expect(textOf(await $.ui.render(band()))).toContain('▌quick say v0.5.0')

  expect((await $.command.run(cmd)).text).toContain('band hidden; /quick-say shows it again.')
})

test('all seven owner combos keep their exact keys and texts and only fill the box', async ($, on) => {
  const w = world(on, new Map([['quick-say.fold', 'open']]))
  await $.session.start(start)
  const expected = [
    '在最近反复讨论的问题背后，有没有一个更深的问题，是一直在绕着它走，却没有真正问出来的？',
    '/session-handoff resume 前情提要：照 RESUME 流程讀完交接、相關 session、html 報告與 commits，然後像看劇的前情提要一樣講給我聽。\n1. 之前做了什麼、發生了什麼，照時間順序，包括卡住和被我糾正的地方。\n2. 你讀了哪些來源：session id、html／artifact 連結、commit SHA，每個用一句話說它講了什麼。\n3. 現在停在哪，分兩種情況：上一段工作已經收完、沒有未完成的，就直接說，然後等我給新目標，照規劃期的做法先畫圖確認共識，再寫 PLAN；如果是大任務拆成小任務、上次停在某個檢核點收尾，就列出大任務、每個小任務的狀態（已驗證完成／未完成），上次停在哪個檢核點、當時驗證的結果，以及下一個小任務。\n4. 你沒讀到或不確定的地方。\n挑幾個繼承來的關鍵說法，在真實產物上驗一次；已驗證且沒變的不重做。講完先停，等我確認你讀懂了再開工。',
    '規劃期：先不要寫 PLAN。先把你理解的系統畫成狀態圖（狀態、轉移、不變條件，用 system model 表示），再依 using-decision-tree 的 design 分支選 motion、diagram 或 canvas 呈現，加上範圍、取捨和還不確定的地方，給我確認我們有共識；會跨模組、動到介面的程式任務，另外附一份程式骨架（型別、簽名、未實作的函式）。我確認以後，才在本任務的 .workflow run dir 寫 plan.md 和 task 清單：每個 task 對應 model 的轉移 ID，並附驗收和驗證方式。',
    '全程指揮模式：所有實作與審查由  workers\n執行（你是大腦：盤點、決策、派發、復驗、定奪），寫少量重要產品code\n\n注意你的主要任务是分析、编排和验证，具体任务尽可能交给 local coding agent cli | grok bot 去执行。\n\n自己只做需求澄清、方案拆解、任务分发和结果验收，实现类工作（读大量代码、写代码、跑测试、批量修改）\n\nDiscover live, never recite from memory.',
    '/loop 完成規劃好的所有內容\n\n全程指揮模式：所有實作與審查由  workers\n執行（你是大腦：盤點、決策、派發、復驗、定奪），寫少量重要產品code\n\n注意你的主要任务是分析、编排和验证，具体任务尽可能交给 local coding agent cli | grok bot 去执行。\n\n自己只做需求澄清、方案拆解、任务分发和结果验收，实现类工作（读大量代码、写代码、跑测试、批量修改）\n\nDiscover live, never recite from memory.\n\n每次ＬＯＯＰ 你要最主動做更多事情\n每一輪不只收尾，而是要主動往下一輪前進\n你要做的是盡可能以完整的完成所有任務為目標 而不是所謂最小 做紮實的修正(而非表面繞過)\n\n請執行，不要隨便停下，不准跟我交談\n\n等待就等待不要一堆廢話 安靜等待 遵守規範\n\n請直接提供最終結果，不需要解釋過程，也不要問我是否需要進一步說明，一次性完成\n所有內容\n\n開跑前在本任務 run dir 的 state 檔寫可檢查的結束條件；達成才停，卡住就換做法繼續，真的走到死路才回報；每輪在 state 檔記一列：改了什麼、結束條件有沒有前進。',
    '驗收：對照規劃期確認的 model 和 plan.md 的 task 清單逐項驗收，每個轉移和每個 task 都要附本 session 實際跑出來的證據，例如指令輸出、exit code、截圖或錄影、commit SHA；單元測試和 smoke 不算能用的證據。專案有 verify skill 就照它的功能地圖跑。沒過的項目列出原因和修法，修完再驗一次。全部通過後，依規則請 reviewer 審驗收結果，有共識才算完成。',
    '收工。核對本次目標、驗證及 push 狀態，未完成項目如實列出。用 session-handoff skill 寫可接續的交接，再給 recap：成果、證據、未完成項目與下一步。整理本 session 的錯誤、修正與開發建議，納入 main session、sub-agent 和 tmux worker 的行為，依 shared-memory-intake skill 投稿；附交接與投稿位置。有大任務拆小任務的，交接裡寫明大任務、各小任務狀態、這次停在哪個檢核點與驗證結果、下一個小任務。'
  ]
  expect(PHRASES.map(p => p.hotkey)).toEqual(['4', '5', '6', '7', '8', '9', '0'])
  expect(PHRASES.map(p => p.label)).toEqual(['更深的問題', '前情提要', '規劃期', '指揮', '指揮＋loop', '驗收', '收工'])
  expect(PHRASES.map(p => p.text)).toEqual(expected)
  for (const p of PHRASES) {
    await $.ui.render(band())
    await $.ui.press({ plugin: PLUGIN, key: `say-${p.hotkey}`, requestId: 'above' })
  }
  expect(w.filled).toEqual(expected)
  expect(w.sent).toEqual([])
  // Let the last fill callback's append finish, then check every row survived.
  await $.session.start(start)
  const rows = [...w.files.values()].join('').trim().split('\n').map(l => JSON.parse(l))
  expect(rows.map(r => r.combo)).toEqual(PHRASES.map(p => p.label))
  expect(rows.every(r => r.event === 'shown')).toBe(true)
})

test('mode button cycles, commands reverse it, and each saved choice is read on session start', async ($, on) => {
  const w = world(on)
  w.store.set('quick-say.auto', 'off')
  await $.session.start(start)
  expect(textOf(await $.ui.render(band()))).toContain('[ ◐ 半自動 ]')
  for (const [saved, current, label] of [
    ['自動', '半自動', '◐ 半自動'],
    ['手動', '手動', '○ 手動'],
    ['半自動', '半自動', '◐ 半自動'],
  ]) {
    // The previous start resets auto; restore it to test auto -> manual.
    if (saved === '手動') await $.command.run({ ...cmd, args: 'mode auto' })
    await $.ui.render(band())
    await $.ui.press({ plugin: PLUGIN, key: 'mode', requestId: 'above' })
    expect(w.store.get('quick-say.mode')).toBe(saved)
    expect(textOf(await $.ui.render(band()))).toContain(`[ ${saved === '自動' ? '⚡ 自動' : saved === '手動' ? '○ 手動' : '◐ 半自動'} ]`)
    await $.session.start(start)
    expect(w.store.get('quick-say.mode')).toBe(saved)
    expect(textOf(await $.ui.render(band()))).toContain(`[ ${label} ]`)
    expect((await $.command.run({ ...cmd, args: 'mode' })).text).toBe(`mode: ${current}`)
  }
  for (const [arg, saved] of [['manual', '手動'], ['auto', '自動'], ['semi', '半自動'], ['手動', '手動'], ['半自動', '半自動'], ['自動', '自動']]) {
    await $.command.run({ ...cmd, args: `mode ${arg}` })
    expect(w.store.get('quick-say.mode')).toBe(saved)
    expect(textOf(await $.ui.render(band()))).toContain(saved!)
    await $.session.start(start)
    expect(w.store.get('quick-say.mode')).toBe(saved)
    expect((await $.command.run({ ...cmd, args: 'mode' })).text).toBe(`mode: ${saved === '手動' ? '手動' : '半自動'}`)
  }
  expect((await $.command.run({ ...cmd, args: 'auto' })).text).toContain('[mode')
  expect((await $.command.run({ ...cmd, args: 'mode nope' })).text).toContain('manual|semi|auto')
})

// Read each row as the engine draws it, with the collapse control's four cells reserved.
function linesOf(node: unknown): string[] {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(linesOf)
  const el = node as { type?: string; children?: unknown; props?: { flexDirection?: string; dimColor?: boolean } }
  if (el.type !== 'Box') return [textOf(node)]
  const kids = [el.children].flat(9).flatMap(linesOf)
  return el.props?.flexDirection === 'column' ? kids : [kids.join('')]
}

test('all mode headers fit wide and narrow cells and actionable buttons are not dim', async ($, on) => {
  world(on, new Map([['quick-say.fold', 'open']]))
  await $.session.start(start)
  for (const [mode, label, icon] of [['manual', '○ 手動', '○'], ['semi', '◐ 半自動', '◐'], ['auto', '⚡ 自動', '⚡']]) {
    await $.command.run({ ...cmd, args: `mode ${mode}` })
    for (const width of [120, 80, 40, 35, 20]) {
      const tree = await $.ui.render(band(width))
      const text = textOf(tree)
      if (width < 36) expect(text).not.toContain('quick say')
      else {
        expect(text).toContain('▌quick say v0.5.0')
        expect(text).toContain(`[ ${width >= 80 ? label : icon} ]`)
      }
      for (const line of linesOf(tree).filter(l => !l.startsWith('workers v0.46.14'))) expect(cells(line) + (line.includes('▌quick say') ? 4 : 0)).toBeLessThanOrEqual(width)
      const walk = (n: unknown, dim = false) => {
        if (!n || typeof n !== 'object') return
        if (Array.isArray(n)) { n.forEach(x => walk(x, dim)); return }
        const el = n as { type?: string; props?: { dimColor?: boolean }; children?: unknown }
        const isDim = dim || el.props?.dimColor === true
        if (el.type === 'Button') expect(isDim).toBe(false)
        walk(el.children, isDim)
      }
      walk(tree)
    }
  }
})
