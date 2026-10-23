import type { EngineInterface, Register } from 'claude-code'

import { cells, fit, rowsOf } from './lib/band.ts'

const MOD_VERSION = '0.2.0'
const NAME = 'quick-say'
const COMMAND = 'quick-say'
const ACCENT = 'cyan'
/** 'open' once the person unfolded the band; absent or 'folded': the band starts as its header line. */
const FOLD_KEY = `${NAME}.fold`
const HIDE_KEY = `${NAME}.hidden`

// Combos: what the owner spent two to four prompts in a row asking for (session logs 2026-10-23:
// "advisor review 過了？" → "意見一次說完" → "有共識才執行"; "PLAN 都做好了？" → "都有 PUSH？" →
// "先 PUSH 啊"; "順利？" → "繼續處理啊"; "都搞定？" → the /session-handoff wrap-up), each one prompt.
// A digit fills the prompt box; the person reads it and sends it, so it approves what it says.
// Digits 6-9: the workers band numbers its rows from 1, and a clash goes to whichever draws later.
export const PHRASES = [
  {
    hotkey: '6',
    label: '審過再做',
    text: '照老規矩：先內部審過，再交 sol + advisor 做對抗式 review，請他們把意見一次說完。有共識、沒有 blocker 才動手；有分歧先自己收斂，只把真正要我決定的事帶來問我。',
  },
  {
    hotkey: '7',
    label: '進度續跑',
    text: '回報進度：先講需要我決定的事，再講已完成什麼（附本 session 實際跑過的驗證輸出）、還剩什麼。沒有要我決定的事，就直接做下一步，不用等我說繼續。',
  },
  {
    hotkey: '8',
    label: '做完推送',
    text: '對帳：逐項檢查我給的計畫是否都做完（附驗證輸出），沒做完的直接做完。review 過後 commit、push，需要部署的就部署。最後回報 commit sha、push 結果，以及還沒推送的東西和原因。',
  },
  {
    hotkey: '9',
    label: '收工',
    text: '收工。先確認計畫都做完、該推的都推了（列出 sha），然後依序：1. 用 session-handoff skill 寫交接文件。2. 回一段 recap：做了什麼、結果和證據、沒做完的事。3. 整理這個 session 的犯錯回饋和開發建議，包含 sub-agent 和 tmux worker 的行為，不只 main session，用 shared-memory-intake skill 投稿。',
  },
] as const

type State = { folded: boolean; hidden: boolean }

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))

function say($: EngineInterface, p: (typeof PHRASES)[number]) {
  // Into the box, not sent: the person sees the whole text, may edit it, and sends it with Enter.
  void $.prompt
    .fill({ text: p.text })
    .then(r => {
      if (!r.isFilled) $.ui.toast(`${NAME}: ${p.label} not filled (${r.refusal ?? 'refused'})`)
    })
    .catch(err => $.ui.toast(`${NAME}: ${p.label} not filled (${errText(err)})`))
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
    await $.command.register({ name: COMMAND, description: `Quick say v${MOD_VERSION}: /${COMMAND} shows or hides the band and lists the combos in full` })
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    await setHidden($, s, !s.hidden)
    return { text: `${s.hidden ? `band hidden; /${COMMAND} shows it again.` : 'band shown; in an empty prompt a digit fills its combo, Enter sends it.'}\n${list()}` }
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
    const status = ` · ${PHRASES.length} combos `
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
