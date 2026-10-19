// Gates three things AGENTS.md forbids but no lint rule can: type assertions (`x as T`, `<T>x`)
// outside tests, explicit `any` anywhere, and DynamoDB clients opened outside a table's repository.
// Each count is compared with scripts/ratchet-baseline.json: a count above its baseline fails, a
// count below it is written back as the new baseline, so the numbers only ever go down. Runs as one
// of the pre-commit checks (which then stages the lowered baseline) and in the CI lint steps.
//
// `as const` is not an assertion and is not counted. Tests may assert freely -- AGENTS.md itself
// recommends `fn as MockedFunction<typeof fn>` -- but `any` is off limits there too.
//
// Every table is read and written through its module in src/lambda/lib/repositories/ (see the
// README there; the WebSocket connection repository stays in lib/ws/), and the client count is 0
// since KOE-1415, so that metric is a ban rather than a ratchet. It reads the static imports and
// exports of each non-test file. Outside the repositories it counts a CustomDynamoClient built,
// subclassed or exported on (re-exported, or imported and exported again) under whatever name the
// file imports it as. In the lambda code but CustomDynamoClient.ts it counts an SDK client built,
// subclassed or exported on directly (`new DynamoDBClient(`, `new DynamoDB(`,
// `DynamoDBDocumentClient.from(`, `DynamoDBDocument.from(`), which would bypass the class. Not followed: a class first stored in a
// variable or wrapped in parentheses (`new (C)()`), one loaded with `import()`, `require` or
// `import x = require()`, and a module named with a `.js` extension.
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

const isRepository = (file) =>
  file.startsWith('src/lambda/lib/repositories/') || file === 'src/lambda/lib/ws/connectionRepository.ts'

const CLIENT_FILE = 'src/lambda/utils/CustomDynamoClient.ts'

// The DynamoDB client constructors a file can reach, by what it imports: the default export of
// utils/CustomDynamoClient, and the client classes of the AWS SDK's two DynamoDB packages.
const CLIENT_EXPORTS = [
  { kind: 'custom', module: /(^|\/)CustomDynamoClient$/, name: 'default' },
  { kind: 'sdk', module: /^@aws-sdk\/client-dynamodb$/, name: 'DynamoDBClient' },
  { kind: 'sdk', module: /^@aws-sdk\/client-dynamodb$/, name: 'DynamoDB' },
  { kind: 'sdk', module: /^@aws-sdk\/lib-dynamodb$/, name: 'DynamoDBDocumentClient' },
  { kind: 'sdk', module: /^@aws-sdk\/lib-dynamodb$/, name: 'DynamoDBDocument' },
]

// Local name -> 'custom' | 'sdk' for every import of a client constructor, and namespace name ->
// the exports above it holds. `import type` imports build nothing and are left out.
function clientBindings(source) {
  const names = new Map()
  const namespaces = new Map()
  for (const statement of source.statements) {
    const clause = ts.isImportDeclaration(statement) ? statement.importClause : undefined
    if (!clause || clause.isTypeOnly || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const exports = CLIENT_EXPORTS.filter((entry) => entry.module.test(statement.moduleSpecifier.text))
    if (!exports.length) continue
    const kindOf = (name) => exports.find((entry) => entry.name === name)?.kind
    if (clause.name && kindOf('default')) names.set(clause.name.text, kindOf('default'))
    const bindings = clause.namedBindings
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.set(bindings.name.text, exports)
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const kind = !element.isTypeOnly && kindOf((element.propertyName ?? element.name).text)
        if (kind) names.set(element.name.text, kind)
      }
    }
  }
  return { names, namespaces }
}

// The kind of client constructor an expression names: the name it was imported under, or
// `sdk.DynamoDBClient` through a namespace import.
function clientKind(expression, bindings) {
  if (ts.isIdentifier(expression)) return bindings.names.get(expression.text)
  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    const exports = bindings.namespaces.get(expression.expression.text) ?? []
    return exports.find((entry) => entry.name === expression.name.text)?.kind
  }
  return undefined
}

// The kind of client constructor an export declaration hands on: `export { C }` of a name the file
// imported a constructor under, `export * from` a client module, or a named export of one of its
// constructors. `export type` hands on none.
function exportKind(node, bindings) {
  if (node.isTypeOnly) return undefined
  if (!node.moduleSpecifier) {
    const elements = node.exportClause && ts.isNamedExports(node.exportClause) ? node.exportClause.elements : []
    return elements
      .filter((element) => !element.isTypeOnly)
      .map((element) => bindings.names.get((element.propertyName ?? element.name).text))
      .find(Boolean)
  }
  if (!ts.isStringLiteral(node.moduleSpecifier)) return undefined
  const exports = CLIENT_EXPORTS.filter((entry) => entry.module.test(node.moduleSpecifier.text))
  const clause = node.exportClause
  const named =
    clause && ts.isNamedExports(clause)
      ? exports.filter((entry) =>
          clause.elements.some((element) => !element.isTypeOnly && (element.propertyName ?? element.name).text === entry.name)
        )
      : exports
  return named[0]?.kind
}

// A DynamoDB client opened where it should not be: a CustomDynamoClient built, extended or
// exported on outside the repositories, or an SDK client built, extended or exported on anywhere
// in the lambda code but CustomDynamoClient.ts.
function opensClient(node, { bindings, file }) {
  let kind
  if (ts.isNewExpression(node) || ts.isExportAssignment(node)) kind = clientKind(node.expression, bindings)
  else if (ts.isExportDeclaration(node)) kind = exportKind(node, bindings)
  else if (ts.isHeritageClause(node) && node.token === ts.SyntaxKind.ExtendsKeyword) {
    kind = node.types.map((type) => clientKind(type.expression, bindings)).find(Boolean)
  } else if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'from' &&
    clientKind(node.expression.expression, bindings) === 'sdk'
  ) {
    kind = 'sdk'
  }
  if (kind === 'custom') return !isRepository(file)
  return kind === 'sdk' && file.startsWith('src/lambda/') && file !== CLIENT_FILE
}

const ASSERTION_HINT = 'AGENTS.md forbids new type assertions and explicit any; model or narrow the value instead.'

const METRICS = {
  asAssertions: {
    countsIn: (file) => !isTestSupport(file),
    hint: ASSERTION_HINT,
    label: 'type assertions outside tests',
    matches: (node) => (ts.isAsExpression(node) && !isConstAssertion(node)) || ts.isTypeAssertionExpression(node),
  },
  explicitAny: {
    countsIn: () => true,
    hint: ASSERTION_HINT,
    label: 'explicit any types',
    matches: (node) => node.kind === ts.SyntaxKind.AnyKeyword,
  },
  dynamoClientsOutsideRepositories: {
    countsIn: (file) => !isTestSupport(file),
    hint: 'New table access goes into the repository of its table in src/lambda/lib/repositories/ (README there), never into a client of its own.',
    label: 'DynamoDB clients outside repositories',
    matches: opensClient,
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
  const scope = { bindings: clientBindings(source), file }
  const visit = (node) => {
    for (const [name, metric] of metrics) {
      if (metric.matches(node, scope)) {
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
  console.error(`  ${metric.hint}`)
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

// Run as a script, the gate; required (by its test), only the matcher.
if (require.main === module) main()

module.exports = { locate }
