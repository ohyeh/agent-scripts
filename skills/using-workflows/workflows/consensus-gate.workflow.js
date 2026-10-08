// Reusable building block: get a high-effort second-model consensus on a proposal before acting.
// Encodes the "ask an independent reviewer for architecture consensus" rule as a one-call workflow.
// Maturity: WORKING (drives any agent-tmux profile inside a single agent).
//
//   Workflow({ scriptPath: ".claude/workflows/consensus-gate.workflow.js", args: {
//     repoPath: "/abs/repo",            // cwd for the reviewer session
//     proposalFile: "/abs/proposal.md", // OR proposalText below
//     proposalText: "....",
//     cli: "codex",                     // REQUIRED: reviewer profile — any profile that is not the
//                                       // author's session (model-dispatch.md §6); pick it by ladder layer
//     sessionName: "arch1",             // agent-tmux session name; the SAME name for every round of one layer
//     round: 1,                         // round number inside the layer (names OUT; earlier OUT files are kept)
//     layer: "L2",                      // L1 | L2 | L3 (model-dispatch.md §Review ladder); L1 can never pass the gate
//     freeze: ["/abs/file.md"],         // files hashed into the round manifest (default: proposalFile)
//     l0: "scripts/test-x",             // OPTIONAL deterministic check run before the review; non-zero = gate fails
//     effort: "high",                   // low|medium|high (high => reviewer's own high-effort knob)
//     marker: "=== REVIEWER VERDICT END ===",  // just a sentinel; pass "=== CODEX VERDICT END ===" for legacy byte-compat
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
//   - round 2+: SAME sessionName, round+1 (the reviewer keeps its context); send the fix diff and
//     the fixer's per-finding report; the reviewer resolves or keeps each finding and adds new defects.
//   - close with the stake: "only agree if you would be comfortable with this being pushed with
//     no further changes". L2 caps at 3 rounds, then one L3 round with a new cli and sessionName.
export const meta = {
  name: 'consensus-gate',
  description: 'Get a high-effort second-model consensus verdict on a proposal via any agent-tmux profile',
  whenToUse: 'When a decision, diff, or proposal needs an independent second-model verdict before acting — the reusable gate primitive other recipes call. args.cli is REQUIRED and picks the reviewer (codex / claude / agy / any agent-tmux profile — heterogeneous reviewers are a config concern, not a recipe concern). For push gates, see the multi-round preset in the header.',
  phases: [{ title: 'Consult', detail: 'drive the reviewer CLI via agent-tmux, capture verdict', model: 'opus' }],
}
const a = typeof args === 'string' ? (() => { try { return JSON.parse(args) } catch { return {} } })() : (args || {})
if (!a.proposalFile && !a.proposalText) return { aborted: true, reason: 'need proposalFile or proposalText' }
const repo = a.repoPath || '.'
const session = a.sessionName || 'consensus'
const effort = a.effort || 'high'   // also the reviewer's own reasoning-effort knob (shell env below)
const model = a.model || 'opus'     // the driving Claude agent's model (floor opus — user ruling 2026-09-02)
// Official agent() opts, listed on every call so none reads as "unsupported". Both default OFF:
const isolation = a.isolation === 'worktree' ? 'worktree' : undefined  // spec: only 'worktree' enables; off = omit (NOT false/'none')
const agentType = a.agentType || undefined  // off = default workflow agent. NEVER hardcode a custom one — a missing agentType is a HARD error (#20931), breaks portability
const marker = a.marker || '=== REVIEWER VERDICT END ==='
const timeout = a.timeoutSec || 600
// Second-model CLI is REQUIRED and neutral — NO built-in default. Launch flags come from the CLI's
// own profile; EXTRA flags pass raw via a.launchEnv. charset guard blocks shell injection (cli is
// interpolated into commands).
if (!/^[a-z0-9][a-z0-9._-]*$/i.test(a.cli || '')) return { aborted: true, reason: "missing/invalid arg: cli ('codex' | 'claude' | any agent-tmux profile name)" }
const cli = a.cli
// e.g. a.launchEnv = "CODEX_TMUX_LAUNCH_FLAGS='--yolo -c model_reasoning_effort=high' " — caller-owned passthrough.
const launchEnv = typeof a.launchEnv === 'string' ? a.launchEnv : ''
const round = a.round == null ? 1 : a.round
if (!(Number.isInteger(round) && round >= 1)) return { aborted: true, reason: 'invalid arg: round must be an integer >= 1' }
const layer = a.layer || 'L2'
if (!['L1', 'L2', 'L3'].includes(layer)) return { aborted: true, reason: 'invalid arg: layer must be L1 | L2 | L3' }
const freeze = a.freeze || (a.proposalFile ? [a.proposalFile] : [])
// Paths and l0 are interpolated into shell commands: paths get a strict charset, l0 is caller-owned like launchEnv.
if (!Array.isArray(freeze) || freeze.some(f => typeof f !== 'string' || !/^[A-Za-z0-9._\/~+@-]+$/.test(f))) return { aborted: true, reason: 'invalid arg: freeze must be an array of plain paths' }
const l0 = typeof a.l0 === 'string' ? a.l0 : ''
const MANIFEST = `{ git -C ${repo} rev-parse HEAD 2>/dev/null || echo no-git; git -C ${repo} diff HEAD 2>/dev/null; ${freeze.length ? `shasum -a 256 ${freeze.join(' ')}` : 'true'}; } | shasum -a 256`

