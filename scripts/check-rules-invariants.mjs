#!/usr/bin/env node
// Rules eval gate — static invariants for global/ + .agents/rules/ + skills/.
// Exit 0 = all PASS. Any FAIL = exit 1. See evals/README.md for the behavioral
// fixture schema (not yet executed by this runner).
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KERNEL_CHAR_LIMIT = 5000;
const BASELINE_PATH = join(ROOT, 'evals/context-budget-baseline.json');

const results = [];
const check = (name, ok, detail = '') =>
  results.push({ name, ok, detail });

const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// 1. global files byte-identical
const claudeMd = read('global/CLAUDE.md');
const agentsMd = read('global/AGENTS.md');
check('global-identical', claudeMd === agentsMd,
  'global/CLAUDE.md vs global/AGENTS.md');
// solid edition (deployed) has no size cap; the cap binds the lean edition only
const leanChars = [...read('global/kernel-lean.md')].length;
check('kernel-lean-char-limit', leanChars < KERNEL_CHAR_LIMIT,
  `${leanChars} < ${KERNEL_CHAR_LIMIT}`);

// 2. size: no per-file line cap (retired 2026-08-25 — line counts measure
// wrapping, not content, and were passed by reflowing prose). Growth is
// governed by the byte budget baseline below (check 8), which only moves down.
const ruleFiles = readdirSync(join(ROOT, '.agents/rules'))
  .filter((f) => f.endsWith('.md'));

// 3. every routed file named by the compact kernel exists. Keep this list
// explicit so a wording change cannot silently reduce the number of checks.
const refs = [
  'rules/model-dispatch.md',
  'skills/delegation-templates/SKILL.md',
  'rules/judgment-rubrics.md',
  'skills/unknowns-discovery/SKILL.md',
  'skills/using-workflows/SKILL.md',
  'rules/session-titles.md',
  'rules/maintenance.md',
];
check('gate-ref-count', refs.length === 7, `${refs.length}/7`);
for (const ref of refs) {
  const canonical = ref.startsWith('rules/')
    ? join(ROOT, '.agents', ref)
    : join(ROOT, ref);
  check(`gate-ref ${ref}`, existsSync(canonical));
}

// 4. canary rule present in global
check('canary-rule', /MUST end with `✈` alone/.test(claudeMd), 'mandatory final-line ✈ clause');

// 5. deploy content is pinned to the SHA resolved before download
const deploy = read('scripts/deploy.sh');
const resolveAt = deploy.indexOf('DEPLOYED_SHA="$(git ls-remote');
const pinnedUrlAt = deploy.indexOf('archive/${DEPLOYED_SHA}.tar.gz');
const downloadAt = deploy.indexOf('curl -fsSL "$REPO_TARBALL_URL"');
check('deploy-pinned-sha',
  resolveAt >= 0 && resolveAt < pinnedUrlAt && pinnedUrlAt < downloadAt &&
    !deploy.includes('${DEPLOYED_SHA:-unknown}'),
  'resolve SHA -> build pinned URL -> download');
const deployRuntime = spawnSync('bash', ['-c', String.raw`
  set -euo pipefail
  fixed=0123456789abcdef0123456789abcdef01234567
  request_log="$(mktemp)"
  WORKDIR="$(mktemp -d)"
  trap 'rm -rf "$WORKDIR" "$request_log"' EXIT
  git() { printf '%s\trefs/heads/main\n' "$fixed"; }
  curl() { printf '%s\n' "$*" > "$request_log"; }
  tar() {
    while [ "$#" -gt 0 ]; do
      if [ "$1" = "-C" ]; then
        shift
        mkdir -p "$1/agent-scripts-$fixed"
        return
      fi
      shift
    done
    return 2
  }
  source scripts/deploy.sh
  resolve_release >/dev/null
  download_release >/dev/null
  expected="-fsSL https://github.com/ohyeh/agent-scripts/archive/$fixed.tar.gz"
  [ "$(cat "$request_log")" = "$expected" ]
  [ "$SRC" = "$WORKDIR/agent-scripts-$fixed" ]
`], { cwd: ROOT, encoding: 'utf8' });
check('deploy-pinned-sha-runtime', deployRuntime.status === 0,
  deployRuntime.stderr.trim() || 'observed request URL and archive root');

