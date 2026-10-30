import type { EngineInterface, Register } from 'claude-code'

import { cells, fit, rowsOf } from './lib/band.ts'
import { APPROVES_NOTHING, askPrompt, askTail, dirOf, gitDirOf, gitPrompt, isCommit, questionTail, type GitGap } from './lib/follow.ts'

const MOD_VERSION = '0.5.0'
const NAME = 'quick-say'
const COMMAND = 'quick-say'
const ACCENT = 'cyan'
/** 'open' once the person unfolded the band; absent or 'folded': the band starts as its header line. */
const FOLD_KEY = `${NAME}.fold`
const HIDE_KEY = `${NAME}.hidden`

// A digit fills the box; only the owner sends it. Combo 8 reuses the owner's command text.
const COMMANDER = '全程指揮模式：所有實作與審查由  workers\n執行（你是大腦：盤點、決策、派發、復驗、定奪），寫少量重要產品code\n\n注意你的主要任务是分析、编排和验证，具体任务尽可能交给 local coding agent cli | grok bot 去执行。\n\n自己只做需求澄清、方案拆解、任务分发和结果验收，实现类工作（读大量代码、写代码、跑测试、批量修改）\n\nDiscover live, never recite from memory.'
export const PHRASES = [
  {
    hotkey: '4',
    label: '更深的問題',
    when: '反覆討論同一件事，需要找出一直沒問的更深問題',
    text: '在最近反复讨论的问题背后，有没有一个更深的问题，是一直在绕着它走，却没有真正问出来的？',
  },
  {
    hotkey: '5',
    label: '前情提要',
    when: '接續前一段工作，先讀來源並確認前情',
    text: '/session-handoff resume 前情提要：照 RESUME 流程讀完交接、相關 session、html 報告與 commits，然後像看劇的前情提要一樣講給我聽。\n1. 之前做了什麼、發生了什麼，照時間順序，包括卡住和被我糾正的地方。\n2. 你讀了哪些來源：session id、html／artifact 連結、commit SHA，每個用一句話說它講了什麼。\n3. 現在停在哪，分兩種情況：上一段工作已經收完、沒有未完成的，就直接說，然後等我給新目標，照規劃期的做法先畫圖確認共識，再寫 PLAN；如果是大任務拆成小任務、上次停在某個檢核點收尾，就列出大任務、每個小任務的狀態（已驗證完成／未完成），上次停在哪個檢核點、當時驗證的結果，以及下一個小任務。\n4. 你沒讀到或不確定的地方。\n挑幾個繼承來的關鍵說法，在真實產物上驗一次；已驗證且沒變的不重做。講完先停，等我確認你讀懂了再開工。',
  },
  {
    hotkey: '6',
    label: '規劃期',
    when: '新目標需要先畫狀態圖確認共識，再寫計畫',
    text: '規劃期：先不要寫 PLAN。先把你理解的系統畫成狀態圖（狀態、轉移、不變條件，用 system model 表示），再依 using-decision-tree 的 design 分支選 motion、diagram 或 canvas 呈現，加上範圍、取捨和還不確定的地方，給我確認我們有共識；會跨模組、動到介面的程式任務，另外附一份程式骨架（型別、簽名、未實作的函式）。我確認以後，才在本任務的 .workflow run dir 寫 plan.md 和 task 清單：每個 task 對應 model 的轉移 ID，並附驗收和驗證方式。',
  },
  {
    hotkey: '7',
    label: '指揮',
    when: '目標已確定，要由主 agent 指揮 workers 實作與審查',
    text: COMMANDER,
  },
  {
    hotkey: '8',
    label: '指揮＋loop',
    when: '規劃已確認，要持續指揮直到所有結束條件達成',
    text: `/loop 完成規劃好的所有內容

${COMMANDER}

每次ＬＯＯＰ 你要最主動做更多事情
每一輪不只收尾，而是要主動往下一輪前進
你要做的是盡可能以完整的完成所有任務為目標 而不是所謂最小 做紮實的修正(而非表面繞過)

請執行，不要隨便停下，不准跟我交談

等待就等待不要一堆廢話 安靜等待 遵守規範

請直接提供最終結果，不需要解釋過程，也不要問我是否需要進一步說明，一次性完成
所有內容

開跑前在本任務 run dir 的 state 檔寫可檢查的結束條件；達成才停，卡住就換做法繼續，真的走到死路才回報；每輪在 state 檔記一列：改了什麼、結束條件有沒有前進。`,
  },
  {
    hotkey: '9',
    label: '驗收',
    when: '依已確認的 model 和 task 清單驗收真實產物',
    text: '驗收：對照規劃期確認的 model 和 plan.md 的 task 清單逐項驗收，每個轉移和每個 task 都要附本 session 實際跑出來的證據，例如指令輸出、exit code、截圖或錄影、commit SHA；單元測試和 smoke 不算能用的證據。專案有 verify skill 就照它的功能地圖跑。沒過的項目列出原因和修法，修完再驗一次。全部通過後，依規則請 reviewer 審驗收結果，有共識才算完成。',
  },
  {
    hotkey: '0',
    label: '收工',
    when: '任務已收尾，需要交接、投稿與下一個檢核點',
    text: '收工。核對本次目標、驗證及 push 狀態，未完成項目如實列出。用 session-handoff skill 寫可接續的交接，再給 recap：成果、證據、未完成項目與下一步。整理本 session 的錯誤、修正與開發建議，納入 main session、sub-agent 和 tmux worker 的行為，依 shared-memory-intake skill 投稿；附交接與投稿位置。有大任務拆小任務的，交接裡寫明大任務、各小任務狀態、這次停在哪個檢核點與驗證結果、下一個小任務。',
  },
] as const
type Mode = '手動' | '半自動' | '自動'
const MODES: Mode[] = ['手動', '半自動', '自動']
const MODE_LABEL = { 手動: '○ 手動', 半自動: '◐ 半自動', 自動: '⚡ 自動' }
const CONTINUE = 'quick-say 自動：沒有待決事項就接著做到結束條件達成；已授權範圍內的事直接做，不用問我。'

