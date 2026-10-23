import type { EngineInterface, Register } from 'claude-code'

import { cells, fit, rowsOf } from './lib/band.ts'
import { askPrompt, askTail, dirOf, gitDirOf, gitPrompt, isCommit, type GitGap } from './lib/follow.ts'

const MOD_VERSION = '0.4.0'
const NAME = 'quick-say'
const COMMAND = 'quick-say'
const ACCENT = 'cyan'
/** 'open' once the person unfolded the band; absent or 'folded': the band starts as its header line. */
const FOLD_KEY = `${NAME}.fold`
const HIDE_KEY = `${NAME}.hidden`

// Combos: what the owner spent two to four prompts in a row asking for (session logs 2026-10-23:
// "advisor review 過了？" → "意見一次說完" → "有共識才執行"; "PLAN 都做好了？" → "都有 PUSH？" →
// "先 PUSH 啊"; "順利？" → "繼續處理啊"; "都搞定？" → the /session-handoff wrap-up), each one prompt.
// 接手 and 離席照做 come from the per-session study of 336 sessions (.workflow/202610231450-quick-say-combos/booklet.md):
// briefs that made the agent guess the earlier work, and long runs that stopped while the owner was away.
// A digit fills the prompt box; the person reads it and sends it, so it approves what it says.
// Digits 5-9 and 0: the workers band numbers its rows from 1 and a clash goes to whichever draws later;
// 5 clashes only with five or more workers, and 接手 comes before any worker starts.
export const PHRASES = [
  {
    hotkey: '5',
    label: '接手',
    when: 'session 剛開始，要接續之前的工作（交接、計畫或上一個 session）',
    text: '接手這個 repo 進行中的工作：先讀本 session 指定的交接或計畫；沒指定就查最新的交接、run dir、git log 與過往 session 紀錄，不要問我上次做到哪。用四行回報：目標、已驗證完成、未完成項目、下一步；若多份紀錄互相衝突，列出差異與建議，不要猜。接著在既有授權內續做，已驗證且未變的不重做。',
  },
  {
    hotkey: '6',
    label: '審過再做',
    when: 'agent 提了計畫或要動手改東西，但還沒經過 review 或第二模型審過',
    text: '先核對本次目標、驗收與最小完整方案，自己檢查後，依現行模型規則請 advisor＋Sol 做對抗 review，把問題與建議一次列完。修正交回同一 reviewer 複查，最多三輪；有共識且無 blocker，便在既有授權內實作並驗證。仍有分歧時，附證據與建議，只問真正需要我決定的事。',
  },
  {
    hotkey: '7',
    label: '離席照做',
    when: '計畫已定案，使用者要離開一段時間，交給 agent 自己做到完成',
    text: '我要離開一段時間。依本 session 已定案的計畫，在既有授權內做到驗收完成，不另加目標。每輪先對照未完成項目再做下一步；advisor 能定的事不要等我。等待 worker 或外部工作時設監看與停滯期限，不要空等。只有完成、真的卡住或需要新授權才停下回報，回報附證據；push 依既定檢查點。',
  },
  {
    hotkey: '8',
    label: '進度續跑',
    when: 'agent 停下來報告一段，或做到一半停住，或使用者回來想知道進度，還有後續步驟可以自己接著做',
    text: '用四行回報：需要我決定的事、已驗證完成（附本 session 證據）、目前在跑或在等什麼、下一步與停滯期限。沒有待決事項就直接接著做到本次驗收完成，不因我問進度而停下或重跑已通過且未變的檢查；需新增授權的部分另列，其他照做，不用等我再說繼續。',
  },
  {
    hotkey: '9',
    label: '做完推送',
    when: 'agent 說做完了，但還沒對照計畫逐項確認、或還沒 commit、push、部署',
    text: '依本次已核准範圍逐項對帳，把未完成的做完並附本 session 驗證輸出；只定案計畫的任務就交付計畫。測試、pre-push 檢查與 review 通過後，依分支與授權規則 commit、push；部署或 reload 只處理已有授權的目標。最後列 commit SHA、push 結果、部署驗證，以及未交付項目、原因與下一步。',
  },
  {
    hotkey: '0',
    label: '收工',
    when: '任務都完成、驗證過也推送了，這個 session 可以結束',
    text: '收工。核對本次目標、驗證及 push 狀態，未完成項目如實列出。用 session-handoff skill 寫可接續的交接，再給 recap：成果、證據、未完成項目與下一步。整理本 session 的錯誤、修正與開發建議，納入 main session、sub-agent 和 tmux worker 的行為，依 shared-memory-intake skill 投稿；附交接與投稿位置。',
  },
] as const

