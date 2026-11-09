// Gates three things AGENTS.md forbids but no lint rule can: type assertions (`x as T`, `<T>x`)
// outside tests, explicit `any` anywhere, and DynamoDB clients opened outside their table's
// repository.
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
// exports of each non-test file. It counts a CustomDynamoClient built, subclassed or exported on
// (re-exported, or imported and exported again) under whatever name the file imports it as, except
// one construction per repository on its own table (KOE-1576):
// `new CustomDynamoClient(CONFIG.<x>Table)` in repositories/<x>Repository.ts, or on
// CONFIG.wsConnectionsTable in ws/connectionRepository.ts, with CONFIG imported from
// src/lambda/config.ts under any name. A second one, another table, or the table name written any
// other way counts, so each table has exactly one client, in the file named after it. In the lambda
// code but CustomDynamoClient.ts it counts an SDK client built,
// subclassed or exported on directly (`new DynamoDBClient(`, `new DynamoDB(`,
// `DynamoDBDocumentClient.from(`, `DynamoDBDocument.from(`), which would bypass the class. Not followed: a class first stored in a
// variable or wrapped in parentheses (`new (C)()`), one loaded with `import()`, `require` or
// `import x = require()`, and a module named with a `.js` extension.
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { parseSync } = require('oxc-parser')

const ROOT = path.resolve(__dirname, '..')
const SOURCE_DIR = 'src'
const BASELINE_FILE = 'scripts/ratchet-baseline.json'

const isTestSupport = (file) =>
  /\.test\.tsx?$/.test(file) ||
  /(^|\/)(__mocks__|global-mocks|test-utils)\//.test(file) ||
  /(^|\/)setupTests\.tsx?$/.test(file)

// The parser's syntax tree is ESTree with the TypeScript nodes of typescript-eslint.
const isIdentifier = (node) => node?.type === 'Identifier'

// `a.b`: a member read by a written-out name, not `a[b]`.
const isPropertyAccess = (node) => node?.type === 'MemberExpression' && !node.computed && isIdentifier(node.property)

// The name of an import or export specifier, written as an identifier or a string.
const nameOf = (node) => node.name ?? node.value

const isConstAssertion = (node) =>
  node.typeAnnotation.type === 'TSTypeReference' && isIdentifier(node.typeAnnotation.typeName) && node.typeAnnotation.typeName.name === 'const'

// The CONFIG key of the one table a repository file may open a client on: `<x>Table` for
// repositories/<x>Repository.ts, wsConnectionsTable for the WebSocket connection repository only,
// so a repositories/wsConnectionsRepository.ts has no table of its own.
const WS_TABLE = 'wsConnectionsTable'
const ownTable = (file) => {
  if (file === 'src/lambda/lib/ws/connectionRepository.ts') return WS_TABLE
  const name = /^src\/lambda\/lib\/repositories\/(\w+)Repository\.ts$/.exec(file)?.[1]
  const table = name && `${name}Table`
  return table === WS_TABLE ? undefined : table
}

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

// Local name -> 'custom' | 'sdk' for every import of a client constructor, namespace name -> the
// exports above it holds, and the names CONFIG is imported under. `import type` imports build
// nothing and are left out.
const valueImports = (program) =>
  program.body.filter((statement) => statement.type === 'ImportDeclaration' && statement.importKind !== 'type')

function clientBindings(program, file) {
  const names = new Map()
  const namespaces = new Map()
  for (const statement of valueImports(program)) {
    const exports = CLIENT_EXPORTS.filter((entry) => entry.module.test(statement.source.value))
    if (!exports.length) continue
    const kindOf = (name) => exports.find((entry) => entry.name === name)?.kind
    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportDefaultSpecifier' && kindOf('default')) names.set(specifier.local.name, kindOf('default'))
      if (specifier.type === 'ImportNamespaceSpecifier') namespaces.set(specifier.local.name, exports)
      if (specifier.type === 'ImportSpecifier') {
        const kind = specifier.importKind !== 'type' && kindOf(nameOf(specifier.imported))
        if (kind) names.set(specifier.local.name, kind)
      }
    }
  }
  return { configs: configBindings(program, file), names, namespaces }
}

const LAMBDA_CONFIG = 'src/lambda/config'

// The local names the file imports the CONFIG of src/lambda/config.ts under.
function configBindings(program, file) {
  const configs = new Set()
  for (const statement of valueImports(program)) {
    if (path.posix.join(path.posix.dirname(file), statement.source.value) !== LAMBDA_CONFIG) continue
    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportSpecifier' && nameOf(specifier.imported) === 'CONFIG') configs.add(specifier.local.name)
    }
  }
  return configs
}

// The first `new CustomDynamoClient(CONFIG.<table>)` of a repository file on its own table, the
// one client the file may open. Any other argument, or a second construction, is no such client.
function isOwnClient(node, scope) {
  if (scope.ownClientOpened || node.type !== 'NewExpression' || node.arguments.length !== 1) return false
  const [table] = node.arguments
  const own =
    isPropertyAccess(table) &&
    isIdentifier(table.object) &&
    scope.bindings.configs.has(table.object.name) &&
    table.property.name === ownTable(scope.file)
  scope.ownClientOpened = own
  return own
}