type State = {
  folded: boolean
  hidden: boolean
  /** The follow-through: gates at the end of a turn and the suggested next prompt. */
  mode: Mode
  stopped: string
  home: string
  sid: string
  cwd: string
  /** Files this session edited, by Edit/Write/NotebookEdit (not by a Bash sed). */
  edited: Set<string>
  /** Commits this session made: sha → the repo it is in. */
  commits: Map<string, string>
  /** The state each gate last fired on, so it fires once per state. */
  fired: Map<'git' | 'ask', string>
  /** Mod prompts in a row since the person last typed one; capped so a gate never loops. */
  streak: number
  lastHuman: string
  logging: Promise<void>
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))
const MODE_KEY = `${NAME}.mode`
const MAX_STREAK = 4
const NONE = 'none：使用者這時不會用上面任何一句，或要說的是別的事'
const labelOf = (p: (typeof PHRASES)[number]) => `${p.label}：${p.when}`

function logLine($: EngineInterface, s: State, event: 'shown' | 'sent' | 'stopped' | 'gate', combo = '', reason = '') {
  const at = new Date().toISOString()
  const path = `${s.home}/.local/state/${NAME}/${at.slice(0, 10)}-${s.sid.slice(0, 8)}.log`
  const row = `${JSON.stringify({ at, mode: s.mode, event, combo, reason })}\n`
  // Fill callbacks can overlap; keep each read/write append in event order.
  s.logging = s.logging.then(async () => {
    const before = await $.fs.exists(path) ? await $.fs.read(path) : ''
    await $.fs.write(path, `${before}${row}`)
  }).catch(err => {
    $.ui.log(`${NAME}: log not written (${errText(err)})`, { to: 'debug' })
  })
  return s.logging
}

async function stop($: EngineInterface, s: State, reason: string) {
  s.stopped = reason
  $.ui.invalidate('ui.render')
  await logLine($, s, 'stopped', '', reason)
}

async function run($: EngineInterface, argv: string[]) {
  const r = await $.process.run(argv, { timeoutMs: 5000 })
  if (r.exitCode !== 0) throw new Error(`${argv.slice(0, 4).join(' ')}: exit ${r.exitCode} ${r.stderr.trim().slice(0, 120)}`)
  return r.stdout
}

