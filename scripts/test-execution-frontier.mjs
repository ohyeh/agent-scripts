#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { median, validateFixture, runFixture } from './execution-frontier.mjs'

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)))
const scratchRoot = join(repo, '.workflow', '202607212000-execution-frontier')
const outputDir = mkdtempSync(join(scratchRoot, 'scratch-'))
let passed = 0

function check(name, fn) {
  fn()
  passed++
  console.log(`  ok   ${name}`)
}

try {
  const validPath = join(repo, 'evals', 'execution-frontier', 'fixtures', 'local-smoke.json')
  const valid = JSON.parse(readFileSync(validPath, 'utf8'))
  const invalid = JSON.parse(readFileSync(join(repo, 'evals', 'execution-frontier', 'fixtures', 'invalid-mixed-axes.json'), 'utf8'))
  check('mixed comparison axes fail closed', () => {
    assert.throws(() => validateFixture(invalid), /differ outside comparison\.vary/)
  })

  check('invalid timeout fails before execution', () => {
    const fixture = structuredClone(valid)
    fixture.cases[0].timeout_ms = -1
    assert.throws(() => validateFixture(fixture), /timeout_ms must be >= 1/)
  })

  check('comparison requires two profiles', () => {
    const fixture = structuredClone(valid)
    fixture.profiles = { low: fixture.profiles.low }
    fixture.cases = fixture.cases.filter((testCase) => testCase.profile_id === 'low')
    assert.throws(() => validateFixture(fixture), /requires at least two profiles/)
  })

  check('comparison axis must actually vary', () => {
    const fixture = structuredClone(valid)
    fixture.profiles.high.reasoning.effort = 'low'
    assert.throws(() => validateFixture(fixture), /do not vary at comparison\.vary/)
  })

  check('fixture and case keys fail closed', () => {
    const fixture = structuredClone(valid)
    fixture.unknown = true
    assert.throws(() => validateFixture(fixture), /fixture must contain exactly/)
    delete fixture.unknown
    fixture.cases[0].unknown = true
    assert.throws(() => validateFixture(fixture), /case .* must contain exactly/)
  })

  check('impossible topology fails closed', () => {
    const excessive = structuredClone(valid)
    excessive.profiles.low.topology.parallelism = 2
    assert.throws(() => validateFixture(excessive), /parallelism cannot exceed agents/)

    const unknownRole = structuredClone(valid)
    unknownRole.profiles.low.topology = { agents: 2, parallelism: 2, roles: ['runner', 'reviewer'], edges: [['runner', 'ghost']] }
    assert.throws(() => validateFixture(unknownRole), /must connect distinct declared roles/)

    const duplicateRole = structuredClone(valid)
    duplicateRole.profiles.low.topology = { agents: 2, parallelism: 2, roles: ['runner', 'runner'], edges: [] }
    assert.throws(() => validateFixture(duplicateRole), /roles must be unique/)
  })

  const result = runFixture(validPath, outputDir)
  check('runner records every attempt', () => assert.equal(result.observations.length, 6))
  check('valid smoke observations pass', () => assert.ok(result.observations.every((row) => row.outcome === 'pass')))
  check('profile metadata reaches commands', () => assert.ok(result.observations.filter((row) => row.case_id.startsWith('profile-env-')).every((row) => row.stdout_tail.includes('profile-ok'))))
  check('unavailable provider metrics are explicit', () => assert.ok(result.observations.every((row) => row.unavailable_metrics.reasoning_tokens === 'runtime_not_reported')))
  check('comparison varies only reasoning effort', () => assert.equal(result.summary.comparison.vary, 'reasoning.effort'))
  check('profiles retain separate hashes', () => assert.notEqual(result.summary.profiles.low.hash, result.summary.profiles.high.hash))

  const edgeFixture = {
    schema_version: 1,
    profiles: { local: valid.profiles.low },
    cases: [
      { id: 'pass', profile_id: 'local', command: ['node', '-e', "if (!process.env.PATH || process.cwd() !== process.argv[1]) process.exit(2)" , repo], expected_exit_code: 0, attempts: 1 },
      { id: 'failure', workload_id: 'failure', profile_id: 'local', command: ['node', '-e', 'process.exit(7)'], expected_exit_code: 0, attempts: 1 },
      { id: 'timeout', workload_id: 'timeout', profile_id: 'local', command: ['node', '-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], expected_exit_code: 124, attempts: 1, timeout_ms: 10 },
      { id: 'spawn-error', workload_id: 'spawn-error', profile_id: 'local', command: ['command-that-does-not-exist-frontier'], expected_exit_code: 1, attempts: 1 }
    ]
  }
  edgeFixture.cases[0].workload_id = 'pass'
  const edgePath = join(outputDir, 'edge-fixture.json')
  writeFileSync(edgePath, `${JSON.stringify(edgeFixture)}\n`)
  const edgeResult = runFixture(edgePath, join(outputDir, 'edge-output'))
  check('commands run at repo root with inherited environment', () => assert.equal(edgeResult.summary.cases.pass.assertion_pass_rate, 1))
  check('unexpected exit is recorded as failure', () => {
    assert.equal(edgeResult.summary.cases.failure.assertion_pass_rate, 0)
    assert.equal(edgeResult.observations.find((row) => row.case_id === 'failure').exit_code, 7)
  })
  check('timeout is observable and fails', () => {
    const row = edgeResult.observations.find((observation) => observation.case_id === 'timeout')
    assert.equal(row.outcome, 'fail')
    assert.equal(row.exit_code, 124)
    assert.equal(row.error_class, 'ETIMEDOUT')
  })
  check('spawn errors cannot match an expected exit', () => {
    const row = edgeResult.observations.find((observation) => observation.case_id === 'spawn-error')
    assert.equal(row.outcome, 'fail')
    assert.equal(row.error_class, 'ENOENT')
  })
  check('summary reports exact assertion counts', () => {
    assert.deepEqual(Object.values(edgeResult.summary.cases).map((entry) => entry.passed), [1, 0, 0, 0])
  })
  check('median averages the middle pair', () => assert.equal(median([1, 3, 9, 11]), 6))
  check('median returns the middle odd value', () => assert.equal(median([9, 1, 3]), 3))

  const cliValid = spawnSync('node', ['scripts/execution-frontier.mjs', '--fixture', validPath, '--validate-only', 'true'], { cwd: repo, encoding: 'utf8' })
  const cliInvalid = spawnSync('node', ['scripts/execution-frontier.mjs', '--fixture', join(repo, 'evals', 'execution-frontier', 'fixtures', 'invalid-mixed-axes.json'), '--validate-only', 'true'], { cwd: repo, encoding: 'utf8' })
  check('CLI accepts valid fixture', () => assert.match(`${cliValid.status}:${cliValid.stdout}`, /^0:VALID /))
  check('CLI rejects invalid fixture', () => assert.match(`${cliInvalid.status}:${cliInvalid.stderr}`, /^1:ERROR /))
  const cliUnknown = spawnSync('node', ['scripts/execution-frontier.mjs', '--fixture', validPath, '--wat', 'true'], { cwd: repo, encoding: 'utf8' })
  check('CLI rejects unknown options', () => assert.match(`${cliUnknown.status}:${cliUnknown.stderr}`, /^1:ERROR unknown option/))
  const cliFailure = spawnSync('node', ['scripts/execution-frontier.mjs', '--fixture', edgePath, '--output-dir', join(outputDir, 'cli-failure')], { cwd: repo, encoding: 'utf8' })
  check('CLI labels failed observations as FAIL', () => assert.match(`${cliFailure.status}:${cliFailure.stdout}`, /^1:FAIL 1\/4/))
  console.log(`execution-frontier self-test: ${passed} passed, 0 failed`)
} finally {
  rmSync(outputDir, { recursive: true, force: true })
}