type State = {
  folded: boolean
  hidden: boolean
  /** The follow-through: gates at the end of a turn and the suggested next prompt. */
  auto: boolean
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
  nudges: number
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))
const AUTO_KEY = `${NAME}.auto`
const MAX_STREAK = 2
const NONE = 'none：使用者這時不會用上面任何一句，或要說的是別的事'
const labelOf = (p: (typeof PHRASES)[number]) => `${p.label}：${p.when}`

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
function nudge($: EngineInterface, s: State, gate: 'git' | 'ask', key: string, text: string, toast: string): boolean {
  if (s.fired.get(gate) === key || s.streak >= MAX_STREAK) return false
  s.fired.set(gate, key)
  s.streak += 1
  s.nudges += 1
  $.ui.toast(`${NAME}: ${toast}`)
  $.ui.invalidate('ui.render')
  void $.prompt
    .submit({ text })
    .then(r => r.drop !== undefined && $.ui.toast(`${NAME}: not sent (${r.drop})`))
    .catch(err => $.ui.toast(`${NAME}: not sent (${errText(err)})`))
  return true
}

// No gate fired: the small fast model picks the combo the owner would send next, shown dim in the empty box.
async function suggest($: EngineInterface, s: State, answer: string) {
  const text = `使用者上一句：${s.lastHuman.slice(-500)}\n\nagent 這回合回覆的結尾：${answer.slice(-1500)}\n\n使用者接下來最可能說哪一句？`
  const picked = await $.model.classify(text, [...PHRASES.map(labelOf), NONE])
  const p = PHRASES.find(x => labelOf(x) === picked)
  if (p) await $.prompt.suggest({ text: p.text })
}

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

async function setAuto($: EngineInterface, s: State, auto: boolean) {
  s.auto = auto
  $.ui.invalidate('ui.render')
  await $.store.set(AUTO_KEY, auto ? 'on' : 'off').catch(err => $.ui.toast(`${NAME}: auto not saved (${errText(err)})`))
}

export const register: Register = on => {
  const s: State = {
    folded: true,
    hidden: false,
    auto: true,
    cwd: '',
    edited: new Set(),
    commits: new Map(),
    fired: new Map(),
    streak: 0,
    lastHuman: '',
    nudges: 0,
  }

  on('session.start', async ($, e, next) => {
    s.cwd = e.cwd
    s.folded = (await $.store.get(FOLD_KEY)) !== 'open'
    s.hidden = (await $.store.get(HIDE_KEY)) === 'hidden'
    s.auto = (await $.store.get(AUTO_KEY)) !== 'off'
    await $.command.register({
      name: COMMAND,
      description: `Quick say v${MOD_VERSION}: /${COMMAND} shows or hides the band and lists the combos; /${COMMAND} auto turns the follow-through on or off`,
      argumentHint: '[auto]',
    })
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    if (e.args.trim() === 'auto') {
      await setAuto($, s, !s.auto)
      return { text: `follow-through ${s.auto ? 'on: unfinished git work and a closing "shall I?" get one reminder each; a likely next combo shows dim in the empty prompt' : 'off'}.` }
    }
    await setHidden($, s, !s.hidden)
    return { text: `${s.hidden ? `band hidden; /${COMMAND} shows it again.` : 'band shown; in an empty prompt a digit fills its combo, Enter sends it.'}\n${list()}` }
  })

  // A prompt the person sent ends the streak of mod prompts.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin?.kind === 'composer' || e.origin?.kind === 'bridge') {
      s.streak = 0
      s.lastHuman = e.text
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
    if (!s.auto || e.agentId !== undefined || e.reason !== 'answer') return r
    try {
      const gaps = await gitGaps($, s)
      const key = gaps.map(g => `${g.repo}:${g.dirty.join(',')}:${g.unpushed.join(',')}`).join(';')
      if (gaps.length && nudge($, s, 'git', key, gitPrompt(gaps), 'reminded the agent of unfinished git work')) return r
      const ask = askTail(e.answer)
      if (ask && nudge($, s, 'ask', ask, askPrompt(ask), 'reminded the agent not to ask leave for approved work')) return r
      await suggest($, s, e.answer)
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
    const status = ` · ${PHRASES.length} combos · ${s.auto ? `auto · ${s.nudges} nudge${s.nudges === 1 ? '' : 's'}` : 'auto off'} `
    // ' [-]' is the engine's collapse control, drawn over the band's last cells: kept clear.
    const words = cells(title) + cells(status) + cells('[ ⚡ auto ][ ▾ fold ][ hide ] [-]') <= width
    const header = Box({
      flexDirection: 'row',
      children: [
        Text({ bold: true, color: ACCENT, children: title }),
        Text({ dimColor: true, children: fit(status, Math.max(0, width - cells(title) - (words ? 32 : 19))) }),
        Button({ key: 'auto', label: words ? (s.auto ? '⚡ auto' : '○ auto') : s.auto ? '⚡' : '○', onPress: () => void setAuto($, s, !s.auto) }),
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
          Button({ key: `say-${p.hotkey}`, hotkey: p.hotkey, plain: true, label: fit(p.label, share), onPress: () => say($, p) }),
        ]),
      }),
    )
    return Box({ flexDirection: 'column', children: [below, header, ...rows] })
  })
}
