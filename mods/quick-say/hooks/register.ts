import type { EngineInterface, Register } from 'claude-code'

import { cells, fit, rowsOf } from './lib/band.ts'

const MOD_VERSION = '0.1.0'
const NAME = 'quick-say'
const COMMAND = 'quick-say'
const ACCENT = 'cyan'
/** 'open' once the person unfolded the band; absent or 'folded': the band starts as its header line. */
const FOLD_KEY = `${NAME}.fold`
const HIDE_KEY = `${NAME}.hidden`

// The owner's most repeated prompts (session logs, 2026-10-23: "update title" 12x as an opener,
// the /session-handoff wrap-up 16x as a closer, 繼續/順利？/處理啊 variants 10-25x each),
// rewritten so the agent reads one clear instruction. They are the person's own words sent
// by the person's keypress, so they approve what they say (the go-ahead does).
// Digits 5-9: the workers band numbers its rows from 1, and a clash goes to whichever draws later.
export const PHRASES = [
  {
    hotkey: '5',
    label: '開場',
    text: '更新本 session 標題：讀 ~/.agents/rules/session-titles.md，照目前的任務和狀態改標題。還沒有任務就只設狀態和機器標記，等我下一則訊息。',
  },
  {
    hotkey: '6',
    label: '繼續',
    text: '繼續。照目前的計畫做下一步，已核可範圍內的事不用再問我。做到驗收條件達成，或卡在只有我能決定的事才停；停下時說清楚卡在哪、需要我做什麼。',
  },
  {
    hotkey: '7',
    label: '進度？',
    text: '回報進度。先講需要我做的事，再講：已完成什麼（附本 session 實際跑過的驗證輸出）、還剩什麼、卡在哪。沒驗證過的標 UNCONFIRMED。',
  },
  {
    hotkey: '8',
    label: '照做',
    text: '可以，照你上一則提的方案做，範圍就是你提的那些，不用再問。超出那個範圍的才回來問我。',
  },
  {
    hotkey: '9',
    label: '收工',
    text: '收工，依序做：1. 用 session-handoff skill 寫交接文件。2. 回一段 recap：做了什麼、結果和證據、沒做完的事。3. 整理這個 session 的犯錯回饋和開發建議，包含 sub-agent 和 tmux worker 的行為，不只 main session，用 shared-memory-intake skill 投稿。',
  },
] as const

type State = { folded: boolean; hidden: boolean }

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))

function say($: EngineInterface, p: (typeof PHRASES)[number]) {
  // Queued by the engine until the session is idle; asUser: the model reads it bare, as typed.
  void $.prompt
    .submit({ text: p.text, asUser: true })
    .then(r => {
      if (r.drop !== undefined) $.ui.toast(`${NAME}: ${p.label} not sent (${r.drop})`)
    })
    .catch(err => $.ui.toast(`${NAME}: ${p.label} not sent (${errText(err)})`))
}

async function setHidden($: EngineInterface, s: State, hidden: boolean) {
  s.hidden = hidden
  $.ui.invalidate('ui.render')
  await $.store.set(HIDE_KEY, hidden ? 'hidden' : 'shown').catch(err => $.ui.toast(`${NAME}: band state not saved (${errText(err)})`))
}

const list = () => PHRASES.map(p => `${p.hotkey} ${p.label}: ${p.text}`).join('\n')

export const register: Register = on => {
  const s: State = { folded: true, hidden: false }

  on('session.start', async ($, e, next) => {
    s.folded = (await $.store.get(FOLD_KEY)) !== 'open'
    s.hidden = (await $.store.get(HIDE_KEY)) === 'hidden'
    await $.command.register({ name: COMMAND, description: `Quick say v${MOD_VERSION}: /${COMMAND} shows or hides the band and lists the canned prompts` })
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    await setHidden($, s, !s.hidden)
    return { text: `${s.hidden ? `band hidden; /${COMMAND} shows it again.` : 'band shown; in an empty prompt press a digit.'}\n${list()}` }
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
    const status = ` · ${PHRASES.length} phrases `
    // ' [-]' is the engine's collapse control, drawn over the band's last cells: kept clear.
    const words = cells(title) + cells(status) + cells('[ ▾ fold ][ hide ] [-]') <= width
    const header = Box({
      flexDirection: 'row',
      children: [
        Text({ bold: true, color: ACCENT, children: title }),
        Text({ dimColor: true, children: fit(status, Math.max(0, width - cells(title) - (words ? 22 : 14))) }),
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
    // Each phrase gets an equal share of the row: '  N: ' plus its label, cut to fit (rule 10).
    const share = Math.floor(width / PHRASES.length) - 5
    const row = Box({
      flexDirection: 'row',
      children: PHRASES.flatMap(p => [
        Text({ children: '  ' }),
        Button({ key: `say-${p.hotkey}`, hotkey: p.hotkey, plain: true, label: fit(p.label, share), onPress: () => say($, p) }),
      ]),
    })
    return Box({ flexDirection: 'column', children: [below, header, row] })
  })
}
