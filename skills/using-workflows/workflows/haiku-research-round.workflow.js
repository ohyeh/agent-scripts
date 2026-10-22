// One research round of a commander-driven research loop: N read-only scouts (Haiku by default)
// answer the questions in args.scouts in parallel and return sourced, structured findings.
// The loop lives in the COMMANDER, not here: read the findings, discuss them with `advisor`,
// pick the next batch of questions, call this recipe again with round+1 (RSI research loop).
// Maturity: WORKING (harvested from the 2026-10-10 haiku-decide experiment, 4+ rounds);
// browser scouts via args.tools: UNTESTED until the first run.
//
//   Workflow({ name: "haiku-research-round", args: {
//     round: "r1",                      // label only; shows as `<round>:<key>` in the progress tree
//     context: "TOPIC: ... KNOWN: ...", // REQUIRED: topic, settled facts (do not re-research),
//                                       // out-of-scope areas, tool hints. Appended to every scout prompt.
//     scouts: [                         // REQUIRED: one agent each, run in parallel; keep 3-5
//       { key: "shop-a", prompt: "TASK: ..." },
//     ],
//     model: "haiku",                   // read-only data gathering (using-workflows MODEL FLOOR):
//     effort: "medium",                 //   haiku/sonnet 5.5+ by commander's call; never synthesis
//     fields: {                         // OPTIONAL extra per-finding fields, name -> description
//       price: "NT$ per variant as shown on the page",   // e.g. a price survey
//     },
//     maxFindings: 12,                  // OPTIONAL cap per scout (default: no cap, e.g. a full price list)
//     scratchDir: "/abs/scratch/scouts", // OPTIONAL: where scouts may write notes (default: none)
//     tools: "codex-cu + Chrome: ...",  // OPTIONAL: replaces the default TOOLS line. Browser use is
//                                       // allowed (user ruling 2026-10-09/10: haiku squad, codex-cu +
//                                       // Chrome, one tab per scout). Give: select Chrome by
//                                       // extensionInstanceId, open your own tab with a sessionName,
//                                       // never touch other tabs, read-only, and the commander's
//                                       // working recipe. A scout that cannot use it reports a blocker.
//                                       // When it names codex-cu, scouts run in sequence: one shared
//                                       // REPL per MCP connection serializes calls and shares globals.
//   }})
//
// Returns { scouts: [{ key, findings: [{claim, source, status, quote?, implication, ...fields}],
// open_questions, blockers } | { key, failed: true }], tab_leaks, needs_reread }.
// A failed scout is reported, never dropped. tab_leaks: Chrome tab URLs open after the round
// that were not open before ([] = none; null = a tab listing failed; not checked without
// args.tools, since the default tools open no tabs). needs_reread: "refuted" findings with no
// verbatim quote, taken out of findings — the commander re-reads the source before using them.

export const meta = {
  name: 'haiku-research-round',
  description: 'One research round: N read-only Haiku scouts answer the given questions with sourced findings',
  whenToUse: 'A research loop where the commander reads each round, consults advisor, and picks the next questions',
  phases: [{ title: 'Research', detail: 'parallel read-only scouts: web, browser (codex-cu + Chrome), local docs' }],
}

if (!args || !args.context || !Array.isArray(args.scouts) || !args.scouts.length) {
  throw new Error('haiku-research-round: args.context (string) and args.scouts ([{key, prompt}]) are required')
}
if (args.scouts.length > 5) {
  throw new Error(`haiku-research-round: at most 5 scouts per round (got ${args.scouts.length}); split the questions across rounds`)
}

const extra = args.fields || {}
const findingProps = {
  claim: { type: 'string' },
  source: { type: 'string', description: 'URL or absolute file path:line' },
  status: { type: 'string', enum: ['documented', 'inferred', 'not_found', 'refuted'] },
  quote: { type: 'string', description: 'REQUIRED for status "refuted": the source text that refutes the claim, copied verbatim' },
  implication: { type: 'string', description: 'OPTIONAL: what this means for the topic' },
}
for (const [k, d] of Object.entries(extra)) findingProps[k] = { type: 'string', description: d }
const required = Object.keys(findingProps).filter(k => k !== 'implication' && k !== 'quote')