// 6. behavioral fixture files conform to the documented static schema
const fixtureDir = join(ROOT, 'evals/fixtures');
const fixtureFiles = existsSync(fixtureDir)
  ? readdirSync(fixtureDir).filter((f) => f.endsWith('.json'))
  : [];
let fixturesValid = fixtureFiles.length > 0;
for (const f of fixtureFiles) {
  try {
    const fixture = JSON.parse(readFileSync(join(fixtureDir, f), 'utf8'));
    fixturesValid &&= ['id', 'prompt', 'reason'].every(
      (k) => typeof fixture[k] === 'string' && fixture[k].length > 0);
    fixturesValid &&= ['must_route', 'must_not', 'required_tokens'].every(
      (k) => Array.isArray(fixture.labels?.[k]));
  } catch {
    fixturesValid = false;
  }
}
check('fixture-schema', fixturesValid, `${fixtureFiles.length} fixture(s)`);

// 7. public tracked files must not contain private fleet topology or home paths
const privatePatterns = [
  String.raw`100\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}`,
  String.raw`/Users/[A-Za-z0-9._-]+`,
  ['ohYEHs', 'MBP-14'].join('-'),
  ['2500693', 'paul'].join('-'),
  ['openclaw', 'macmini'].join('-'),
  ['mac', 'mini', 'm2'].join('-'),
  ['paul', String.raw`\.yeh@`].join(''),
].join('|');
// Plain grep, not `git grep`: deploy.sh runs this check inside the downloaded
// tarball tree, which has no .git. The tarball holds exactly the tracked files.
const sensitivePaths = ['.agents', '.claude/handoffs', 'scripts']
  .filter((p) => existsSync(join(ROOT, p)));
const sensitive = spawnSync('grep', ['-rnE', privatePatterns, ...sensitivePaths],
  { cwd: ROOT, encoding: 'utf8' });
check('public-sensitive-literals', sensitive.status === 1,
  sensitive.status === 1 ? 'no private fleet literals'
    : (sensitive.stdout.trim() || `grep exit ${sensitive.status}: ${sensitive.stderr.trim()}`));

// 8. context budget vs baseline
const skillDirs = readdirSync(join(ROOT, 'skills'))
  .filter((d) => statSync(join(ROOT, 'skills', d)).isDirectory());
let skillDescBytes = 0;
for (const d of skillDirs) {
  const p = join(ROOT, 'skills', d, 'SKILL.md');
  if (!existsSync(p)) continue;
  const fm = readFileSync(p, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  const desc = fm?.[1].match(/^description:\s*([\s\S]*?)(?=\n\w+:|$)/m)?.[1] ?? '';
  skillDescBytes += Buffer.byteLength(desc.trim());
}
const budget = {
  globalBytes: Buffer.byteLength(claudeMd),
  rulesBytes: ruleFiles.reduce(
    (a, f) => a + Buffer.byteLength(read(`.agents/rules/${f}`)), 0),
  skillDescBytes,
};
if (process.argv.includes('--accept')) {
  // Deliberate budget growth: write the current sizes back as the new baseline
  // so the increase lands in the same reviewed diff.
  writeFileSync(BASELINE_PATH, JSON.stringify(budget, null, 2) + '\n');
  console.log(`accepted new baseline: ${JSON.stringify(budget)}`);
}
if (existsSync(BASELINE_PATH)) {
  const base = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  for (const k of Object.keys(budget)) {
    check(`budget ${k}`, budget[k] <= base[k],
      `${budget[k]} vs baseline ${base[k]}`);
  }
} else {
  check('budget baseline', false,
    `missing ${BASELINE_PATH} — create it with: ${JSON.stringify(budget)}`);
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
