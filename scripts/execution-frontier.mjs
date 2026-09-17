#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'

const PROFILE_AXES = ['reasoning', 'sampling', 'topology']
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fail(message) {
  throw new Error(message)
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value, allowed, label) {
  if (!isObject(value)) fail(`${label} must be an object`)
  const actual = Object.keys(value).sort()
  const expected = [...allowed].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} must contain exactly: ${expected.join(', ')}`)
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!isObject(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
}

function deletePath(value, path) {
  const clone = structuredClone(value)
  const parts = path.split('.')
  const key = parts.pop()
  let parent = clone
  for (const part of parts) {
    if (!isObject(parent[part])) fail(`comparison.vary path does not exist: ${path}`)
    parent = parent[part]
  }
  if (!(key in parent)) fail(`comparison.vary path does not exist: ${path}`)
  delete parent[key]
  return clone
}

function readPath(value, path) {
  let current = value
  for (const part of path.split('.')) {
    if (!isObject(current) || !(part in current)) fail(`comparison.vary path does not exist: ${path}`)
    current = current[part]
  }
  return current
}

function validateProfile(profile, id) {
  exactKeys(profile, PROFILE_AXES, `profile ${id}`)
  for (const axis of PROFILE_AXES) {
    if (!isObject(profile[axis])) fail(`profile ${id}.${axis} must be an object`)
  }
  const { reasoning, sampling, topology } = profile
  exactKeys(reasoning, ['runtime', 'model', 'effort'], `profile ${id}.reasoning`)
  exactKeys(sampling, ['independent_samples', 'selection_rule', 'sequential_refinement_rounds'], `profile ${id}.sampling`)
  exactKeys(topology, ['agents', 'parallelism', 'roles', 'edges'], `profile ${id}.topology`)
  for (const key of ['runtime', 'model', 'effort']) {
    if (typeof reasoning[key] !== 'string' || !reasoning[key]) fail(`profile ${id}.reasoning.${key} must be a non-empty string`)
  }
  if (!Number.isInteger(sampling.independent_samples) || sampling.independent_samples < 1) fail(`profile ${id}.sampling.independent_samples must be >= 1`)
  if (typeof sampling.selection_rule !== 'string' || !sampling.selection_rule) fail(`profile ${id}.sampling.selection_rule must be a non-empty string`)
  if (!Number.isInteger(sampling.sequential_refinement_rounds) || sampling.sequential_refinement_rounds < 0) fail(`profile ${id}.sampling.sequential_refinement_rounds must be >= 0`)
  if (!Number.isInteger(topology.agents) || topology.agents < 1) fail(`profile ${id}.topology.agents must be >= 1`)
  if (!Number.isInteger(topology.parallelism) || topology.parallelism < 1) fail(`profile ${id}.topology.parallelism must be >= 1`)
  if (topology.parallelism > topology.agents) fail(`profile ${id}.topology.parallelism cannot exceed agents`)
  if (!Array.isArray(topology.roles) || topology.roles.length !== topology.agents || topology.roles.some((role) => typeof role !== 'string' || !role)) fail(`profile ${id}.topology.roles must contain one non-empty role per agent`)
  if (new Set(topology.roles).size !== topology.roles.length) fail(`profile ${id}.topology.roles must be unique`)
  if (!Array.isArray(topology.edges) || topology.edges.some((edge) => !Array.isArray(edge) || edge.length !== 2 || edge.some((role) => typeof role !== 'string'))) fail(`profile ${id}.topology.edges must contain role pairs`)
  if (topology.edges.some(([from, to]) => from === to || !topology.roles.includes(from) || !topology.roles.includes(to))) fail(`profile ${id}.topology.edges must connect distinct declared roles`)
  if (new Set(topology.edges.map((edge) => JSON.stringify(edge))).size !== topology.edges.length) fail(`profile ${id}.topology.edges must be unique`)
}

export function validateFixture(fixture) {
  if (!isObject(fixture)) fail('fixture must be an object')
  exactKeys(fixture, fixture.comparison === undefined ? ['schema_version', 'profiles', 'cases'] : ['schema_version', 'profiles', 'cases', 'comparison'], 'fixture')
  if (fixture.schema_version !== 1) fail('fixture.schema_version must be 1')
  if (!isObject(fixture.profiles) || Object.keys(fixture.profiles).length === 0) fail('fixture.profiles must not be empty')
  for (const [id, profile] of Object.entries(fixture.profiles)) validateProfile(profile, id)
  if (!Array.isArray(fixture.cases) || fixture.cases.length === 0) fail('fixture.cases must not be empty')
  const ids = new Set()
  for (const testCase of fixture.cases) {
    if (!isObject(testCase)) fail('every case must be an object')
    exactKeys(testCase, testCase.timeout_ms === undefined
      ? ['id', 'workload_id', 'profile_id', 'command', 'expected_exit_code', 'attempts']
      : ['id', 'workload_id', 'profile_id', 'command', 'expected_exit_code', 'attempts', 'timeout_ms'], `case ${testCase.id ?? '<unknown>'}`)
    if (typeof testCase.id !== 'string' || !testCase.id) fail('every case needs a non-empty id')
    if (ids.has(testCase.id)) fail(`duplicate case id: ${testCase.id}`)
    ids.add(testCase.id)
    if (typeof testCase.workload_id !== 'string' || !testCase.workload_id) fail(`case ${testCase.id}.workload_id must be a non-empty string`)
    if (!Array.isArray(testCase.command) || testCase.command.length === 0 || testCase.command.some((part) => typeof part !== 'string')) fail(`case ${testCase.id}.command must be a non-empty string array`)
    if (!Number.isInteger(testCase.expected_exit_code)) fail(`case ${testCase.id}.expected_exit_code must be an integer`)
    if (!Number.isInteger(testCase.attempts) || testCase.attempts < 1) fail(`case ${testCase.id}.attempts must be >= 1`)
    if (testCase.timeout_ms !== undefined && (!Number.isInteger(testCase.timeout_ms) || testCase.timeout_ms < 1)) fail(`case ${testCase.id}.timeout_ms must be >= 1`)
    if (!Object.hasOwn(testCase, 'profile_id') || !Object.hasOwn(fixture.profiles, testCase.profile_id)) fail(`case ${testCase.id} references unknown profile: ${testCase.profile_id}`)
  }
  if (fixture.comparison !== undefined) {
    exactKeys(fixture.comparison, ['vary'], 'comparison')
    if (typeof fixture.comparison.vary !== 'string') fail('comparison.vary must be a dotted path')
    const profiles = Object.values(fixture.profiles)
    const profileIds = Object.keys(fixture.profiles)
    if (profiles.length < 2) fail('comparison requires at least two profiles')
    const signatures = profiles.map((profile) => digest(deletePath(profile, fixture.comparison.vary)))
    if (new Set(signatures).size !== 1) fail(`profiles differ outside comparison.vary: ${fixture.comparison.vary}`)
    const variedValues = profiles.map((profile) => digest(readPath(profile, fixture.comparison.vary)))
    if (new Set(variedValues).size < 2) fail(`profiles do not vary at comparison.vary: ${fixture.comparison.vary}`)
    const workloads = new Map()
    for (const testCase of fixture.cases) {
      if (!workloads.has(testCase.workload_id)) workloads.set(testCase.workload_id, new Map())
      const group = workloads.get(testCase.workload_id)
      if (group.has(testCase.profile_id)) fail(`duplicate workload/profile pair: ${testCase.workload_id}/${testCase.profile_id}`)
      group.set(testCase.profile_id, testCase)
    }
    for (const [workloadId, group] of workloads) {
      if (group.size !== profileIds.length || profileIds.some((id) => !group.has(id))) fail(`workload ${workloadId} must run once under every comparison profile`)
      const specs = [...group.values()].map(({ command, expected_exit_code, attempts, timeout_ms = 30_000 }) => digest({ command, expected_exit_code, attempts, timeout_ms }))
      if (new Set(specs).size !== 1) fail(`workload ${workloadId} differs across comparison profiles`)
    }
  }
  return fixture
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

export function runFixture(fixturePath, outputDir) {
  const raw = readFileSync(fixturePath, 'utf8')
  const fixture = validateFixture(JSON.parse(raw))
  const runId = randomUUID()
  const fixtureHash = digest(JSON.parse(raw))
  const ledgerPath = resolve(outputDir, 'observations.jsonl')
  const summaryPath = resolve(outputDir, 'summary.json')
  mkdirSync(dirname(ledgerPath), { recursive: true })
  writeFileSync(ledgerPath, '')

  const observations = []
  for (const testCase of fixture.cases) {
    for (let attempt = 1; attempt <= testCase.attempts; attempt++) {
      const startedAt = new Date().toISOString()
      const started = performance.now()
      const result = spawnSync(testCase.command[0], testCase.command.slice(1), {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: testCase.timeout_ms ?? 30_000,
        killSignal: 'SIGKILL',
        env: {
          ...process.env,
          EXECUTION_PROFILE_ID: testCase.profile_id,
          EXECUTION_REASONING_EFFORT: fixture.profiles[testCase.profile_id].reasoning.effort,
          EXECUTION_PROFILE_JSON: JSON.stringify(fixture.profiles[testCase.profile_id])
        }
      })
      const durationMs = Math.round((performance.now() - started) * 1000) / 1000
      const exitCode = result.status ?? (result.error?.code === 'ETIMEDOUT' ? 124 : 1)
      const observation = {
        schema_version: 1,
        run_id: runId,
        fixture_hash: fixtureHash,
        case_id: testCase.id,
        profile_id: testCase.profile_id,
        profile_hash: digest(fixture.profiles[testCase.profile_id]),
        execution_profile: fixture.profiles[testCase.profile_id],
        attempt,
        started_at: startedAt,
        duration_ms: durationMs,
        exit_code: exitCode,
        signal: result.signal ?? null,
        error_class: result.error?.code ?? null,
        stdout_tail: result.stdout?.slice(-2000) ?? '',
        stderr_tail: result.stderr?.slice(-2000) ?? '',
        outcome: !result.error && exitCode === testCase.expected_exit_code ? 'pass' : 'fail',
        unavailable_metrics: {
          reasoning_tokens: 'runtime_not_reported',
          provider_cost: 'runtime_not_reported'
        }
      }
      appendFileSync(ledgerPath, `${JSON.stringify(observation)}\n`)
      observations.push(observation)
    }
  }

  const cases = Object.fromEntries(fixture.cases.map((testCase) => {
    const rows = observations.filter((row) => row.case_id === testCase.id)
    const durations = rows.map((row) => row.duration_ms)
    return [testCase.id, {
      profile_id: testCase.profile_id,
      attempts: rows.length,
      passed: rows.filter((row) => row.outcome === 'pass').length,
      assertion_pass_rate: rows.filter((row) => row.outcome === 'pass').length / rows.length,
      median_duration_ms: median(durations),
      p95_duration_ms: percentile(durations, 0.95)
    }]
  }))
  const summary = {
    schema_version: 1,
    run_id: runId,
    fixture_hash: fixtureHash,
    comparison: fixture.comparison ?? null,
    profiles: Object.fromEntries(Object.entries(fixture.profiles).map(([id, profile]) => [id, { hash: digest(profile), profile }])),
    cases
  }
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)
  return { ledgerPath, summaryPath, summary, observations }
}

function parseArgs(argv) {
  const args = {}
  const allowed = new Set(['fixture', 'output-dir', 'validate-only'])
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]
    const value = argv[i + 1]
    if (!key?.startsWith('--') || value === undefined) fail('usage: execution-frontier.mjs --fixture FILE [--output-dir DIR] [--validate-only true]')
    const name = key.slice(2)
    if (!allowed.has(name)) fail(`unknown option: --${name}`)
    if (Object.hasOwn(args, name)) fail(`duplicate option: --${name}`)
    args[name] = value
  }
  return args
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2))
    if (!args.fixture) fail('--fixture is required')
    const fixturePath = resolve(args.fixture)
    const fixture = validateFixture(JSON.parse(readFileSync(fixturePath, 'utf8')))
    if (args['validate-only'] === 'true') {
      console.log(`VALID ${Object.keys(fixture.profiles).length} profiles, ${fixture.cases.length} cases`)
    } else {
      if (!args['output-dir']) fail('--output-dir is required unless --validate-only true')
      const result = runFixture(fixturePath, resolve(args['output-dir']))
      const passed = result.observations.filter((row) => row.outcome === 'pass').length
      console.log(`${passed === result.observations.length ? 'PASS' : 'FAIL'} ${passed}/${result.observations.length}`)
      console.log(result.ledgerPath)
      console.log(result.summaryPath)
      if (result.observations.some((row) => row.outcome !== 'pass')) process.exitCode = 1
    }
  } catch (error) {
    console.error(`ERROR ${error.message}`)
    process.exitCode = 1
  }
}