const OUT = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: findingProps, required } },
    open_questions: { type: 'array', items: { type: 'string' } },
    blockers: { type: 'array', items: { type: 'string' } },
  },
  required: ['findings', 'open_questions', 'blockers'],
}

const TOOLS = args.tools
  ? `${args.tools}\nIf you cannot use these tools, report it under blockers; do not substitute another tool.`
  : 'WebSearch / WebFetch (load via ToolSearch "select:WebSearch,WebFetch"), local Read/Bash.'
const RULES = `
TOOLS: ${TOOLS}
RULES: read-only — do not edit files${args.scratchDir ? `; scratch notes only under ${args.scratchDir}` : ''}. Every finding has a source (URL or absolute path:line); status "documented" only if the source says it; "not_found" must list the queries tried; "refuted" only with \`quote\`, the refuting source text copied verbatim. Never invent URLs, numbers, product features, or paper results.${args.maxFindings ? ` Up to ${args.maxFindings} high-value findings;` : ''} Stop when the question is answered. Return the structured result only.`
const codexCu = /codex-cu/i.test(args.tools || '')
const BROWSER = key => !args.tools ? '' : `
BROWSER: close every tab you open before you return; list the tabs before and after your work and close any you left.${codexCu ? ` The codex-cu REPL is shared with other scouts: keep every REPL global under globalThis["scout_${key}"], never a bare global. No \`.click()\` inside evaluate; use the API click.` : ''}`

const round = args.round || 'r'
const TABS = { type: 'object', properties: { tabs: { type: 'array', items: { type: 'string' } } }, required: ['tabs'] }
const listTabs = when => agent(`Run this read-only command once and return every URL it prints, in order, duplicates kept (it separates URLs with ", "). Do nothing else.
osascript -e 'if application "Google Chrome" is running then tell application "Google Chrome" to get URL of every tab of every window'
(The guard keeps it from launching Chrome; Chrome not running = no tabs.)`, {
  label: `${round}:tabs-${when}`, phase: 'Research', schema: TABS, model: 'haiku', effort: 'low', agentType: 'general-purpose',
}).then(r => r && r.tabs, () => null)
// count-aware: a URL open once before and twice after is one leak
const leaked = (before, after) => after.filter(u => { const i = before.indexOf(u); if (i < 0) return true; before.splice(i, 1); return false })

phase('Research')
const before = args.tools ? await listTabs('before') : []
const run = s => agent(`${s.prompt}\n\n${args.context}\n${RULES}${BROWSER(s.key)}`, {
  label: `${round}:${s.key}`, phase: 'Research', schema: OUT,
  model: args.model || 'haiku', effort: args.effort || 'medium', agentType: 'general-purpose',
}).then(r => { log(`${s.key}: ${r ? r.findings.length : 'FAILED'} findings`); return r })
let res = []
if (codexCu) for (const s of args.scouts) res.push(await run(s).catch(() => null))
else res = await parallel(args.scouts.map(s => () => run(s)))
const after = args.tools ? await listTabs('after') : []
const tab_leaks = before && after ? leaked([...before], after) : null
if (tab_leaks === null || tab_leaks.length) log(`tab_leaks: ${tab_leaks ? tab_leaks.join(' ') : 'tab listing failed'}`)

const needs_reread = []
const scouts = res.map((r, i) => {
  const key = args.scouts[i].key
  if (!r) return { key, failed: true }
  const unquoted = f => f.status === 'refuted' && !(f.quote || '').trim()
  needs_reread.push(...r.findings.filter(unquoted).map(f => ({ key, ...f })))
  return { key, ...r, findings: r.findings.filter(f => !unquoted(f)) }
})
return { scouts, tab_leaks, needs_reread }
