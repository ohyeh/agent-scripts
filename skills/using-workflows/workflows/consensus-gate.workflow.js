// Reusable building block: get a high-effort second-model consensus on a proposal before acting.
// Encodes the "ask an independent reviewer for architecture consensus" rule as a one-call workflow.
// Maturity: WORKING (drives any agent-tmux profile through the tmux-agent mod tools inside a single agent).
//
//   Workflow({ scriptPath: ".claude/workflows/consensus-gate.workflow.js", args: {
//     repoPath: "/abs/repo",            // cwd for the reviewer session
//     proposalFile: "/abs/proposal.md", // OR proposalText below
//     proposalText: "....",
//     cli: "codex",                     // REQUIRED: reviewer profile — any profile that is not the
//                                       // author's session (model-dispatch.md §6); pick it by ladder layer
//     sessionName: "arch1",             // worker base name for round 1 (the mod adds a suffix)
//     worker: "arch1.k3x9a",            // round 2+: the `worker` the previous round returned (same reviewer context)
//     round: 1,                         // round number inside the layer (names OUT; earlier OUT files are kept)
//     layer: "L2",                      // L1 | L2 (model-dispatch.md §Review ladder); L1 can never pass the gate
//     freeze: ["/abs/file.md"],         // files hashed into the round manifest (default: proposalFile)
//     l0: "scripts/test-x",             // OPTIONAL deterministic check run before the review; non-zero = gate fails
//     effort: "medium",                 // low|medium|high: the conduit agent's effort (reviewer effort = profile effort_flags)
//     marker: "=== REVIEWER VERDICT END ===",  // just a sentinel; pass "=== CODEX VERDICT END ===" for legacy byte-compat
//     outDir: "/abs/run-dir",           // where the reviewer writes its report (default: <repoPath>/.workflow/consensus-gate)
//     timeoutSec: 600
//   }})
//
// PRESET — multi-round push gate. One call = one round of one ladder layer
// (model-dispatch.md §Review ladder; contracts in _lib/worker-doctrine.md §7–§9):
//   - L0 runs inside the call: the manifest (HEAD, `git diff HEAD`, the freeze files) is hashed
//     before and after the review; a change voids the round, an l0 failure fails it.
//   - round 1: name the commit range and order the reviewer to re-derive everything itself:
//     "run `git log --oneline <base>..HEAD` and `git show <sha>` yourself for every commit — do
//     not trust this description; read the issue text yourself". It lists EVERY finding at once.
//   - require LIVE reproduction of each fix (real construction path / real command output),
//     "not just that a unit test asserts a string constant".
//   - round 2+: pass the returned `worker`, round+1 (the reviewer keeps its context); send the fix diff and
//     the fixer's per-finding report; the reviewer resolves or keeps each finding and adds new defects.
//   - close with the stake: "only agree if you would be comfortable with this being pushed with
//     no further changes". L2 caps at 3 rounds; still blocking after round 3 → stop and ask the user (no L3).
export const meta = {
  name: 'consensus-gate',
  description: 'Get a high-effort second-model consensus verdict on a proposal via any agent-tmux profile',
  whenToUse: 'When a decision, diff, or proposal needs an independent second-model verdict before acting — the reusable gate primitive other recipes call. args.cli is REQUIRED and picks the reviewer (codex / claude / agy / any agent-tmux profile — heterogeneous reviewers are a config concern, not a recipe concern). For push gates, see the multi-round preset in the header.',
  phases: [{ title: 'Consult', detail: 'drive the reviewer CLI via the tmux-agent mod, capture verdict', model: 'sonnet' }],
}
const a = typeof args === 'string' ? (() => { try { return JSON.parse(args) } catch { return {} } })() : (args || {})
if (!a.proposalFile && !a.proposalText) return { aborted: true, reason: 'need proposalFile or proposalText' }
const repo = a.repoPath || '.'
const session = a.sessionName || 'consensus'
const effort = a.effort || 'medium' // the conduit agent only relays a file (sonnet floor: medium); the reviewer's effort comes from its profile (effort_flags)
const model = a.model || 'sonnet'   // the driving Claude agent's model: a mechanical conduit, sonnet medium (model-dispatch.md model floor)
// Official agent() opts, listed on every call so none reads as "unsupported". Both default OFF:
const isolation = a.isolation === 'worktree' ? 'worktree' : undefined  // spec: only 'worktree' enables; off = omit (NOT false/'none')
const agentType = a.agentType || undefined  // off = default workflow agent. NEVER hardcode a custom one — a missing agentType is a HARD error (#20931), breaks portability
const marker = a.marker || '=== REVIEWER VERDICT END ==='
const timeout = a.timeoutSec || 600
// Second-model CLI is REQUIRED and neutral — NO built-in default. Launch flags come from the CLI's
// own profile (a.launchEnv is gone: put extra flags in a profile .conf and pass its name as cli).
// charset guard blocks injection (cli and worker are interpolated into tool calls).
if (!/^[a-z0-9][a-z0-9._-]*$/i.test(a.cli || '')) return { aborted: true, reason: "missing/invalid arg: cli ('codex' | 'claude' | any agent-tmux profile name)" }
const cli = a.cli
if (a.launchEnv != null) return { aborted: true, reason: 'launchEnv is gone: put the flags in an agent-tmux profile .conf (launch_flags / effort_flags) and pass its name as cli' }
if (a.worker != null && !/^[A-Za-z0-9_.-]{1,64}$/.test(a.worker)) return { aborted: true, reason: 'invalid arg: worker' }
const round = a.round == null ? 1 : a.round
if (!(Number.isInteger(round) && round >= 1)) return { aborted: true, reason: 'invalid arg: round must be an integer >= 1' }
const layer = a.layer || 'L2'
if (!['L1', 'L2'].includes(layer)) return { aborted: true, reason: 'invalid arg: layer must be L1 | L2 (no L3: after L2 round 3, ask the user)' }
const freeze = a.freeze || (a.proposalFile ? [a.proposalFile] : [])
// Paths go into shell commands single-quoted, so any path without a NUL or newline works
// (Unicode included); l0 is caller-owned.
const q = p => `'${p.replace(/'/g, `'\\''`)}'`
const plainPath = p => typeof p === 'string' && p.length > 0 && !/[\0\n\r]/.test(p)
if (!plainPath(repo)) return { aborted: true, reason: 'invalid arg: repoPath' }
if (!Array.isArray(freeze) || !freeze.every(plainPath)) return { aborted: true, reason: 'invalid arg: freeze must be an array of paths (no NUL or newline)' }
const l0 = typeof a.l0 === 'string' ? a.l0 : ''
// Three labelled lines, content only: a path spelled another way (cd + relative, wf_6b475093-bbb
// 2026-10-22) hashes the same, and a voided round names the part that changed.
const MANIFEST = `printf 'head %s\\ndiff %s\\nfreeze %s\\n' "$(git -C ${q(repo)} rev-parse HEAD 2>/dev/null || echo no-git)" "$(git -C ${q(repo)} diff HEAD 2>/dev/null | shasum -a 256 | cut -c1-16)" "$(${freeze.length ? `cat -- ${freeze.map(q).join(' ')} 2>&1` : 'true'} | shasum -a 256 | cut -c1-16)"`

// _lib/worker-doctrine.md §7, kept byte-close (scripts cannot import).
const REVIEWER_CONTRACT = 'ADVERSARIAL REVIEW. Assume the work is wrong until the evidence says otherwise. Round 1: list EVERY finding now, in one pass; a finding held back for a later round counts as a miss. Each finding: stable id, file:line or command output, severity Critical|Major|Minor, why it is wrong, the concrete fix, the check that proves the fix. A finding without evidence is dropped. Round 2+: you get the finding ledger and the before/after diff of the fix. Report (a) each ledger finding: resolved (with evidence) or still open (not_fixed | partly), and adjudicate every fixer rejection; (b) NEW defects. Mark a new defect fix_caused=true only when the diff shows the fix caused it; a new defect the fix did not cause is a round-1 miss. Read-only: do not edit files or run build, test, lint or any command that writes into the tree; the L0 output you are given is the check evidence. A live reproduction runs in a scratch dir outside the repo. PASS only with 0 Critical and 0 Major open.'

// One CLI worker driven through the tmux-agent mod tools (needs the mod at tmux-agent-tools >= a68ecd4:
// assign/tell + await). Kept byte-close in consensus-gate, plan-pipeline and feature-plan-consensus (scripts
// cannot import). worker = the name an earlier call returned; absent = start a new worker. Launch and effort
// flags live in the agent-tmux profile `profile` names (launch_flags / effort_flags in its .conf).
const modConduit = ({ profile, base, dir, worker, out, marker, timeout, task }) =>
  `Drive a ${profile} worker ONLY with the tmux-agent mod tools: ToolSearch "select:mcp__tmux-agent__assign,mcp__tmux-agent__tell,mcp__tmux-agent__await". Never run agent-tmux through Bash.\n` +
  `The worker's instruction: write the full response to ${out}, ending the file with a line exactly: ${marker}; the result.json summary is one line.\n` +
  (worker
    ? `1. mcp__tmux-agent__tell {name: "${worker}", text: the task below plus that instruction}. worker = "${worker}".\n`
    : `1. mcp__tmux-agent__assign {profile: "${profile}", name: "${base}", dir: the absolute path of ${dir}, brief: "GOAL: " + the task below + that instruction + "\\nACCEPTANCE: ${out} ends with the marker line.\\nREPORT: a one-line summary."}. worker = the name the receipt returns (with its suffix).\n`) +
  `2. Call mcp__tmux-agent__await {name: worker, max_seconds: ${Math.min(540, timeout)}} until it returns status success, failed or blocked; after ${Math.max(1, Math.ceil(timeout / 540))} pending calls, stop and report the timeout.\n` +
  `3. Read ${out}; it must end with the marker line. Return worker in the worker field.\n\nTASK:\n${task}`