// The kind of client constructor an expression names: the name it was imported under, or
// `sdk.DynamoDBClient` through a namespace import.
function clientKind(expression, bindings) {
  if (isIdentifier(expression)) return bindings.names.get(expression.name)
  if (isPropertyAccess(expression) && isIdentifier(expression.object)) {
    const exports = bindings.namespaces.get(expression.object.name) ?? []
    return exports.find((entry) => entry.name === expression.property.name)?.kind
  }
  return undefined
}

// The kind of client constructor an export declaration hands on: `export { C }` of a name the file
// imported a constructor under, `export * from` a client module, or a named export of one of its
// constructors. `export type` hands on none.
function exportKind(node, bindings) {
  if (node.exportKind === 'type') return undefined
  const specifiers = (node.specifiers ?? []).filter((specifier) => specifier.exportKind !== 'type')
  if (!node.source) return specifiers.map((specifier) => bindings.names.get(nameOf(specifier.local))).find(Boolean)
  const exports = CLIENT_EXPORTS.filter((entry) => entry.module.test(node.source.value))
  const named =
    node.type === 'ExportNamedDeclaration'
      ? exports.filter((entry) => specifiers.some((specifier) => nameOf(specifier.local) === entry.name))
      : exports
  return named[0]?.kind
}

// The class a class extends, or the classes and interfaces an interface extends.
const extendedClasses = (node) => {
  if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') return node.superClass ? [node.superClass] : []
  if (node.type === 'TSInterfaceDeclaration') return node.extends.map((heritage) => heritage.expression)
  return []
}

// A DynamoDB client opened where it should not be: a CustomDynamoClient built, extended or
// exported on anywhere but the one client a repository builds on its own table, or an SDK client
// built, extended or exported on anywhere in the lambda code but CustomDynamoClient.ts.
function opensClient(node, scope) {
  const { bindings, file } = scope
  let kind
  let at = node
  if (node.type === 'NewExpression') kind = clientKind(node.callee, bindings)
  else if (node.type === 'ExportDefaultDeclaration') kind = clientKind(node.declaration, bindings)
  else if (node.type === 'TSExportAssignment') kind = clientKind(node.expression, bindings)
  else if ((node.type === 'ExportNamedDeclaration' && !node.declaration) || node.type === 'ExportAllDeclaration') {
    kind = exportKind(node, bindings)
  } else if (extendedClasses(node).length) {
    at = extendedClasses(node)[0]
    kind = extendedClasses(node)
      .map((expression) => clientKind(expression, bindings))
      .find(Boolean)
  } else if (
    node.type === 'CallExpression' &&
    isPropertyAccess(node.callee) &&
    node.callee.property.name === 'from' &&
    clientKind(node.callee.object, bindings) === 'sdk'
  ) {
    kind = 'sdk'
  }
  if (kind === 'custom') return !isOwnClient(node, scope) && at
  return kind === 'sdk' && file.startsWith('src/lambda/') && file !== CLIENT_FILE && at
}

const ASSERTION_HINT = 'AGENTS.md forbids new type assertions and explicit any; model or narrow the value instead.'

const METRICS = {
  asAssertions: {
    countsIn: (file) => !isTestSupport(file),
    hint: ASSERTION_HINT,
    label: 'type assertions outside tests',
    matches: (node) => (node.type === 'TSAsExpression' && !isConstAssertion(node)) || node.type === 'TSTypeAssertion',
  },
  explicitAny: {
    countsIn: () => true,
    hint: ASSERTION_HINT,
    label: 'explicit any types',
    matches: (node) => node.type === 'TSAnyKeyword',
  },
  dynamoClientsOutsideRepositories: {
    countsIn: (file) => !isTestSupport(file),
    hint: 'New table access goes into the repository of its table in src/lambda/lib/repositories/ (README there), never into a client of its own.',
    label: "DynamoDB clients outside their table's repository",
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

// The 1-based line of each offset into the text.
const lineOf = (text) => {
  const starts = [0]
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) starts.push(at + 1)
  return (offset) => {
    let low = 0
    let high = starts.length - 1
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if (starts[middle] <= offset) low = middle
      else high = middle - 1
    }
    return low + 1
  }
}

// The syntax nodes under a node, in source order.
const children = (node) =>
  Object.values(node)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value) => typeof value?.type === 'string')

// Returns `${file}:${line}` for every match of every metric in the given text of the file. A match
// is located at the node a metric returns, or at the node it matched. A file that does not parse
// fails: counting a part of it would let a match through.
function locate(file, text) {
  const { errors, program } = parseSync(file, text)
  if (errors.length) throw new Error(`ratchet: ${file} does not parse: ${errors[0].message}`)
  const line = lineOf(text)
  const metrics = Object.entries(METRICS).filter(([, metric]) => metric.countsIn(file))
  const found = Object.fromEntries(Object.keys(METRICS).map((name) => [name, []]))
  const scope = { bindings: clientBindings(program, file), file, ownClientOpened: false }
  const visit = (node) => {
    for (const [name, metric] of metrics) {
      const match = metric.matches(node, scope)
      if (match) found[name].push(`${file}:${line((match === true ? node : match).start)}`)
    }
    for (const child of children(node)) visit(child)
  }
  visit(program)
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
