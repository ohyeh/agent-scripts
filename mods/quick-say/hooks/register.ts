import type { EngineInterface, Register } from 'claude-code'

import { cells, fit, rowsOf } from './lib/band.ts'
import { APPROVES_NOTHING, askPrompt, askTail, dirOf, gitDirOf, gitPrompt, isCommit, questionTail, type GitGap } from './lib/follow.ts'
import rawPhrases from './phrases.ts'

const MOD_VERSION = '0.6.2'
const NAME = 'quick-say'
const COMMAND = 'quick-say'
const ACCENT = 'cyan'
/** 'open' once the person unfolded the band; absent or 'folded': the band starts as its header line. */
const FOLD_KEY = `${NAME}.fold`
const HIDE_KEY = `${NAME}.hidden`

// A digit fills the box; only the owner sends it. The texts live in ./phrases.ts;
// a text may embed another combo's text as {{<hotkey>}} (combo 8 reuses 7).
type Phrase = { hotkey: string; label: string; when: string; text: string }
export function phrasesOf(raw: unknown): Phrase[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('phrases.ts: expected a non-empty array')
  const list = raw.map((p, i) => {
    for (const k of ['hotkey', 'label', 'when', 'text'] as const) {
      if (typeof p?.[k] !== 'string' || p[k].trim() === '') throw new Error(`phrases.ts: entry ${i} needs a non-empty "${k}"`)
    }
    return { hotkey: p.hotkey, label: p.label, when: p.when, text: p.text } as Phrase
  })
  const keys = list.map(p => p.hotkey)
  const dup = keys.find((k, i) => keys.indexOf(k) !== i)
  if (dup) throw new Error(`phrases.ts: hotkey "${dup}" appears twice`)
  // One level of embeds: after one pass no {{…}} may remain (rejects chains, self-embeds and cycles).
  return list.map(p => {
    const text = p.text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
      const ref = list.find(q => q.hotkey === k)
      if (!ref) throw new Error(`phrases.ts: "${p.hotkey}" embeds unknown hotkey {{${k}}}`)
      return ref.text
    })
    if (/\{\{\w+\}\}/.test(text)) throw new Error(`phrases.ts: "${p.hotkey}" embeds a text that embeds again; one level only`)
    return { ...p, text }
  })
}
export const PHRASES = phrasesOf(rawPhrases)
type Mode = '手動' | '半自動' | '自動'
const MODES: Mode[] = ['手動', '半自動', '自動']
const MODE_LABEL = { 手動: '○ 手動', 半自動: '◐ 半自動', 自動: '⚡ 自動' }
const CONTINUE = 'quick-say 自動：沒有待決事項就接著做到結束條件達成；已授權範圍內的事直接做，不用再問使用者。'

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
  void $.prompt
    .submit({ text })
    .then(async r => {
      if (r.drop !== undefined) $.ui.toast(`${NAME}: not sent (${r.drop})`)
      else await logLine($, s, 'sent', '', gate)
    })
    .catch(err => $.ui.toast(`${NAME}: not sent (${errText(err)})`))
  return true
}

async function autoSend($: EngineInterface, s: State, answer: string) {
  if (questionTail(answer)) return stop($, s, 'agent 在問問題')
  if (s.streak >= MAX_STREAK) return stop($, s, '連續送滿 4 句')
  const picked = await $.model.classify(`使用者上一句：${s.lastHuman.slice(-500)}\nagent 回覆：${answer.slice(-1500)}\n下一句？`, ['續跑', '驗收', 'none'])
  if (picked !== '續跑' && picked !== '驗收') return stop($, s, '猜不到下一句')
  const text = `${picked === '續跑' ? CONTINUE : PHRASES.find(p => p.hotkey === '9')!.text}\n${APPROVES_NOTHING}`
  s.streak += 1
  void $.prompt
    .submit({ text })
    .then(async r => {
      if (r.drop !== undefined) $.ui.toast(`${NAME}: not sent (${r.drop})`)
      else {
        $.ui.toast(`${NAME}: ${picked}`)
        await logLine($, s, 'sent', picked)
      }
    })
    .catch(err => $.ui.toast(`${NAME}: not sent (${errText(err)})`))
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
  // A mode press is the person's own act, like a typed prompt: it ends the streak too.
  s.streak = 0
  s.stopped = ''
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

  // The main agent's turn ended with an answer: the gates (facts); 自動 then sends or stops (a guess). 半自動 suggests nothing: 0 of 45 were taken.
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (s.mode === '手動' || e.agentId !== undefined || e.reason !== 'answer' || (s.mode === '自動' && s.stopped)) return r
    try {
      const gaps = await gitGaps($, s)
      // Dirty files only: a commit the nudge itself caused must not be a new state (20 re-fires in one session).
      const key = gaps.map(g => `${g.repo}:${g.dirty.join(',')}`).join(';')
      if (gaps.length && await nudge($, s, 'git', key, gitPrompt(gaps), 'reminded the agent of unfinished git work')) return r
      const ask = askTail(e.answer)
      if (ask && await nudge($, s, 'ask', ask, askPrompt(ask), 'reminded the agent not to ask leave for approved work')) return r
      if (s.mode === '自動') await autoSend($, s, e.answer)
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