const outDir = a.outDir || `${repo.replace(/\/+$/, '')}/.workflow/consensus-gate`
if (!plainPath(outDir)) return { aborted: true, reason: 'invalid arg: outDir' }
// Not /tmp (kernel: scratch stays in the session or run dir); cli in the name keeps two reviewers apart.
const OUT = `${outDir}/${cli}-${session}-r${round}.md`

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['ok', 'verdict', 'consensus', 'notes', 'manifest_before', 'manifest_after', 'l0_rc', 'l0_output'],
  properties: {
    ok: { type: 'boolean' },
    manifest_before: { type: 'string', description: 'output of the manifest command in step 1' },
    manifest_after: { type: 'string', description: 'output of the manifest command in step 5' },
    l0_rc: { type: 'integer', description: 'exit code of the l0 command; 0 when none was given' },
    l0_output: { type: 'string', description: 'last 40 lines of l0, verbatim' },
    verdict: { type: 'string', description: 'reviewer verdict text, trimmed' },
    consensus: { type: 'string', enum: ['agree', 'agree_with_changes', 'disagree', 'unclear'] },
    notes: { type: 'string' },
    worker: { type: 'string', description: 'the worker name (pass it as args.worker for the next round)' },
  },
}

phase('Consult')
const r = await agent(
  `Get a high-effort architecture/decision consensus from a ${cli} reviewer, then return its verdict.
Steps:
1. Ensure the proposal text is available. ${a.proposalFile ? `Proposal file: ${a.proposalFile}.` : `Proposal text:\n<<<\n${a.proposalText}\n>>>`}
   OUT = ${OUT} (one file per round; never delete an earlier round's file). Run \`mkdir -p ${q(outDir)}\` first.
   L0 (run checks, then hash): ${l0 ? `run \`${l0}\` in ${repo} → l0_rc (exit code) and l0_output (last 40 lines).` : 'no l0 command: l0_rc = 0, l0_output = "no l0 command".'} Then run this manifest command exactly as written (no cd, no shortened paths) \`${MANIFEST}\` → manifest_before (its three lines, verbatim).${l0 ? ' If l0_rc is not 0, stop here: skip steps 2–3, verdict = "", consensus = unclear, and still fill manifest_after by re-running the manifest command.' : ''}
2. Get the review (task = the proposal plus the reviewer contract below):
${modConduit({ profile: cli, base: session, dir: repo, worker: a.worker, out: OUT, marker, timeout, task: `the proposal above, then the L0 result from step 1 (l0_rc and l0_output, verbatim), then this reviewer contract: ${REVIEWER_CONTRACT}` })}
3. Run the same manifest command again, exactly as written → manifest_after (three lines, verbatim). Return: verdict = the verdict text read from OUT (trimmed, drop the trailing marker line); consensus = your classification (agree / agree_with_changes / disagree / unclear); notes = key objections or required changes; worker.
Return only the structured fields.`,
  { label: `${cli}:${session}`, phase: 'Consult', model, effort, isolation, agentType, schema: SCHEMA }
)
// `passed` is a strict allow-list: only genuine consensus at the verdict layer (L2), with L0 green
// and the manifest unchanged, clears the gate. An L1 agree is a pre-filter result, never a pass.
const parts = m => Object.fromEntries((m || '').split('\n').map(l => l.trim().split(/\s+/)).filter(x => x.length === 2))
const before = parts(r?.manifest_before), after = parts(r?.manifest_after)
const changed = ['head', 'diff', 'freeze'].filter(k => before[k] !== after[k])
const voided = !!r && changed.length > 0
const l0Failed = !!r && r.l0_rc !== 0
return {
  gate: r, consensus: r?.consensus, worker: r?.worker, layer, round, voided, voidedBy: voided ? changed : [], l0Failed, prefilter: layer === 'L1', out: OUT,
  passed: layer !== 'L1' && r?.ok === true && r?.consensus === 'agree' && !voided && !l0Failed,
}
