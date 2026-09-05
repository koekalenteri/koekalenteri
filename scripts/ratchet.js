// Ratchets two things AGENTS.md forbids but no lint rule can gate outright, because hundreds of
// them are already in the tree: type assertions (`x as T`, `<T>x`) outside tests, and explicit
// `any` anywhere. Each count is compared with scripts/ratchet-baseline.json: a count above its
// baseline fails, a count below it is written back as the new baseline, so the numbers only ever go
// down. Runs as one of the pre-commit checks (which then stages the lowered baseline) and in the
// CI lint steps.
//
// `as const` is not an assertion and is not counted. Tests may assert freely -- AGENTS.md itself
// recommends `fn as MockedFunction<typeof fn>` -- but `any` is off limits there too.
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const ROOT = path.resolve(__dirname, '..')
const SOURCE_DIR = 'src'
const BASELINE_FILE = 'scripts/ratchet-baseline.json'

const isTestSupport = (file) =>
  /\.test\.tsx?$/.test(file) ||
  /(^|\/)(__mocks__|global-mocks|test-utils)\//.test(file) ||
  /(^|\/)setupTests\.tsx?$/.test(file)

const isConstAssertion = (node) =>
  ts.isTypeReferenceNode(node.type) && ts.isIdentifier(node.type.typeName) && node.type.typeName.text === 'const'

const METRICS = {
  asAssertions: {
    countsIn: (file) => !isTestSupport(file),
    label: 'type assertions outside tests',
    matches: (node) => (ts.isAsExpression(node) && !isConstAssertion(node)) || ts.isTypeAssertionExpression(node),
  },
  explicitAny: {
    countsIn: () => true,
    label: 'explicit any types',
    matches: (node) => node.kind === ts.SyntaxKind.AnyKeyword,
  },
}

function sourceFiles(dir) {
  const files = []
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`
    if (entry.isDirectory()) files.push(...sourceFiles(file))
    else if (/\.tsx?$/.test(entry.name)) files.push(file)
  }
  return files.sort()
}

// Returns `${file}:${line}` for every match of every metric in the given text of the file.
function locate(file, text) {
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, kind)
  const metrics = Object.entries(METRICS).filter(([, metric]) => metric.countsIn(file))
  const found = Object.fromEntries(Object.keys(METRICS).map((name) => [name, []]))
  const visit = (node) => {
    for (const [name, metric] of metrics) {
      if (metric.matches(node)) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
        found[name].push(`${file}:${line + 1}`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

// Files that differ from HEAD (staged, unstaged or untracked) -- where a new match must be, unless
// the baseline itself is behind.
function changedFiles() {
  const output = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', SOURCE_DIR], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  return new Set(
    output
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(3).split(' -> ').at(-1))
  )
}

const headText = (file) => {
  try {
    return execFileSync('git', ['show', `HEAD:${file}`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return '' // untracked
  }
}

// Lists, per changed file whose count grew since HEAD, the matches it now holds.
function reportIncrease(name, metric, limit, locations, changed) {
  console.error(`ratchet: ${metric.label}: ${locations.length}, the baseline is ${limit}.`)
  console.error('  AGENTS.md forbids new type assertions and explicit any; model or narrow the value instead.')
  let grown = 0
  for (const file of [...changed].sort()) {
    const now = locations.filter((location) => location.startsWith(`${file}:`))
    const before = now.length ? locate(file, headText(file))[name].length : 0
    if (now.length <= before) continue
    grown++
    console.error(`  ${file}: ${before} -> ${now.length}`)
    for (const location of now) console.error(`    ${location}`)
  }
  if (!grown) {
    console.error(`  No file changed against HEAD grew: ${BASELINE_FILE} is probably behind main.`)
    console.error('  Rebase and run `npm run ratchet` again; it writes the real count.')
  }
}

function main() {
  const baselinePath = path.join(ROOT, BASELINE_FILE)
  const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : {}
  const locations = Object.fromEntries(Object.keys(METRICS).map((name) => [name, []]))
  for (const file of sourceFiles(SOURCE_DIR)) {
    const found = locate(file, fs.readFileSync(path.join(ROOT, file), 'utf8'))
    for (const name of Object.keys(METRICS)) locations[name].push(...found[name])
  }

  const next = {}
  let failed = false
  let changed
  for (const [name, metric] of Object.entries(METRICS)) {
    const count = locations[name].length
    const limit = baseline[name]
    next[name] = limit === undefined ? count : Math.min(limit, count)
    if (count > limit) {
      failed = true
      changed ??= changedFiles()
      reportIncrease(name, metric, limit, locations[name], changed)
    } else if (count < limit) {
      console.log(`ratchet: ${metric.label}: ${limit} -> ${count}, baseline lowered`)
    } else if (limit === undefined) {
      console.log(`ratchet: ${metric.label}: ${count}, baseline created`)
    }
  }

  const serialized = `${JSON.stringify(next, null, 2)}\n`
  if (!fs.existsSync(baselinePath) || fs.readFileSync(baselinePath, 'utf8') !== serialized) {
    fs.writeFileSync(baselinePath, serialized)
  }
  process.exit(failed ? 1 : 0)
}

main()
