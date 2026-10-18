import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { BaseSequencer } from 'vitest/node'
import { DurationReporter, DurationSequencer } from './vitestShards.mjs'

const ROOT = '/repo'
const COUNT = 5

const ctx = (index) => ({ config: { root: ROOT, shard: { count: COUNT, index } } })
const spec = (file) => ({ moduleId: `${ROOT}/${file}` })
const files = Array.from({ length: 40 }, (_, i) => `src/file${String(i).padStart(2, '0')}.test.tsx`)

/** Each shard's files, by name, as the five CI jobs would cut them. */
const cut = async (Sequencer, list = files) =>
  Promise.all(
    Array.from({ length: COUNT }, async (_, i) =>
      (await new Sequencer(ctx(i + 1)).shard(list.map(spec))).map(({ moduleId }) => moduleId.slice(ROOT.length + 1))
    )
  )

describe('DurationSequencer', () => {
  let dir

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'vitest-shards-'))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(dir, { force: true, recursive: true })
  })

  const useWeights = (weights) => {
    const file = path.join(dir, 'weights.json')
    writeFileSync(file, JSON.stringify(weights))
    vi.stubEnv('VITEST_SHARD_WEIGHTS', file)
  }

  // Three files as slow as the rest of a shard together, as RegistrationForm, EventResultsPage and
  // EntrySection were: the count split put them where their hashes fell.
  const weights = Object.fromEntries(files.map((file, i) => [file, i < 3 ? 40_000 : 1_000 + i * 50]))
  const load = (shard) => shard.reduce((sum, file) => sum + weights[file], 0)

  it('gives every file to exactly one shard', async () => {
    useWeights(weights)

    const shards = await cut(DurationSequencer)

    expect(shards.flat().sort()).toEqual(files)
  })

  it('puts each slow file in a shard of its own and evens out the rest', async () => {
    useWeights(weights)

    const shards = await cut(DurationSequencer)

    // Each slow file is more than a fifth of the whole, so the best cut leaves it alone in its shard
    // and shares the rest between the other two, within one file of each other.
    const slow = shards.filter((shard) => shard.some((file) => weights[file] === 40_000))
    expect(slow.map((shard) => shard.length)).toEqual([1, 1, 1])
    const [a, b] = shards.filter((shard) => !slow.includes(shard)).map(load)
    expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.max(...files.slice(3).map((file) => weights[file])))
  })

  it('weighs a file the weights do not have as a typical one, and still places it once', async () => {
    useWeights(weights)
    const withNew = [...files, 'src/new.test.tsx']

    const shards = await cut(DurationSequencer, withNew)

    expect(shards.flat().sort()).toEqual(withNew.sort())
  })

  it("falls back to Vitest's own split without weights", async () => {
    vi.stubEnv('VITEST_SHARD_WEIGHTS', path.join(dir, 'missing.json'))

    expect(await cut(DurationSequencer)).toEqual(await cut(BaseSequencer))
  })
})

describe('DurationReporter', () => {
  it('writes each file’s whole time under its path from the root', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vitest-durations-'))
    const out = path.join(dir, 'nested', 'durations.json')
    const reporter = new DurationReporter(out)
    reporter.onInit({ config: { root: ROOT } })
    const diagnostic = {
      collectDuration: 300,
      duration: 1000.4,
      environmentSetupDuration: 100,
      prepareDuration: 20,
      setupDuration: 80,
    }

    reporter.onTestRunEnd([{ diagnostic: () => diagnostic, moduleId: `${ROOT}/src/a.test.tsx` }])

    expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual({ 'src/a.test.tsx': 1500 })
    rmSync(dir, { force: true, recursive: true })
  })
})
