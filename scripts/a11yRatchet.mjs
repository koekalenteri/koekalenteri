// The Node half of the accessibility ratchet the visual tests run (see src/setupVisualTests.ts).
// Every screenshot is also audited with axe-core in the browser; the violations found, as
// `{ ruleId: nodeCount }`, come here and are compared with scripts/a11y-baseline.json, which lists
// the known violations per test file and screenshot. A rule with more nodes than its allowance
// (or any nodes, when it has none) is reported back and fails the test; fewer nodes lower the
// allowance in the file, so the numbers only ever go down -- the same model as scripts/ratchet.js.
//
// Raising an allowance is a hand edit of the baseline, visible in review. The one exception is
// A11Y_RATCHET=record, which accepts whatever the run finds: for seeding the file, and for a
// violation that was decided to stay (say, inside a library component).
import fs from 'node:fs'
import path from 'node:path'

const BASELINE_FILE = 'scripts/a11y-baseline.json'

const sortedKeys = (object) => Object.fromEntries(Object.keys(object).sort().map((key) => [key, object[key]]))

// The visual test files run concurrently and every one of them ratchets. Reading the file per call
// and writing it back would lose whichever update landed between another call's read and write, and
// the entry it dropped would fail the *next* run. The whole baseline is held as one object per
// process instead, so the updates accumulate; the file is only ever the serialization of it.
const loaded = new Map()

function baselineOf(root) {
  const file = path.join(root, BASELINE_FILE)
  if (!loaded.has(file)) {
    loaded.set(file, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {})
  }
  return loaded.get(file)
}

function persist(root, baseline) {
  const file = path.join(root, BASELINE_FILE)
  const serialized = `${JSON.stringify(sortedKeys(baseline), null, 2)}\n`
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== serialized) {
    fs.writeFileSync(file, serialized)
  }
}

/**
 * Compares the violations of one screenshot with its allowance and updates the baseline.
 * Returns the rules that grew, each with the allowed and the found node count.
 */
function ratchetViolations(root, testFile, screenshot, found) {
  const baseline = baselineOf(root)
  const allowed = baseline[testFile]?.[screenshot] ?? {}
  const record = process.env.A11Y_RATCHET === 'record'

  const grown = []
  const next = {}
  for (const rule of new Set([...Object.keys(allowed), ...Object.keys(found)])) {
    const limit = allowed[rule] ?? 0
    const count = found[rule] ?? 0
    if (count > limit && !record) grown.push({ allowed: limit, found: count, rule })
    const kept = record ? count : Math.min(limit, count)
    if (kept > 0) next[rule] = kept
  }

  const file = { ...baseline[testFile] }
  if (Object.keys(next).length) file[screenshot] = sortedKeys(next)
  else delete file[screenshot]
  if (Object.keys(file).length) baseline[testFile] = sortedKeys(file)
  else delete baseline[testFile]

  persist(root, baseline)
  return grown
}

/** The vitest browser command: `commands.a11yRatchet(screenshot, found)` from the test iframe. */
export const a11yRatchet = (ctx, screenshot, found) => {
  const root = ctx.project.config.root
  if (!ctx.testPath) throw new Error('a11yRatchet: no test file in the command context')
  const testFile = path.relative(root, ctx.testPath).split(path.sep).join('/')
  return ratchetViolations(root, testFile, screenshot, found)
}
