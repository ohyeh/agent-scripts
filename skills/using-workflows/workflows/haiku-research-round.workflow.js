// One research round of a commander-driven research loop: N read-only scouts (Haiku by default)
// answer the questions in args.scouts in parallel and return sourced, structured findings.
// The loop lives in the COMMANDER, not here: read the findings, discuss them with `advisor`,
// pick the next batch of questions, call this recipe again with round+1 (RSI research loop).
// Maturity: WORKING (harvested from the 2026-10-10 haiku-decide experiment, 4+ rounds).
//
//   Workflow({ name: "haiku-research-round", args: {
//     round: "r1",                      // label only; shows as `<round>:<key>` in the progress tree
//     context: "TOPIC: ... KNOWN: ...", // REQUIRED: topic, settled facts (do not re-research),
//                                       // out-of-scope areas, tool hints. Appended to every scout prompt.
//     scouts: [                         // REQUIRED: one agent each, run in parallel; keep 3-5
//       { key: "papers", prompt: "TASK: ..." },
//     ],
//     model: "haiku",                   // read-only data gathering (using-workflows MODEL FLOOR):
//     effort: "medium",                 //   haiku/sonnet 5.5+ by commander's call; never synthesis
//     fields: {                         // OPTIONAL extra per-finding fields, name -> description
//       measured_gain: "metric + number + task from the source, or \"none reported\"",
//     },
//     scratchDir: "/abs/scratch/scouts" // OPTIONAL: where scouts may write notes (default: none)
//   }})
//
// Returns [{ key, findings: [{claim, source, status, implication, ...fields}], open_questions,
// blockers } | { key, failed: true }]. A failed scout is reported, never dropped.

export const meta = {
  name: 'haiku-research-round',
  description: 'One research round: N read-only Haiku scouts answer the given questions with sourced findings',
  whenToUse: 'A research loop where the commander reads each round, consults advisor, and picks the next questions',
  phases: [{ title: 'Research', detail: 'parallel read-only scouts, web + local docs' }],
}

if (!args || !args.context || !Array.isArray(args.scouts) || !args.scouts.length) {
  throw new Error('haiku-research-round: args.context (string) and args.scouts ([{key, prompt}]) are required')
}

const extra = args.fields || {}
const findingProps = {
  claim: { type: 'string' },
  source: { type: 'string', description: 'URL or absolute file path:line' },
  status: { type: 'string', enum: ['documented', 'inferred', 'not_found'] },
  implication: { type: 'string', description: 'what this means for the topic' },
}
for (const [k, d] of Object.entries(extra)) findingProps[k] = { type: 'string', description: d }

const OUT = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: findingProps, required: Object.keys(findingProps) } },
    open_questions: { type: 'array', items: { type: 'string' } },
    blockers: { type: 'array', items: { type: 'string' } },
  },
  required: ['findings', 'open_questions', 'blockers'],
}

const RULES = `
TOOLS: WebSearch / WebFetch (load via ToolSearch "select:WebSearch,WebFetch"), local Read/Bash. No browser automation.
RULES: read-only — do not edit files${args.scratchDir ? `; scratch notes only under ${args.scratchDir}` : ''}. Every finding has a source (URL or absolute path:line); status "documented" only if the source says it; "not_found" must list the queries tried. Never invent URLs, numbers, product features, or paper results. 6-12 high-value findings. Return the structured result only.`

phase('Research')
const res = await parallel(args.scouts.map(s => () =>
  agent(`${s.prompt}\n\n${args.context}\n${RULES}`, {
    label: `${args.round || 'r'}:${s.key}`, phase: 'Research', schema: OUT,
    model: args.model || 'haiku', effort: args.effort || 'medium', agentType: 'general-purpose',
  }).then(r => { log(`${s.key}: ${r ? r.findings.length : 'FAILED'} findings`); return r })
))
return res.map((r, i) => ({ key: args.scouts[i].key, ...(r || { failed: true }) }))
