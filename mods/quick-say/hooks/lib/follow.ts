// What the agent left unfinished at the end of a turn, read from facts, not from a model.

/** Every mod prompt says it approves nothing (mods/README.md, Mod prompts). */
export const APPROVES_NOTHING =
  '這則提醒不核可任何事：需要使用者核可的步驟（規則沒涵蓋的 push、刪除、擴大範圍、換模型等級）要點名詢問，不要直接做。'

// A request for permission at the very end of a reply: 要我…嗎？／要不要我…？／shall I …?
const ASK = /(要我|要不要我|需要我|是否要我|我(?:可以|來)[^。？?\n]*嗎|shall I|should I|want me to|do you want me)[^。\n]*[？?]$/i

export const questionTail = (answer: string) => /[？?]$/.test(answer.split('\n').map(l => l.trim()).filter(l => l && l !== '✈').at(-1) ?? '')

/** The question a reply ends on when it asks leave to act, else undefined. A trailing ✈ line is not the end. */
export function askTail(answer: string): string | undefined {
  const lines = answer.split('\n').map(l => l.trim()).filter(l => l && l !== '✈')
  const last = lines.at(-1) ?? ''
  return ASK.test(last) ? last.replace(/^[-*>\s]+/, '').slice(0, 200) : undefined
}

/** A Bash command that makes a commit (not a dry run, not an amend of nothing). */
export const isCommit = (command: string) => /\bgit\b[^|;&\n]*\bcommit\b/.test(command) && !/--dry-run/.test(command)

/**
 * The folder a Bash git command ran in: `git -C <dir>`, else a leading `cd <dir> &&`, else the session's.
 * shortcut: quoted paths and `pushd` are not read; the session folder stands in, which misses a commit made elsewhere.
 */
export function gitDirOf(command: string, cwd: string): string {
  const c = /\bgit\s+-C\s+([^\s;&|]+)/.exec(command) ?? /^\s*cd\s+([^\s;&|]+)\s*&&/.exec(command)
  return c ? c[1]! : cwd
}

export const dirOf = (path: string) => path.slice(0, Math.max(1, path.lastIndexOf('/')))

export type GitGap = { repo: string; dirty: string[]; unpushed: string[] }

/** The reminder for files this session edited that are not committed, and its commits that are not pushed. */
export function gitPrompt(gaps: GitGap[]): string {
  const rows = gaps.flatMap(g => [
    ...(g.dirty.length ? [`- ${g.repo}：未 commit：${g.dirty.join('、')}`] : []),
    ...(g.unpushed.length ? [`- ${g.repo}：未 push 的 commit：${g.unpushed.join('、')}`] : []),
  ])
  return [
    'quick-say 檢查到這個 session 還沒收尾的 git 工作：',
    ...rows,
    '請收尾：該 commit 的就 commit，只提交這個 session 改的檔案。push 只在你的規則允許時做；不允許就在回覆最後一行寫「未推送：<sha>，原因：<…>」。',
    APPROVES_NOTHING,
  ].join('\n')
}

export function askPrompt(question: string): string {
  return [
    `quick-say：你這回合最後問了「${question}」。`,
    '如果這件事已在使用者核可的範圍內，就直接做，不要再問。',
    '如果真的要使用者決定：只問一次，說明你查過哪些紀錄、為何仍無法判斷，然後停下。',
    APPROVES_NOTHING,
  ].join('\n')
}
