// Splits CI's frontend-test shards by how long their files take instead of by count. Vitest's own
// --shard gives every shard the same number of files, and the few slow ones (a whole form rendered
// per test) land where their path hashes put them: three of them made two shards of five take twice
// as long as the rest.
//
// The weights are the previous run's: every shard writes the time each of its files took
// (DurationReporter, to VITEST_DURATIONS_OUT), the frontend-coverage job joins them into one file
// for the Actions cache, and the next run hands that file to every shard (VITEST_SHARD_WEIGHTS).
// Every shard must cut the same list the same way, or a file runs twice or not at all; so the order
// is fixed by weight and path, and the file is one cache entry that the setup job picks for all.
// Without the file, or with no --shard, Vitest's own split applies.
import fs from 'node:fs'
import path from 'node:path'
import { BaseSequencer } from 'vitest/node'

/** The run's per-file times, `{ 'src/…test.tsx': ms }`, or undefined when there are none. */
const readWeights = () => {
  const file = process.env.VITEST_SHARD_WEIGHTS
  if (!file || !fs.existsSync(file)) return undefined
  const weights = JSON.parse(fs.readFileSync(file, 'utf8'))
  return Object.keys(weights).length ? weights : undefined
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 1
}

export class DurationSequencer extends BaseSequencer {
  async shard(files) {
    const weights = readWeights()
    if (!weights) return super.shard(files)

    const { index, count } = this.ctx.config.shard
    const keyOf = (spec) => path.relative(this.ctx.config.root, spec.moduleId).split(path.sep).join('/')
    // A file the previous run did not have (a new one) counts as a typical file.
    const typical = median(Object.values(weights))
    const weighed = files
      .map((spec) => ({ key: keyOf(spec), spec, weight: weights[keyOf(spec)] ?? typical }))
      .sort((a, b) => b.weight - a.weight || (a.key < b.key ? -1 : 1))

    // Heaviest first, each to the lightest shard so far: the lowest number when two are even.
    const loads = new Array(count).fill(0)
    const mine = []
    for (const { spec, weight } of weighed) {
      const lightest = loads.indexOf(Math.min(...loads))
      loads[lightest] += weight
      if (lightest === index - 1) mine.push(spec)
    }
    return mine
  }
}

/** Writes how long each test file took, from its import to its last test, as the weights above. */
export class DurationReporter {
  constructor(outputFile) {
    this.outputFile = outputFile
  }

  onInit(vitest) {
    this.root = vitest.config.root
  }

  onTestRunEnd(testModules) {
    const durations = {}
    for (const testModule of testModules) {
      const d = testModule.diagnostic()
      const key = path.relative(this.root, testModule.moduleId).split(path.sep).join('/')
      durations[key] = Math.round(
        d.environmentSetupDuration + d.prepareDuration + d.setupDuration + d.collectDuration + d.duration
      )
    }
    fs.mkdirSync(path.dirname(this.outputFile), { recursive: true })
    fs.writeFileSync(this.outputFile, `${JSON.stringify(durations, null, 2)}\n`)
  }
}