// Facts, per repo: files this session edited that are not committed; its commits not on the upstream.
async function gitGaps($: EngineInterface, s: State): Promise<GitGap[]> {
  const byRepo = new Map<string, { files: string[]; shas: string[] }>()
  const repoOf = async (dir: string) => (await run($, ['git', '-C', dir, 'rev-parse', '--show-toplevel'])).trim()
  for (const f of s.edited) {
    const repo = await repoOf(dirOf(f)).catch(() => '')
    if (repo) byRepo.set(repo, { files: [...(byRepo.get(repo)?.files ?? []), f], shas: byRepo.get(repo)?.shas ?? [] })
  }
  for (const [sha, repo] of s.commits) byRepo.set(repo, { files: byRepo.get(repo)?.files ?? [], shas: [...(byRepo.get(repo)?.shas ?? []), sha] })
  const gaps: GitGap[] = []
  for (const [repo, { files, shas }] of byRepo) {
    const status = files.length ? await run($, ['git', '-C', repo, 'status', '--porcelain', '--', ...files]) : ''
    const dirty = status.split('\n').filter(Boolean).map(l => l.slice(3))
    // No upstream (a local branch): nothing to call unpushed.
    const ahead = shas.length ? (await run($, ['git', '-C', repo, 'rev-list', '@{u}..HEAD']).catch(() => '')).split('\n') : []
    const unpushed = shas.filter(sha => ahead.includes(sha)).map(sha => sha.slice(0, 7))
    if (dirty.length || unpushed.length) gaps.push({ repo, dirty, unpushed })
  }
  return gaps
}

// One framed mod prompt (never asUser: no keypress stands behind it), once per state, within the streak cap.
async function nudge($: EngineInterface, s: State, gate: 'git' | 'ask', key: string, text: string, toast: string): Promise<boolean> {
  if (s.fired.get(gate) === key || s.streak >= MAX_STREAK) return false
  s.fired.set(gate, key)
  s.streak += 1
  $.ui.toast(`${NAME}: ${toast}`)
  $.ui.invalidate('ui.render')
  await logLine($, s, 'gate', '', gate)
  await $.prompt
    .submit({ text })
    .then(async r => {
      if (r.drop !== undefined) $.ui.toast(`${NAME}: not sent (${r.drop})`)
      else await logLine($, s, 'sent', '', gate)
    })
    .catch(err => $.ui.toast(`${NAME}: not sent (${errText(err)})`))
  return true
}

// No gate fired: the small fast model picks the combo the owner would send next, shown dim in the empty box.
async function suggest($: EngineInterface, s: State, answer: string) {
  const text = `使用者上一句：${s.lastHuman.slice(-500)}\n\nagent 這回合回覆的結尾：${answer.slice(-1500)}\n\n使用者接下來最可能說哪一句？`
  const picked = await $.model.classify(text, [...PHRASES.map(labelOf), NONE])
  const p = PHRASES.find(x => labelOf(x) === picked)
  if (p) {
    const shown = await $.prompt.suggest({ text: p.text })
    if (shown.isShown) await logLine($, s, 'shown', p.label)
  }
}

async function autoSend($: EngineInterface, s: State, answer: string) {
  if (questionTail(answer)) return stop($, s, 'agent 在問問題')
  if (s.streak >= MAX_STREAK) return stop($, s, '連續送滿 4 句')
  const picked = await $.model.classify(`使用者上一句：${s.lastHuman.slice(-500)}\nagent 回覆：${answer.slice(-1500)}\n下一句？`, ['續跑', '驗收', 'none'])
  if (picked !== '續跑' && picked !== '驗收') return stop($, s, '猜不到下一句')
  const text = `${picked === '續跑' ? CONTINUE : PHRASES[5].text}\n${APPROVES_NOTHING}`
  s.streak += 1
  const result = await $.prompt.submit({ text })
  if (result.drop !== undefined) $.ui.toast(`${NAME}: not sent (${result.drop})`)
  else {
    $.ui.toast(`${NAME}: ${picked}`)
    await logLine($, s, 'sent', picked)
  }
}

function say($: EngineInterface, s: State, p: (typeof PHRASES)[number]) {
  // Into the box, not sent: the person sees the whole text, may edit it, and sends it with Enter.
  void $.prompt
    .fill({ text: p.text })
    .then(async r => {
      if (!r.isFilled) $.ui.toast(`${NAME}: ${p.label} not filled (${r.refusal ?? 'refused'})`)
      else await logLine($, s, 'shown', p.label)
    })
    .catch(err => $.ui.toast(`${NAME}: ${p.label} not filled (${errText(err)})`))
}