// _lib/worker-doctrine.md §7, kept byte-close (scripts cannot import).
const REVIEWER_CONTRACT = 'ADVERSARIAL REVIEW. Assume the work is wrong until the evidence says otherwise. Round 1: list EVERY finding now, in one pass; a finding held back for a later round counts as a miss. Each finding: stable id, file:line or command output, severity Critical|Major|Minor, why it is wrong, the concrete fix, the check that proves the fix. A finding without evidence is dropped. Round 2+: you get the finding ledger and the before/after diff of the fix. Report (a) each ledger finding: resolved (with evidence) or still open (not_fixed | partly), and adjudicate every fixer rejection; (b) NEW defects. Mark a new defect fix_caused=true only when the diff shows the fix caused it; a new defect the fix did not cause is a round-1 miss. PASS only with 0 Critical and 0 Major open.'

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
  },
}

phase('Consult')
const r = await agent(
  `Drive a ${cli} session via agent-tmux to get a high-effort architecture/decision consensus, then return its verdict.
If the agent-tmux / ${cli}-tmux wrappers are not on PATH, run them from the tmux-agent-tools skill bundle (its scripts/ dir).
Steps:
1. Ensure the proposal text is available. ${a.proposalFile ? `Proposal file: ${a.proposalFile}.` : `Proposal text:\n<<<\n${a.proposalText}\n>>>\n(write it to a temp file to send via --from-file).`}
   OUT = /tmp/${cli}-consensus-${session}-r${round}.md (one file per round; never delete an earlier round's file). Append to the proposal the reviewer contract below, plus an instruction so ${cli}, when done, WRITES its full verdict to OUT and ENDS that file with a line exactly: ${marker}
   Reviewer contract: ${REVIEWER_CONTRACT}
   L0: run \`${MANIFEST}\` → manifest_before. ${l0 ? `Then run \`${l0}\` in ${repo} → l0_rc (exit code) and l0_output (last 40 lines). If l0_rc is not 0, stop here: skip steps 2–4, verdict = "", consensus = unclear, and still fill manifest_after by re-running the manifest command.` : 'No l0 command: l0_rc = 0, l0_output = "no l0 command".'}
2. ${launchEnv}agent-tmux ${cli} start --exact ${session} ${repo} "I will send a consensus request; read fully before replying." — if it exits 1 because the name is already live (round 2+), reuse that session.
3. Send the proposal: agent-tmux ${cli} send --from-file <file> --enter-count 1 ${session}
4. Wait for completion by POLLING the output file OUT, NOT by matching the marker in the tmux pane. The marker also appears in the prompt you just sent, so a pane/wait-text match would false-trigger on the echo (a bug hit repeatedly in practice). Poll: every few seconds check that OUT exists AND contains "${marker}", up to ${timeout}s. Only then read OUT. (agent-tmux ${cli} wait ${session} ${timeout} may be used as a secondary idle signal, but the file is the authoritative completion signal.)
5. Run the manifest command again → manifest_after. Return: verdict = the verdict text read from OUT (trimmed, drop the trailing marker line); consensus = your classification (agree / agree_with_changes / disagree / unclear); notes = key objections or required changes.
Keep raw tmux scrollback out of the final message; return only the structured fields.`,
  { label: `${cli}:${session}`, phase: 'Consult', model, effort, isolation, agentType, schema: SCHEMA }
)
// `passed` is a strict allow-list: only genuine consensus at a verdict layer (L2/L3), with L0 green
// and the manifest unchanged, clears the gate. An L1 agree is a pre-filter result, never a pass.
const voided = !!r && r.manifest_before !== r.manifest_after
const l0Failed = !!r && r.l0_rc !== 0
return {
  gate: r, consensus: r?.consensus, layer, round, voided, l0Failed, prefilter: layer === 'L1',
  passed: layer !== 'L1' && r?.ok === true && r?.consensus === 'agree' && !voided && !l0Failed,
}
