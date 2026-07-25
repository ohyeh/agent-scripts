#!/usr/bin/env node
// Rules eval gate — static invariants for global/ + .agents/rules/ + skills/.
// Exit 0 = all PASS. Any FAIL = exit 1. See evals/README.md for the behavioral
// fixture schema (not yet executed by this runner).
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LINE_LIMIT = 150; // maintenance.md per-file cap
const BASELINE_PATH = join(ROOT, 'evals/context-budget-baseline.json');

const results = [];
const check = (name, ok, detail = '') =>
  results.push({ name, ok, detail });

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const lines = (s) => s.split('\n').length - (s.endsWith('\n') ? 1 : 0);

// 1. global files byte-identical
const claudeMd = read('global/CLAUDE.md');
const agentsMd = read('global/AGENTS.md');
check('global-identical', claudeMd === agentsMd,
  'global/CLAUDE.md vs global/AGENTS.md');

// 2. line limits
for (const p of ['global/CLAUDE.md', 'global/AGENTS.md']) {
  const n = lines(read(p));
  check(`line-limit ${p}`, n <= LINE_LIMIT, `${n}/${LINE_LIMIT}`);
}
const ruleFiles = readdirSync(join(ROOT, '.agents/rules'))
  .filter((f) => f.endsWith('.md'));
for (const f of ruleFiles) {
  const n = lines(read(`.agents/rules/${f}`));
  check(`line-limit .agents/rules/${f}`, n <= LINE_LIMIT, `${n}/${LINE_LIMIT}`);
}

// 3. every rule file referenced in the global Gates section exists
const refs = [...claudeMd.matchAll(/~\/\.agents\/(rules|skills)\/[\w./-]+\.md/g)]
  .map((m) => m[0].replace('~/.agents/', ''));
for (const ref of new Set(refs)) {
  // rules live in this repo; skills are deployed separately — check rules only
  if (!ref.startsWith('rules/')) continue;
  if (ref === 'rules/lessons.md') continue; // local-only by design (deploy excludes it)
  check(`gate-ref ${ref}`, existsSync(join(ROOT, '.agents', ref)));
}

// 4. canary rule present in global
check('canary-rule', /codeword `✈`/.test(claudeMd), 'codeword ✈ clause');

// 5. context budget vs baseline
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