async function setHidden($: EngineInterface, s: State, hidden: boolean) {
  s.hidden = hidden
  $.ui.invalidate('ui.render')
  await $.store.set(HIDE_KEY, hidden ? 'hidden' : 'shown').catch(err => $.ui.toast(`${NAME}: band state not saved (${errText(err)})`))
}

const list = () => PHRASES.map(p => `${p.hotkey} ${p.label}: ${p.text}`).join('\n')

async function setMode($: EngineInterface, s: State, mode: Mode) {
  s.mode = mode
  $.ui.invalidate('ui.render')
  await $.store.set(MODE_KEY, mode).catch(err => $.ui.toast(`${NAME}: mode not saved (${errText(err)})`))
}

export const register: Register = on => {
  const s: State = {
    folded: true,
    hidden: false,
    mode: '半自動',
    stopped: '',
    home: '',
    sid: '',
    cwd: '',
    edited: new Set(),
    commits: new Map(),
    fired: new Map(),
    streak: 0,
    lastHuman: '',
    logging: Promise.resolve(),
  }

  on('session.start', async ($, e, next) => {
    s.cwd = e.cwd
    s.sid = await $.session.id()
    s.home = (await $.env.get('HOME')) ?? ''
    s.streak = 0
    s.stopped = ''
    s.lastHuman = ''
    s.edited.clear()
    s.commits.clear()
    s.fired.clear()
    s.folded = (await $.store.get(FOLD_KEY)) !== 'open'
    s.hidden = (await $.store.get(HIDE_KEY)) === 'hidden'
    s.mode = (await $.store.get(MODE_KEY)) === '手動' ? '手動' : '半自動'
    await $.command.register({
      name: COMMAND,
      description: `Quick say v${MOD_VERSION}: /${COMMAND} shows or hides the band and lists the combos; /${COMMAND} mode sets or shows the mode`,
      argumentHint: '[mode 手動|半自動|自動|manual|semi|auto]',
    })
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const args = e.args.trim().split(/\s+/)
    if (args[0] === 'mode') {
      const mode = ({ manual: '手動', semi: '半自動', auto: '自動' } as const)[args[1] as 'manual' | 'semi' | 'auto'] ?? args[1]
      if (args.length > 2 || (mode !== undefined && !MODES.includes(mode as Mode))) return { text: 'mode: 手動|半自動|自動|manual|semi|auto' }
      if (mode !== undefined) await setMode($, s, mode as Mode)
      return { text: `mode: ${s.mode}` }
    }
    if (e.args.trim()) return { text: `/${COMMAND} [mode 手動|半自動|自動|manual|semi|auto]` }
    await setHidden($, s, !s.hidden)
    return { text: `${s.hidden ? `band hidden; /${COMMAND} shows it again.` : 'band shown; in an empty prompt a digit fills its combo, Enter sends it.'}\n${list()}` }
  })

  // A prompt the person sent ends the streak of mod prompts.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin?.kind === 'composer' || e.origin?.kind === 'bridge') {
      s.streak = 0
      s.stopped = ''
      s.lastHuman = e.text
      $.ui.invalidate('ui.render')
    }
    return next(e)
  }).catch(($, e, next) => next(e)) // A prompt is never held back by bookkeeping.

  // Read-only bookkeeping: what this session edited and committed. Never holds a call back.
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    try {
      const input = e as { tool: string; file_path?: string; notebook_path?: string; command?: string }
      if (r.isError) return r
      const file = input.file_path ?? input.notebook_path
      if ((input.tool === 'Edit' || input.tool === 'Write' || input.tool === 'NotebookEdit') && file) s.edited.add(file)
      if (input.tool === 'Bash' && input.command && isCommit(input.command)) {
        const dir = gitDirOf(input.command, s.cwd)
        const repo = (await run($, ['git', '-C', dir, 'rev-parse', '--show-toplevel'])).trim()
        s.commits.set((await run($, ['git', '-C', repo, 'rev-parse', 'HEAD'])).trim(), repo)
      }
    } catch (err) {
      $.ui.log(`${NAME}: edit not tracked (${errText(err)})`, { to: 'debug' })
    }
    return r
  })

  // The main agent's turn ended with an answer: gates first (facts), then the suggestion (a guess).
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (s.mode === '手動' || e.agentId !== undefined || e.reason !== 'answer' || (s.mode === '自動' && s.stopped)) return r
    try {
      const gaps = await gitGaps($, s)
      const key = gaps.map(g => `${g.repo}:${g.dirty.join(',')}:${g.unpushed.join(',')}`).join(';')
      if (gaps.length && await nudge($, s, 'git', key, gitPrompt(gaps), 'reminded the agent of unfinished git work')) return r
      const ask = askTail(e.answer)
      if (ask && await nudge($, s, 'ask', ask, askPrompt(ask), 'reminded the agent not to ask leave for approved work')) return r
      if (s.mode === '自動') await autoSend($, s, e.answer)
      else await suggest($, s, e.answer)
    } catch (err) {
      $.ui.log(`${NAME}: follow-through skipped (${errText(err)})`, { to: 'debug' })
    }
    return r
  })

  // Under the other plugins' rows, in what is left of maxRows; a taller tree scrolls and
  // disarms the digit hotkeys, so the phrase row goes before that happens.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const below = await next(e)
    if (s.hidden) return below
    const budget = e.props.maxRows - rowsOf(below)
    if (budget < 1) return below

    const { Box, Text, Button } = $.ui.resolve(e)
    const width = e.props.bodyColumns
    const title = `▌quick say v${MOD_VERSION}`
    const status = ` · ${PHRASES.length} combos · ${s.mode}${s.stopped ? ` · 停：${s.stopped}` : ''} `
    // ' [-]' is the engine's collapse control, drawn over the band's last cells: kept clear.
    const words = cells(title) + cells(status) + cells(`[ ${MODE_LABEL[s.mode]} ][ ▾ fold ][ hide ] [-]`) <= width
    const modeLabel = words ? MODE_LABEL[s.mode] : MODE_LABEL[s.mode].split(' ')[0]!
    const buttons = `[ ${modeLabel} ][ ${words ? (s.folded ? '▸ open' : '▾ fold') : s.folded ? '▸' : '▾'} ][ ${words ? 'hide' : '✕'} ] [-]`
    if (cells(title) + cells(buttons) > width) return below
    const header = Box({
      flexDirection: 'row',
      children: [
        Text({ bold: true, color: ACCENT, children: title }),
        Text({ dimColor: !s.stopped, children: fit(status, Math.max(0, width - cells(title) - cells(buttons))) }),
        Button({ key: 'mode', label: modeLabel, onPress: () => void setMode($, s, MODES[(MODES.indexOf(s.mode) + 1) % MODES.length]!) }),
        Button({
          key: 'fold',
          label: words ? (s.folded ? '▸ open' : '▾ fold') : s.folded ? '▸' : '▾',
          onPress: () => {
            s.folded = !s.folded
            $.ui.invalidate('ui.render')
            void $.store.set(FOLD_KEY, s.folded ? 'folded' : 'open').catch(err => $.ui.toast(`${NAME}: fold not saved (${errText(err)})`))
          },
        }),
        Button({ key: 'hide', label: words ? 'hide' : '✕', onPress: () => void setHidden($, s, true) }),
      ],
    })
    if (s.folded || budget < 2) return Box({ flexDirection: 'column', children: [below, header] })
    // Each phrase gets an equal share of its row: '  N: ' plus its label, cut to fit (rule 10).
    // Too narrow for even one character and '…' each: two rows, when the budget has room for them.
    const perRow = budget >= 3 && Math.floor(width / PHRASES.length) < 9 ? Math.ceil(PHRASES.length / 2) : PHRASES.length
    const share = Math.floor(width / perRow) - 5
    const rows = [PHRASES.slice(0, perRow), PHRASES.slice(perRow)].filter(r => r.length > 0).map(r =>
      Box({
        flexDirection: 'row',
        children: r.flatMap(p => [
          Text({ children: '  ' }),
          Button({ key: `say-${p.hotkey}`, hotkey: p.hotkey, plain: true, label: fit(p.label, share), onPress: () => say($, s, p) }),
        ]),
      }),
    )
    return Box({ flexDirection: 'column', children: [below, header, ...rows] })
  })
}
