/**
 * Which DynamoDB tables a lambda's code can reach, and which its template grants (KOE-1492).
 *
 * A lambda that starts reading a table through shared lib code gets no new policy by itself, and
 * nothing before the deploy notices: the unit tests mock the database and the browser tests run
 * against DynamoDB-local, where IAM does not exist. PutEvent died in AccessDenied that way
 * (KOE-1465). `template.test.ts` compares the two sides this module computes.
 *
 * The code side follows calls, not imports. Nearly every handler imports a module that opens a
 * client on some table at load (`lib/repositories/dataVersionRepository`, `lib/email`, `lib/ws/connectionRepository`),
 * so an import graph would grant every lambda every table. Instead the walk starts at the code that
 * runs. From the handler's default export it follows each identifier to its declaration: a function
 * it calls, a module-level variable it reads, a class member it uses, each reached whole. It also
 * runs the module-level code of every file the handler imports (KOE-1557): the statements less the
 * function bodies and instance members in them, plus static blocks and static fields. A function that
 * code calls (`init()`, `(() => { ... })()`, a factory), or writes out as an argument of a call
 * (`forEach`, `then`, a Promise executor), runs its own body there, not the functions it only builds
 * or returns; a class it builds runs its constructor chain and instance fields. What that code only
 * names is not reached. A table counts only where
 * code reached or run that way calls a client method on it (or a transaction item names it).
 *
 * Tables, clients and functions handed around as arguments (`createDynamoLease({ client, table })`,
 * a repository function passed as `readAll` to `createOfficialDirectoryLambda`) are followed
 * through a flow-insensitive binding of parameters and interface properties to the values the
 * reached code passes them, iterated to a fixed point per handler. A variable, a class
 * field or a property of an object literal also holds what the reached code writes to it later:
 * `=`, `??=`, `||=`, `&&=`, a destructuring assignment, a `for (x of ...)` loop, `delete`. A write in
 * a function nothing reached calls does not count, so a setter only another lambda calls changes
 * only that lambda. What the walk cannot follow it takes as unknown: an arithmetic assignment
 * (`+=`), a `for (x in ...)` variable, a for-of over anything but an array written out in the loop,
 * a position in an array pattern. `Object.assign` makes every property of its target unknown, and
 * a write through a computed key may be any property, so it is refused where its value does not fit
 * the property read (a table where an index goes).
 *
 * A table, index, client or options object the walk cannot name is an error; so is one that may be
 * something it can name or something it cannot (a call, `process.env`, a parameter nothing binds),
 * which is refused rather than taken for the named half. A write to a `table`, `index`, `TableName`
 * or `client` property of something that is no object literal is refused the same way, and so is a
 * write of a table or a client through a computed key, or an `Object.assign`, onto such a thing.
 *
 * What the walk does not model, and so can miss rather than refuse: a mutation through a setter
 * accessor or a function outside src (`Reflect.set`); a function that reaches a call made at import
 * only by being stored or returned first (`const f = make(); f()`, a callback kept in a variable and
 * handed on); a client method taken off the client (`const { read } = dynamoDB`,
 * `dynamoDB.read.call(...)`, `.apply`), or called as `x[key](...)` on a receiver neither typed as a
 * client nor known to hold one; a getter or anything else import-time code only names
 * (`Foo.instance` with a static getter), since that code reaches nothing by name; and a field read
 * from a base class through an instance the walk has not seen built. Being flow-insensitive, it may
 * also grant more than one run needs: after `table ??= CONFIG.xTable` the variable still holds the
 * undefined of its initializer, so the client's default table counts too, and a function written out
 * as an argument at import counts as run there even where the callee only keeps it.
 */
import type { Action } from './dynamoActions'
import path from 'node:path'
import ts from 'typescript'
import { indexKey } from './dynamoActions'

/**
 * The tables a handler reaches, as the CONFIG key (`eventTable`) or an index of it
 * (`userTable/index/gsiEmail`), per action, each use as `file:line (call chain)`.
 */
type TableUse = Map<string, Map<Action, string[]>>

interface MethodSpec {
  actions: Action[]
  /** Where the call names its table: a positional argument, the `table` property of an options argument, or only in its items. */
  table: { arg: number } | { option: number } | 'items'
}

const TRANSACTION_ACTIONS: Record<string, Action> = {
  ConditionCheck: 'ConditionCheckItem',
  Delete: 'DeleteItem',
  Put: 'PutItem',
  Update: 'UpdateItem',
}

/** The CustomDynamoClient methods, the action each sends and where each takes its table. A method missing here fails the analysis. */
const CLIENT_METHODS = new Map<string, MethodSpec>([
  ['batchDelete', { actions: ['BatchWriteItem'], table: { arg: 1 } }],
  ['batchGet', { actions: ['BatchGetItem'], table: { arg: 1 } }],
  ['batchWrite', { actions: ['BatchWriteItem'], table: { arg: 1 } }],
  ['delete', { actions: ['DeleteItem'], table: { arg: 1 } }],
  ['documentTransaction', { actions: [], table: 'items' }],
  ['query', { actions: ['Query'], table: { option: 0 } }],
  ['read', { actions: ['GetItem'], table: { arg: 1 } }],
  ['readAll', { actions: ['Scan'], table: { option: 0 } }],
  // The items that name no table take the call's default; which of the four they are is not followed.
  ['transaction', { actions: Object.values(TRANSACTION_ACTIONS), table: { arg: 1 } }],
  ['update', { actions: ['UpdateItem'], table: { arg: 2 } }],
  ['write', { actions: ['PutItem'], table: { arg: 1 } }],
])

/** The properties the walk reads a table, an index or a client from: a write to one of them through something it cannot name is refused. */
const READ_PROPERTIES = new Set(['client', 'index', 'table', 'TableName'])

const CONFIG_FILE = /[\\/]src[\\/]lambda[\\/]config\.ts$/
const CLIENT_FILE = /[\\/]src[\\/]lambda[\\/]utils[\\/]CustomDynamoClient\.ts$/
const CLIENT_CLASS = 'CustomDynamoClient'

/**
 * What an expression can evaluate to, as far as tables are concerned: `T:<key>` a table name from
 * CONFIG, `C:<key>` a client whose default table is that key, `S:<text>` a string literal (an index
 * name), `N:<id>` a function or object literal (looked up in `Context.nodes`), `U:` undefined (an
 * omitted optional argument or property, so that a query's index may be missing).
 */
type Value = string
type Values = Set<Value>

const NONE: Values = new Set()
const UNDEFINED: Values = new Set(['U:'])
/** A spread the walk cannot see into: the property may be anything, so a table or index read through it is refused. */
const UNKNOWN: Values = new Set(['?:'])

const withPrefix = (values: Values, prefix: 'T' | 'C' | 'S' | 'U' | '?') =>
  [...values].filter((value) => value.startsWith(`${prefix}:`)).map((value) => value.slice(2))

/** The CONFIG table keys among the values. */
const tableKeys = (values: Values) => withPrefix(values, 'T')

/** A unit is a module-level statement or a class member: what the walk reaches whole. */
type Unit = ts.Node

/** The left side of a write to a property: `options.table = ...`, `item['TableName'] = ...`, `delete options.index`. */
type PropertyTarget = ts.PropertyAccessExpression | ts.ElementAccessExpression

/** What one unit contains, computed once and shared by every handler that reaches it. */
interface UnitInfo {
  /** The units the identifiers in this one declare. */
  targets: Set<Unit>
  calls: (ts.CallExpression | ts.NewExpression)[]
  /** Assignments, `for` loops, `delete` and `Object.assign` calls: what else a variable or property can hold after its initializer. */
  writes: ts.Node[]
  literals: ts.ObjectLiteralExpression[]
  /** Calls of a CustomDynamoClient method, with the method's name. */
  clientCalls: { call: ts.CallExpression; method: string }[]
  /** Calls through an element access (`receiver[name](...)`), which may be client calls. */
  elementCalls: ts.CallExpression[]
  /** Object literals with a `TableName` (written out, shorthand or quoted), and transaction items with a computed key that may be one. */
  tableNameLiterals: ts.ObjectLiteralExpression[]
}

interface Context {
  checker: ts.TypeChecker
  /** `export const CONFIG = {...}` in config.ts. */
  config: ts.VariableDeclaration
  clientClass: ts.ClassDeclaration
  /** The program's own source files: no declaration files, nothing from node_modules. */
  files: ts.SourceFile[]
  nodes: Map<string, ts.Node>
  symbols: Map<ts.Node, ts.Symbol | undefined>
  units: Map<Unit, UnitInfo>
  /** What of a module-level statement runs at import: the same, less function bodies and instance members. */
  importViews: Map<ts.Statement, UnitInfo>
  /** What of a function's body runs when it is called at import: the same, less the functions inside it. */
  functionViews: Map<ts.Node, UnitInfo>
  /** The declaration each property of an object literal is written against, by property name. */
  literalProperties: Map<ts.ObjectLiteralExpression, Map<string, ts.Declaration>>
  /** The source files each file imports, for the statements that run at import. */
  imports: Map<ts.SourceFile, ts.SourceFile[]>
  /** Each class to the classes that extend it directly; built on the first `this.x` the walk reads. */
  subclasses?: Map<ts.ClassLikeDeclaration, ts.ClassLikeDeclaration[]>
}

interface HandlerState {
  /** Each reached unit and the unit that first reached it (the start has none). */
  via: Map<Unit, Unit | undefined>
  /**
   * Declaration (parameter, binding element, variable, class field) to the values the reached code
   * passes or writes it, and `<literal id>.<property>` to what is written to a property of one object
   * literal (`.[]` for a computed key).
   */
  env: Map<ts.Node | string, Values>
  /** Each property write that no class field takes, and what it writes, checked once the fixed point is reached. */
  written: Map<PropertyTarget, Values>
  /** The `Object.assign` calls the counted code makes, checked once the fixed point is reached. */
  assigns: Set<ts.CallExpression>
  /** Each function the import-time code calls, or instance field it initializes, and the statement or function that does it. */
  importRun: Map<ts.Node, Unit>
  /** `valuesOf` results, valid until the environment grows. */
  memo: Map<ts.Node, Values>
  changed: boolean
}

const location = (node: ts.Node) => {
  const file = node.getSourceFile()
  const { line } = file.getLineAndCharacterOfPosition(node.getStart())
  return `${path.relative(process.cwd(), file.fileName)}:${line + 1}`
}

const nodeId = (ctx: Context, node: ts.Node) => {
  const id = `N:${node.getSourceFile().fileName}:${node.pos}`
  ctx.nodes.set(id, node)
  return id
}

const isSourceNode = (node: ts.Node) => {
  const file = node.getSourceFile()
  return !file.isDeclarationFile && !file.fileName.includes('/node_modules/')
}

/** The symbol an identifier stands for, through import aliases and shorthand properties. */
const symbolOf = (ctx: Context, node: ts.Node): ts.Symbol | undefined => {
  if (ctx.symbols.has(node)) return ctx.symbols.get(node)
  let symbol: ts.Symbol | undefined
  if (ts.isIdentifier(node) && ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) {
    symbol = ctx.checker.getShorthandAssignmentValueSymbol(node.parent)
  } else {
    symbol = ctx.checker.getSymbolAtLocation(node)
  }
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = ctx.checker.getAliasedSymbol(symbol)
  ctx.symbols.set(node, symbol)
  return symbol
}

const declarationsOf = (ctx: Context, node: ts.Node): readonly ts.Declaration[] =>
  (symbolOf(ctx, node)?.declarations ?? []).filter(isSourceNode)

const isConfig = (ctx: Context, node: ts.Node) => symbolOf(ctx, node)?.declarations?.[0] === ctx.config

/** The unit a declaration belongs to: the module-level statement, or the class member, that holds it. */
const unitOf = (declaration: ts.Node): Unit | undefined => {
  let node = declaration
  while (node.parent && !ts.isSourceFile(node.parent)) {
    if (ts.isClassLike(node.parent)) return node
    node = node.parent
  }
  return node.parent ? node : undefined
}

const unitName = (unit: Unit): string => {
  if (ts.isVariableStatement(unit)) return unit.declarationList.declarations.map((d) => d.name.getText()).join(', ')
  if (ts.isFunctionDeclaration(unit) || ts.isClassDeclaration(unit)) return unit.name?.text ?? 'default'
  if (ts.isClassElement(unit) && unit.name && ts.isClassLike(unit.parent)) {
    return `${unit.parent.name?.text ?? 'class'}.${unit.name.getText()}`
  }
  return ts.isConstructorDeclaration(unit) ? `new ${unit.parent.name?.text ?? 'class'}` : unit.getText().slice(0, 40)
}

const addValues = (state: HandlerState, key: ts.Node | string, values: Values) => {
  if (!values.size) return
  const existing = state.env.get(key) ?? new Set<Value>()
  const before = existing.size
  for (const value of values) existing.add(value)
  if (existing.size !== before) state.changed = true
  state.env.set(key, existing)
}

const union = (...sets: Values[]): Values => {
  const result = new Set<Value>()
  for (const set of sets) for (const value of set) result.add(value)
  return result
}

const isFunctionLike = (node: ts.Node): node is ts.SignatureDeclaration =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isConstructorDeclaration(node)

/** The text of a property name the walk can read without evaluating anything: `table`, `'table'`, `0`. */
const staticName = (name: ts.Node): string | undefined =>
  ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name) ? name.text : undefined

/** The CONFIG key a binding element of `const { xTable } = CONFIG` names, if it is one. */
const configKeyOfBinding = (ctx: Context, element: ts.BindingElement): string | undefined => {
  const pattern = element.parent
  const declaration = pattern.parent
  if (!ts.isObjectBindingPattern(pattern) || !ts.isVariableDeclaration(declaration)) return undefined
  if (!declaration.initializer || !isConfig(ctx, declaration.initializer)) return undefined
  if (element.propertyName) return keyOf(element.propertyName)
  return ts.isIdentifier(element.name) ? element.name.text : undefined
}

const tableValue = (key: string): Values => (key.endsWith('Table') ? new Set([`T:${key}`]) : NONE)

/** The name a property of an object literal is written under, when it can be read without evaluating: `table`, `'table'`, `['table']`. */
const keyOf = (name: ts.PropertyName | undefined): string | undefined => {
  if (!name) return undefined
  if (!ts.isComputedPropertyName(name)) return staticName(name)
  return ts.isStringLiteralLike(name.expression) || ts.isNumericLiteral(name.expression)
    ? name.expression.text
    : undefined
}

const propertyNamed = (literal: ts.ObjectLiteralExpression, name: string) =>
  literal.properties.find((p) => keyOf(p.name) === name)

/**
 * The names a computed key can be: those of the strings it evaluates to (`const key = 'table'`), or
 * undefined where it may be anything.
 */
const keyNames = (ctx: Context, state: HandlerState, key: ts.Expression): string[] | undefined => {
  if (!givesWholeNames(ctx, key)) return undefined
  const values = valuesOf(ctx, state, key)
  return values.size && onlyKinds(values, ['S:']) ? withPrefix(values, 'S') : undefined
}

/**
 * Whether a key expression can only evaluate to one of the strings written in it: a string, a name
 * whose initializer is such a key, a conditional of such keys. `valuesOf` unions the two sides of
 * `'read' + 'All'`, which is no name at all, so a concatenation or a template is a key that may be
 * anything.
 */
const givesWholeNames = (ctx: Context, key: ts.Expression, seen = new Set<ts.Node>()): boolean => {
  const node = unwrap(key)
  if (seen.has(node)) return true
  seen.add(node)
  if (ts.isStringLiteralLike(node)) return true
  if (ts.isConditionalExpression(node)) {
    return givesWholeNames(ctx, node.whenTrue, seen) && givesWholeNames(ctx, node.whenFalse, seen)
  }
  if (!ts.isIdentifier(node)) return false
  return declarationsOf(ctx, node).every(
    (d) => !ts.isVariableDeclaration(d) || !d.initializer || givesWholeNames(ctx, d.initializer, seen)
  )
}

const literalsOf = (ctx: Context, values: Values) =>
  [...values]
    .map((value) => ctx.nodes.get(value))
    .filter((node): node is ts.ObjectLiteralExpression => node !== undefined && ts.isObjectLiteralExpression(node))

const hasUndefined = (values: Values) => values.has('U:')

const withoutUndefined = (values: Values): Values => new Set([...values].filter((value) => value !== 'U:'))

const isUndefined = (node: ts.Node) => ts.isIdentifier(node) && node.text === 'undefined'

/** Stands for every property written through a computed key (`options[key] = ...`). */
const ANY_PROPERTY = '[]'

/** The environment key of one property of one object literal. */
const propertyKey = (ctx: Context, literal: ts.ObjectLiteralExpression, name: string) =>
  `${nodeId(ctx, literal)}.${name}`

/** What the counted code writes to the property `name` of one object literal, by name or through a computed key. */
const writtenProperty = (ctx: Context, state: HandlerState, literal: ts.ObjectLiteralExpression, name: string) =>
  union(
    state.env.get(propertyKey(ctx, literal, name)) ?? NONE,
    state.env.get(propertyKey(ctx, literal, ANY_PROPERTY)) ?? NONE
  )

/**
 * The property `name` of one object literal, read in source order: a later property wins over an
 * earlier one, a spread brings the property of each literal it can stand for (or leaves the value as
 * it was where that literal lacks it), and a spread of something that is no literal makes it UNKNOWN.
 * A literal without the property has it UNDEFINED, which matters for an optional index or table.
 * Whatever the counted code writes to the property later is added: the walk is flow-insensitive.
 */
const literalProperty = (
  ctx: Context,
  state: HandlerState,
  literal: ts.ObjectLiteralExpression,
  name: string,
  visiting = new Set<ts.ObjectLiteralExpression>()
): Values => {
  // A literal that spreads itself through a parameter (`retry({ ...options, attempt })`) adds nothing
  // on the second visit.
  if (visiting.has(literal)) return NONE
  visiting.add(literal)
  let current: Values = UNDEFINED
  for (const property of literal.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spreadValues = valuesOf(ctx, state, property.expression)
      const sources = literalsOf(ctx, spreadValues)
      // A spread of anything but a literal may bring the property or not: unknown, whatever else it can be.
      const next = new Set<Value>(sources.length && !hasUnknown(spreadValues) ? [] : UNKNOWN)
      if (!sources.length) {
        current = union(current, next)
        continue
      }
      for (const source of sources) {
        const spread = literalProperty(ctx, state, source, name, visiting)
        // A source without the property leaves the value as it was; one with it overrides.
        const values = hasUndefined(spread) ? union(current, withoutUndefined(spread)) : spread
        for (const value of values) next.add(value)
      }
      current = next
    } else if (keyOf(property.name) === name) {
      current = valuesOfProperty(ctx, state, property)
    } else if (property.name && ts.isComputedPropertyName(property.name) && keyOf(property.name) === undefined) {
      current = computedProperty(ctx, state, property, property.name, name, current)
    }
  }
  visiting.delete(literal)
  return union(current, writtenProperty(ctx, state, literal, name))
}

const hasUnknown = (values: Values) => values.has('?:')

/** A property written under a computed key: it is the property when the key can only be its name, may be when the key may be anything. */
const computedProperty = (
  ctx: Context,
  state: HandlerState,
  property: ts.ObjectLiteralElementLike,
  key: ts.ComputedPropertyName,
  name: string,
  current: Values
): Values => {
  const names = keyNames(ctx, state, key.expression)
  if (names && !names.includes(name)) return current
  const values = valuesOfProperty(ctx, state, property)
  return names?.length === 1 ? values : union(current, values)
}

/** The property `name` of each object literal among `values`; unknown where a receiver is. */
const propertyOf = (ctx: Context, state: HandlerState, values: Values, name: string): Values =>
  union(
    ...literalsOf(ctx, values).map((literal) => literalProperty(ctx, state, literal, name)),
    hasUnknown(values) ? UNKNOWN : NONE
  )

const valuesOfProperty = (ctx: Context, state: HandlerState, property: ts.ObjectLiteralElementLike): Values => {
  if (ts.isPropertyAssignment(property)) return valuesOf(ctx, state, property.initializer)
  if (ts.isShorthandPropertyAssignment(property)) return valuesOf(ctx, state, property.name)
  if (ts.isMethodDeclaration(property)) return new Set([nodeId(ctx, property)])
  return NONE
}

const valuesOfDeclaration = (ctx: Context, state: HandlerState, declaration: ts.Declaration): Values => {
  const bound = state.env.get(declaration) ?? NONE
  if (ts.isBindingElement(declaration)) {
    const key = configKeyOfBinding(ctx, declaration)
    return key === undefined ? bound : union(bound, tableValue(key))
  }
  if (ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration)) {
    return declaration.initializer ? union(bound, valuesOf(ctx, state, declaration.initializer)) : bound
  }
  if (ts.isPropertyAssignment(declaration) || ts.isShorthandPropertyAssignment(declaration)) {
    return union(bound, valuesOfProperty(ctx, state, declaration))
  }
  if (isFunctionLike(declaration) || ts.isClassLike(declaration)) return new Set([nodeId(ctx, declaration)])
  return bound
}

const isClientConstruction = (ctx: Context, node: ts.NewExpression) =>
  declarationsOf(ctx, node.expression).includes(ctx.clientClass)

const valuesOfClientConstruction = (ctx: Context, state: HandlerState, node: ts.NewExpression): Values => {
  if (!isClientConstruction(ctx, node) || !node.arguments?.[0]) return NONE
  const tables = valuesOf(ctx, state, node.arguments[0])
  if (hasUnknown(tables)) return UNKNOWN
  return new Set(tableKeys(tables).map((key) => `C:${key}`))
}

/** The expression inside parentheses, `as`, `satisfies` and `!`. */
const unwrap = (node: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(node) ||
  ts.isAsExpression(node) ||
  ts.isSatisfiesExpression(node) ||
  ts.isNonNullExpression(node)
    ? unwrap(node.expression)
    : node

/** Nothing known about a name (`process.env.X`, an unbound parameter, a declaration outside src) is unknown, not empty. */
const orUnknown = (values: Values): Values => (values.size ? values : UNKNOWN)

/** Whether a node gives `this` a value of its own: a function that is no arrow, a class field or a static block. */
const bindsThis = (node: ts.Node) =>
  (ts.isFunctionLike(node) && !ts.isArrowFunction(node)) ||
  ts.isPropertyDeclaration(node) ||
  ts.isClassStaticBlockDeclaration(node)

/** The class whose instance a `this` stands for, when it is written in a class member; undefined anywhere else. */
const thisClass = (node: ts.Node): ts.ClassLikeDeclaration | undefined => {
  let current = node.parent
  while (current && !bindsThis(current)) current = current.parent
  return current?.parent && ts.isClassLike(current.parent) ? current.parent : undefined
}

const subclassesOf = (ctx: Context): Map<ts.ClassLikeDeclaration, ts.ClassLikeDeclaration[]> => {
  if (ctx.subclasses) return ctx.subclasses
  const subclasses = new Map<ts.ClassLikeDeclaration, ts.ClassLikeDeclaration[]>()
  const visit = (node: ts.Node) => {
    if (ts.isClassLike(node)) {
      const extended = node.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
      for (const type of extended?.types ?? []) {
        for (const base of declarationsOf(ctx, type.expression).filter(ts.isClassLike)) {
          subclasses.set(base, [...(subclasses.get(base) ?? []), node])
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  for (const file of ctx.files) visit(file)
  ctx.subclasses = subclasses
  return subclasses
}

/** The members named `name` of every class that extends `base`, at any depth: what `this.name` may also be. */
const overridesOf = (ctx: Context, base: ts.ClassLikeDeclaration, name: string): ts.ClassElement[] => {
  const members: ts.ClassElement[] = []
  const seen = new Set<ts.ClassLikeDeclaration>()
  const pending = [...(subclassesOf(ctx).get(base) ?? [])]
  for (let sub = pending.pop(); sub; sub = pending.pop()) {
    if (seen.has(sub)) continue
    seen.add(sub)
    members.push(...sub.members.filter((member) => member.name && staticName(member.name) === name))
    pending.push(...(subclassesOf(ctx).get(sub) ?? []))
  }
  return members
}

const valuesOfAccess = (ctx: Context, state: HandlerState, node: ts.PropertyAccessExpression): Values => {
  if (isConfig(ctx, node.expression)) return tableValue(node.name.text)
  const own = declarationsOf(ctx, node.name)
  // `this.x` in a class member is the field: its initializer, what the class writes to it, and the
  // same of every subclass that declares it again. Any other `this` stays unknown.
  const owner = node.expression.kind === ts.SyntaxKind.ThisKeyword ? thisClass(node.expression) : undefined
  if (owner) {
    const members = [...own, ...overridesOf(ctx, owner, node.name.text)]
    return orUnknown(union(...members.map((d) => valuesOfDeclaration(ctx, state, d))))
  }
  const values = own.map((d) => valuesOfDeclaration(ctx, state, d))
  return orUnknown(union(...values, propertyOf(ctx, state, valuesOf(ctx, state, node.expression), node.name.text)))
}

const computeValues = (ctx: Context, state: HandlerState, node: ts.Node): Values => {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
    return valuesOf(ctx, state, node.expression)
  }
  if (ts.isSatisfiesExpression(node)) return valuesOf(ctx, state, node.expression)
  if (ts.isConditionalExpression(node)) {
    return union(valuesOf(ctx, state, node.whenTrue), valuesOf(ctx, state, node.whenFalse))
  }
  if (ts.isBinaryExpression(node)) return union(valuesOf(ctx, state, node.left), valuesOf(ctx, state, node.right))
  if (ts.isStringLiteralLike(node)) return new Set([`S:${node.text}`])
  if (isUndefined(node)) return UNDEFINED
  if (ts.isObjectLiteralExpression(node) || isFunctionLike(node) || ts.isClassExpression(node)) {
    return new Set([nodeId(ctx, node)])
  }
  if (ts.isNewExpression(node)) return valuesOfClientConstruction(ctx, state, node)
  if (ts.isPropertyAccessExpression(node)) return valuesOfAccess(ctx, state, node)
  if (ts.isIdentifier(node)) {
    return orUnknown(union(...declarationsOf(ctx, node).map((d) => valuesOfDeclaration(ctx, state, d))))
  }
  // A call, `null`, an element access, a template: anything the walk does not model is unknown, so
  // that a value it can name beside one it cannot is refused rather than taken for the named half.
  return UNKNOWN
}

/** Every table, client, function or object literal an expression can evaluate to. */
const valuesOf = (ctx: Context, state: HandlerState, node: ts.Node): Values => {
  const memoized = state.memo.get(node)
  if (memoized) return memoized
  // Guards a cycle (`const a = b`, `const b = a`) with the empty set until the result is in.
  state.memo.set(node, NONE)
  const values = computeValues(ctx, state, node)
  state.memo.set(node, values)
  return values
}

/**
 * What a `for (x of ...)` loop gives its variable: the elements of an array written out in the loop
 * head. Anything else (a variable holding an array, a call, a set) is unknown, never empty.
 */
const elementsOf = (ctx: Context, state: HandlerState, node: ts.Expression): Values => {
  const array = unwrap(node)
  if (!ts.isArrayLiteralExpression(array)) return UNKNOWN
  return union(
    ...array.elements.map((element) => {
      if (ts.isSpreadElement(element)) return elementsOf(ctx, state, element.expression)
      return ts.isOmittedExpression(element) ? NONE : valuesOf(ctx, state, element)
    })
  )
}

/** The functions a call can land in: the declaration the callee names, or whatever was bound to it. */
const calleesOf = (ctx: Context, state: HandlerState, call: ts.CallExpression | ts.NewExpression) => {
  if (call.expression.kind === ts.SyntaxKind.SuperKeyword) {
    const owner = thisClass(call.expression)
    const base = owner && baseClassOf(ctx, owner)
    return base ? constructorsOf(ctx, base) : []
  }
  const callees: ts.SignatureDeclaration[] = []
  for (const value of valuesOf(ctx, state, call.expression)) {
    const node = ctx.nodes.get(value)
    if (!node) continue
    if (isFunctionLike(node)) callees.push(node)
    if (ts.isClassLike(node)) callees.push(...constructorsOf(ctx, node))
  }
  return callees
}

/** The class a class extends, if the walk can name it. */
const baseClassOf = (ctx: Context, cls: ts.ClassLikeDeclaration): ts.ClassLikeDeclaration | undefined => {
  const extended = cls.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
  const type = extended?.types[0]
  if (!type) return undefined
  // `class Top extends Mid` with `const Mid = class extends Base {}`: the base is the initializer.
  const bases = declarationsOf(ctx, type.expression).map((d) =>
    ts.isVariableDeclaration(d) && d.initializer ? unwrap(d.initializer) : d
  )
  return bases.find(ts.isClassLike)
}

/** A class and the classes it extends, nearest first. */
const classChain = (ctx: Context, cls: ts.ClassLikeDeclaration): ts.ClassLikeDeclaration[] => {
  const chain: ts.ClassLikeDeclaration[] = []
  for (let current: ts.ClassLikeDeclaration | undefined = cls; current && !chain.includes(current); ) {
    chain.push(current)
    current = baseClassOf(ctx, current)
  }
  return chain
}

/** The constructor `new C(...)` runs: C's own, or, where C declares none, the nearest base class's, which gets the same arguments. */
const constructorsOf = (ctx: Context, cls: ts.ClassLikeDeclaration): ts.ConstructorDeclaration[] => {
  for (const current of classChain(ctx, cls)) {
    const constructors = current.members.filter(ts.isConstructorDeclaration)
    if (constructors.length) return constructors
  }
  return []
}

/** The instance fields with an initializer that `new C(...)` runs: C's and every base class's. */
const instanceFieldsOf = (ctx: Context, call: ts.CallExpression | ts.NewExpression, state: HandlerState) =>
  ts.isNewExpression(call)
    ? [...valuesOf(ctx, state, call.expression)]
        .map((value) => ctx.nodes.get(value))
        .filter((node): node is ts.ClassLikeDeclaration => node !== undefined && ts.isClassLike(node))
        .flatMap((cls) => classChain(ctx, cls))
        .flatMap((cls) => cls.members.filter(ts.isPropertyDeclaration))
        .filter((field) => field.initializer && !isStatic(field))
    : []

/** The values with a default in place of undefined: `(index = 'gsiEmail')` called without one is the literal. */
const withDefault = (ctx: Context, state: HandlerState, values: Values, initializer: ts.Expression | undefined) => {
  if (!initializer || !hasUndefined(values)) return values
  return union(withoutUndefined(values), valuesOf(ctx, state, initializer))
}

/** The property a write names: `options.table`, `options['table']`, `options[key]` with a key that can only be one name; undefined for any other computed key. */
const writtenName = (ctx: Context, state: HandlerState, target: PropertyTarget): string | undefined => {
  if (ts.isPropertyAccessExpression(target)) return target.name.text
  const key = target.argumentExpression
  if (ts.isStringLiteralLike(key) || ts.isNumericLiteral(key)) return key.text
  const names = keyNames(ctx, state, key)
  return names?.length === 1 ? names[0] : undefined
}

const isClassMember = (declaration: ts.Declaration) => ts.isClassLike(declaration.parent)

/**
 * A write to a property. A class field takes it whole, whichever instance it is written on. Otherwise
 * it goes to that property of each object literal the receiver can be, so that one handler's
 * `options.table = ...` never reaches another handler's literal of the same type; the receivers are
 * checked once the fixed point is reached (`checkWrites`).
 */
const writeProperty = (ctx: Context, state: HandlerState, target: PropertyTarget, values: Values) => {
  const name = writtenName(ctx, state, target)
  const fields = ts.isPropertyAccessExpression(target) ? declarationsOf(ctx, target.name).filter(isClassMember) : []
  for (const field of fields) addValues(state, field, values)
  if (fields.length) return
  for (const literal of literalsOf(ctx, valuesOf(ctx, state, target.expression))) {
    addValues(state, propertyKey(ctx, literal, name ?? ANY_PROPERTY), values)
  }
  state.written.set(target, union(state.written.get(target) ?? NONE, values))
}

/** `x = default` in an assignment pattern: the target and its default. */
const splitDefault = (node: ts.Expression): [ts.Expression, ts.Expression | undefined] =>
  ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ? [node.left, node.right]
    : [node, undefined]

const bindObjectBinding = (ctx: Context, state: HandlerState, pattern: ts.ObjectBindingPattern, values: Values) => {
  for (const element of pattern.elements) {
    const property = element.dotDotDotToken ? undefined : staticName(element.propertyName ?? element.name)
    const bound = property === undefined ? UNKNOWN : propertyOf(ctx, state, values, property)
    bindPattern(ctx, state, element.name, bound, element.initializer)
  }
}

const bindObjectAssignment = (
  ctx: Context,
  state: HandlerState,
  pattern: ts.ObjectLiteralExpression,
  values: Values
) => {
  for (const property of pattern.properties) {
    if (ts.isShorthandPropertyAssignment(property)) {
      const bound = propertyOf(ctx, state, values, property.name.text)
      bindPattern(ctx, state, property.name, bound, property.objectAssignmentInitializer)
    } else if (ts.isPropertyAssignment(property)) {
      const name = staticName(property.name)
      const [target, initializer] = splitDefault(property.initializer)
      bindPattern(ctx, state, target, name === undefined ? UNKNOWN : propertyOf(ctx, state, values, name), initializer)
    } else if (ts.isSpreadAssignment(property)) {
      bindPattern(ctx, state, property.expression, UNKNOWN)
    }
  }
}

/** The elements of an array pattern: positions are not followed, so each is unknown. */
const bindArray = (ctx: Context, state: HandlerState, pattern: ts.ArrayBindingPattern | ts.ArrayLiteralExpression) => {
  for (const element of pattern.elements) {
    if (ts.isOmittedExpression(element)) continue
    if (ts.isBindingElement(element)) bindPattern(ctx, state, element.name, UNKNOWN)
    else if (ts.isSpreadElement(element)) bindPattern(ctx, state, element.expression, UNKNOWN)
    else bindPattern(ctx, state, splitDefault(element)[0], UNKNOWN)
  }
}

/**
 * Gives a target the values: a parameter or variable name, a binding pattern of either, or the left
 * side of an assignment (a name, a property, a destructuring pattern). A default in a pattern stands in
 * for undefined only; it is no write of its own.
 */
const bindPattern = (
  ctx: Context,
  state: HandlerState,
  target: ts.BindingName | ts.Expression,
  values: Values,
  initializer?: ts.Expression
): void => {
  const bound = withDefault(ctx, state, values, initializer)
  if (ts.isParenthesizedExpression(target)) {
    bindPattern(ctx, state, target.expression, bound)
  } else if (ts.isIdentifier(target)) {
    for (const declaration of declarationsOf(ctx, target)) addValues(state, declaration, bound)
  } else if (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) {
    writeProperty(ctx, state, target, bound)
  } else if (ts.isObjectBindingPattern(target)) {
    bindObjectBinding(ctx, state, target, bound)
  } else if (ts.isObjectLiteralExpression(target)) {
    bindObjectAssignment(ctx, state, target, bound)
  } else if (ts.isArrayBindingPattern(target) || ts.isArrayLiteralExpression(target)) {
    bindArray(ctx, state, target)
  }
}

const reach = (state: HandlerState, unit: Unit, from: Unit) => {
  if (state.via.has(unit)) return
  state.via.set(unit, from)
  state.changed = true
}

/**
 * A function the code that runs at import calls, or an instance field it initializes by building an
 * object: its own body runs then, the functions inside it only when called.
 */
const runAtImport = (state: HandlerState, callee: ts.Node, from: Unit) => {
  if (state.importRun.has(callee)) return
  state.importRun.set(callee, from)
  state.changed = true
}

/** Binds each parameter of every possible callee to what this call passes it, and reaches the callee. */
const bindCall = (
  ctx: Context,
  state: HandlerState,
  call: ts.CallExpression | ts.NewExpression,
  from: Unit,
  atImport: boolean
) => {
  const args = call.arguments ?? []
  for (const field of instanceFieldsOf(ctx, call, state)) {
    if (atImport) runAtImport(state, field, from)
    else reach(state, field, from)
  }
  if (atImport) {
    // A function written out as an argument may run during the call (`forEach`, `then`, a Promise
    // executor); taking it to does no harm where it runs later, as a `setTimeout` callback does.
    for (const argument of args.map(unwrap).filter(isFunctionLike)) runAtImport(state, argument, from)
  }
  for (const callee of calleesOf(ctx, state, call)) {
    if (atImport) {
      runAtImport(state, callee, from)
    } else {
      const unit = unitOf(callee)
      if (unit) reach(state, unit, from)
    }
    callee.parameters.forEach((parameter, index) => {
      if (parameter.dotDotDotToken) return
      const argument = args[index]
      if (argument) {
        bindPattern(ctx, state, parameter.name, valuesOf(ctx, state, argument), parameter.initializer)
      } else if (parameter.questionToken || parameter.initializer) {
        bindPattern(ctx, state, parameter.name, UNDEFINED, parameter.initializer)
      }
    })
  }
}

/** The declarations the properties of an object literal are written against, from its contextual type. */
const literalProperties = (ctx: Context, literal: ts.ObjectLiteralExpression) => {
  const cached = ctx.literalProperties.get(literal)
  if (cached) return cached
  const properties = new Map<string, ts.Declaration>()
  const type = ctx.checker.getContextualType(literal)
  for (const property of literal.properties) {
    const name = keyOf(property.name)
    if (name === undefined) continue
    const declaration = type?.getProperty(name)?.declarations?.[0]
    if (declaration) properties.set(name, declaration)
  }
  ctx.literalProperties.set(literal, properties)
  return properties
}

const bindObjectLiteral = (ctx: Context, state: HandlerState, literal: ts.ObjectLiteralExpression) => {
  for (const [name, declaration] of literalProperties(ctx, literal)) {
    const property = propertyNamed(literal, name)
    if (property) addValues(state, declaration, valuesOfProperty(ctx, state, property))
  }
}

const LOGICAL_ASSIGNMENTS = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
])

const isAssignment = (node: ts.Node): node is ts.AssignmentExpression<ts.AssignmentOperatorToken> =>
  ts.isBinaryExpression(node) &&
  node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
  node.operatorToken.kind <= ts.SyntaxKind.LastAssignment

const isObjectAssign = (node: ts.Node): node is ts.CallExpression =>
  ts.isCallExpression(node) && node.expression.getText() === 'Object.assign'

/**
 * `Object.assign(target, ...)`: the properties it copies in are not followed, so any property of a
 * literal target, or any field of the class a `this` target is, may be anything now. A target that is
 * neither is checked once the fixed point is reached (`checkAssign`).
 */
const assignObject = (ctx: Context, state: HandlerState, call: ts.CallExpression, target: ts.Expression) => {
  const owner = target.kind === ts.SyntaxKind.ThisKeyword ? thisClass(target) : undefined
  if (owner) {
    for (const member of owner.members.filter(ts.isPropertyDeclaration)) addValues(state, member, UNKNOWN)
    return
  }
  for (const literal of literalsOf(ctx, valuesOf(ctx, state, target))) {
    addValues(state, propertyKey(ctx, literal, ANY_PROPERTY), UNKNOWN)
  }
  state.assigns.add(call)
}

/** Applies one write of the counted code to the environment. */
const applyWrite = (ctx: Context, state: HandlerState, node: ts.Node) => {
  if (isAssignment(node)) {
    // `x = y`, `x ??= y`, `x ||= y` and `x &&= y` leave x holding y or what it held; `+=` and the
    // other arithmetic ones compute something the walk does not follow.
    const values = LOGICAL_ASSIGNMENTS.has(node.operatorToken.kind) ? valuesOf(ctx, state, node.right) : UNKNOWN
    bindPattern(ctx, state, node.left, values)
  } else if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
    const values = ts.isForOfStatement(node) ? elementsOf(ctx, state, node.expression) : UNKNOWN
    const targets = ts.isVariableDeclarationList(node.initializer)
      ? node.initializer.declarations.map((declaration) => declaration.name)
      : [node.initializer]
    for (const target of targets) bindPattern(ctx, state, target, values)
  } else if (ts.isDeleteExpression(node)) {
    bindPattern(ctx, state, node.expression, UNDEFINED)
  } else if (isObjectAssign(node) && node.arguments[0]) {
    assignObject(ctx, state, node, node.arguments[0])
  }
}

/**
 * The client method a call invokes, when the callee is a CustomDynamoClient member. The client's own
 * `this.x()` calls are its internals; anywhere else (a class that extends it) `this` is a client.
 */
const clientMethod = (ctx: Context, call: ts.CallExpression): string | undefined => {
  const callee = call.expression
  if (!ts.isPropertyAccessExpression(callee)) return undefined
  if (callee.expression.kind === ts.SyntaxKind.ThisKeyword && CLIENT_FILE.test(call.getSourceFile().fileName)) {
    return undefined
  }
  // The name's symbol declares the class member also through a `Pick<CustomDynamoClient, ...>` parameter:
  // a mapped type's property keeps the declarations of the one it maps.
  const member = symbolOf(ctx, callee.name)?.declarations?.some((d) => d.parent === ctx.clientClass)
  return member ? callee.name.text : undefined
}

/** Whether a property's name is computed in a way `keyOf` cannot read. */
const hasComputedKey = (property: ts.ObjectLiteralElementLike) =>
  property.name !== undefined && ts.isComputedPropertyName(property.name) && keyOf(property.name) === undefined

/**
 * An object literal that names a table for a transaction: one with a `TableName` however it is
 * written, and a transaction item with a computed key, which may be one.
 */
const holdsTableName = (node: ts.ObjectLiteralExpression) =>
  !CLIENT_FILE.test(node.getSourceFile().fileName) &&
  (node.properties.some((property) => keyOf(property.name) === 'TableName') ||
    (actionOfItem(node) !== undefined && node.properties.some(hasComputedKey)))

/** The defaults in an assignment pattern (`{ table = CONFIG.xTable } = ...`), which are no writes of their own. */
const patternDefaults = (node: ts.Node, defaults: Set<ts.Node>) => {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    defaults.add(node)
    patternDefaults(node.left, defaults)
  } else if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node)) {
    ts.forEachChild(node, (child) => patternDefaults(child, defaults))
  } else if (ts.isPropertyAssignment(node) || ts.isSpreadAssignment(node) || ts.isSpreadElement(node)) {
    patternDefaults(ts.isPropertyAssignment(node) ? node.initializer : node.expression, defaults)
  }
}

/** The left side of a write that may be a destructuring pattern: an assignment's, or a `for` loop's over an existing variable. */
const patternOf = (node: ts.Node): ts.Node | undefined => {
  if (isAssignment(node)) return node.left
  if ((ts.isForOfStatement(node) || ts.isForInStatement(node)) && !ts.isVariableDeclarationList(node.initializer)) {
    return node.initializer
  }
  return undefined
}

const isWrite = (node: ts.Node) =>
  isAssignment(node) ||
  ts.isForOfStatement(node) ||
  ts.isForInStatement(node) ||
  ts.isDeleteExpression(node) ||
  isObjectAssign(node)

const isStatic = (node: ts.Node) =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.StaticKeyword)

/**
 * What does not run when its module-level statement does: a function body (one called there runs as
 * the callee of that call, `(() => { ... })()` too) and an instance member.
 */
const runsLater = (node: ts.Node) => {
  if (ts.isClassStaticBlockDeclaration(node)) return false
  if (ts.isPropertyDeclaration(node)) return !isStatic(node)
  return ts.isFunctionLike(node)
}

/** One pass over a unit's syntax, done once: what it names, calls, builds and writes. */
const unitInfo = (ctx: Context, unit: Unit): UnitInfo => {
  const cached = ctx.units.get(unit)
  if (cached) return cached
  const info = scan(ctx, unit)
  ctx.units.set(unit, info)
  return info
}

/** The part of a module-level statement that runs when its file is imported. */
const importView = (ctx: Context, statement: ts.Statement): UnitInfo => {
  const cached = ctx.importViews.get(statement)
  if (cached) return cached
  const info = scan(ctx, statement, runsLater)
  ctx.importViews.set(statement, info)
  return info
}

/** The body of a function called at import: what runs in it then. */
const functionView = (ctx: Context, callee: ts.Node): UnitInfo => {
  const cached = ctx.functionViews.get(callee)
  if (cached) return cached
  const info = scan(ctx, callee, (node) => node !== callee && runsLater(node))
  ctx.functionViews.set(callee, info)
  return info
}

const scan = (ctx: Context, unit: Unit, skip?: (node: ts.Node) => boolean): UnitInfo => {
  const info: UnitInfo = {
    calls: [],
    clientCalls: [],
    elementCalls: [],
    literals: [],
    tableNameLiterals: [],
    targets: new Set(),
    writes: [],
  }
  const defaults = new Set<ts.Node>()
  const visit = (node: ts.Node) => {
    if (ts.isTypeNode(node) || ts.isImportDeclaration(node) || skip?.(node)) return
    if (ts.isIdentifier(node)) {
      for (const declaration of declarationsOf(ctx, node)) {
        const target = unitOf(declaration)
        if (target && target !== unit) info.targets.add(target)
      }
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) info.calls.push(node)
    if (ts.isCallExpression(node)) {
      const method = clientMethod(ctx, node)
      if (method !== undefined) info.clientCalls.push({ call: node, method })
      if (ts.isElementAccessExpression(node.expression)) info.elementCalls.push(node)
    }
    if (ts.isObjectLiteralExpression(node)) {
      info.literals.push(node)
      if (holdsTableName(node)) info.tableNameLiterals.push(node)
    }
    if (isWrite(node) && !defaults.has(node)) {
      info.writes.push(node)
      const pattern = patternOf(node)
      if (pattern) patternDefaults(pattern, defaults)
    }
    ts.forEachChild(node, visit)
  }
  visit(unit)
  return info
}

const cannotTell = (node: ts.Node, what: string): never => {
  throw new Error(`${location(node)}: cannot tell which table ${what} (${node.getText()}) names`)
}

const defaultTables = (ctx: Context, state: HandlerState, receiver: ts.Expression): string[] => {
  const values = valuesOf(ctx, state, receiver)
  const keys = withPrefix(values, 'C')
  return keys.length && !hasUnknown(values) ? keys : cannotTell(receiver, 'the client')
}

/** Whether every value is of the given kinds: a table position holds tables or undefined, an index position names or undefined. */
const onlyKinds = (values: Values, kinds: string[]) => [...values].every((value) => kinds.includes(value.slice(0, 2)))

/** The tables an expression names, plus the receiver's default where it may be undefined. */
const tablesOrDefault = (ctx: Context, state: HandlerState, values: Values, call: ts.CallExpression) => {
  // A string, a client or a function in a table position is no CONFIG table: refused like an unknown.
  if (!onlyKinds(values, ['T:', 'U:'])) return []
  const defaults = hasUndefined(values) ? defaultTables(ctx, state, receiverOf(call)) : []
  return [...tableKeys(values), ...defaults]
}

const explicitTables = (ctx: Context, state: HandlerState, call: ts.CallExpression, argument: ts.Expression) => {
  const keys = tablesOrDefault(ctx, state, valuesOf(ctx, state, argument), call)
  return keys.length ? keys : cannotTell(argument, 'the table argument')
}

const receiverOf = (call: ts.CallExpression): ts.Expression => {
  const callee = call.expression
  if (!ts.isPropertyAccessExpression(callee) && !ts.isElementAccessExpression(callee)) {
    throw new Error(`${location(call)}: not a method call`)
  }
  return callee.expression
}

/** The tables one options literal names: its `table`, or the client's default; with `index`, the index of each. */
const literalTables = (
  ctx: Context,
  state: HandlerState,
  call: ts.CallExpression,
  literal: ts.ObjectLiteralExpression
) => {
  const keys = tablesOrDefault(ctx, state, literalProperty(ctx, state, literal, 'table'), call)
  if (!keys.length) cannotTell(propertyNamed(literal, 'table') ?? literal, 'the table option')
  const values = literalProperty(ctx, state, literal, 'index')
  const names = withPrefix(values, 'S')
  const maybeUndefined = hasUndefined(values)
  if (names.includes('') || !onlyKinds(values, ['S:', 'U:']) || (!names.length && !maybeUndefined)) {
    cannotTell(propertyNamed(literal, 'index') ?? literal, 'the index option')
  }
  // An index that may be undefined leaves the query on the table itself for those calls.
  const tables = maybeUndefined ? keys : []
  return [...tables, ...keys.flatMap((key) => names.map((name) => indexKey(key, name)))]
}

/** The tables of a call that takes its table in an options object: the literal's `table`, or the client's default. */
const optionTables = (
  ctx: Context,
  state: HandlerState,
  call: ts.CallExpression,
  argument: ts.Expression | undefined
): string[] => {
  if (!argument) return defaultTables(ctx, state, receiverOf(call))
  const values = valuesOf(ctx, state, argument)
  const literals = literalsOf(ctx, values)
  if (!literals.length || hasUnknown(values)) return cannotTell(argument, 'the options')
  return literals.flatMap((literal) => literalTables(ctx, state, call, literal))
}

const callTables = (ctx: Context, state: HandlerState, call: ts.CallExpression, spec: MethodSpec): string[] => {
  if (spec.table === 'items') return []
  if ('option' in spec.table) return optionTables(ctx, state, call, call.arguments[spec.table.option])
  const argument = call.arguments[spec.table.arg]
  return argument ? explicitTables(ctx, state, call, argument) : defaultTables(ctx, state, receiverOf(call))
}

/** How the handler got to a unit: the names of the units on the way, innermost last. */
const chain = (state: HandlerState, unit: Unit): string => {
  const names: string[] = []
  if (!state.via.has(unit)) {
    // Code that runs at import: the module-level statement, then each function called from there.
    for (let current: Unit | undefined = unit; current; current = importCaller(state, current)) {
      names.unshift(unitName(unitOf(current) ?? current))
    }
    return `import ${names.join(' > ')}`
  }
  for (let current: Unit | undefined = unit; current && state.via.get(current); current = state.via.get(current)) {
    names.unshift(unitName(current))
  }
  return names.join(' > ')
}

const importCaller = (state: HandlerState, node: Unit): Unit | undefined => state.importRun.get(node)

const record = (state: HandlerState, uses: TableUse, key: string, action: Action, node: ts.Node, unit: Unit) => {
  const byAction = uses.get(key) ?? new Map<Action, string[]>()
  const where = location(node)
  const known = byAction.get(action) ?? []
  // A function that runs at import and is also reached is one use, under the chain found first.
  if (!known.some((entry) => entry.startsWith(`${where} (`)))
    byAction.set(action, [...known, `${where} (${chain(state, unit)})`])
  uses.set(key, byAction)
}

/** The action of the transaction item an object literal is, if it is one: `{ Put: { TableName } }` is a PutItem. */
const actionOfItem = (item: ts.ObjectLiteralExpression): Action | undefined => {
  const key = ts.isPropertyAssignment(item.parent) ? keyOf(item.parent.name) : undefined
  return key === undefined ? undefined : TRANSACTION_ACTIONS[key]
}

const itemAction = (item: ts.ObjectLiteralExpression, at: ts.Node): Action => {
  const action = actionOfItem(item)
  if (!action) throw new Error(`${location(at)}: TableName outside a transaction item`)
  return action
}

/** The final pass: every client call and every transaction item's `TableName` in a unit that runs. */
const collect = (ctx: Context, state: HandlerState, unit: Unit, info: UnitInfo, uses: TableUse) => {
  const clientCalls = [
    ...info.clientCalls,
    ...info.elementCalls.flatMap((call) => elementClientCalls(ctx, state, call)),
  ]
  for (const { call, method } of clientCalls) {
    const spec = CLIENT_METHODS.get(method)
    if (!spec) throw new Error(`${location(call)}: ${CLIENT_CLASS}.${method} is not classified in lambdaTableUse.ts`)
    for (const key of callTables(ctx, state, call, spec)) {
      for (const action of spec.actions) record(state, uses, key, action, call, unit)
    }
  }
  for (const literal of info.tableNameLiterals) collectItem(ctx, state, unit, literal, uses)
}

/** The table a transaction item names; one that only a computed key may give it can also be absent. */
const collectItem = (
  ctx: Context,
  state: HandlerState,
  unit: Unit,
  literal: ts.ObjectLiteralExpression,
  uses: TableUse
) => {
  const property = propertyNamed(literal, 'TableName')
  const at = property ?? literal
  const action = itemAction(literal, at)
  const named = literalProperty(ctx, state, literal, 'TableName')
  // Beside a written-out table, a computed key holding something else cannot be the table: it would
  // fail the transaction, not reach another table. Only an unknown value may be one.
  const own = property ? valuesOfProperty(ctx, state, property) : withoutUndefined(named)
  if ((property && !tableKeys(own).length) || !onlyKinds(own, ['T:']) || hasUnknown(named)) cannotTell(at, 'the item')
  for (const key of tableKeys(named)) record(state, uses, key, action, at, unit)
}

/** Whether a receiver can be a client: typed as one, or holding one the walk can name. */
const mayBeClient = (ctx: Context, state: HandlerState, receiver: ts.Expression) =>
  withPrefix(valuesOf(ctx, state, receiver), 'C').length > 0 ||
  (ctx.checker.getTypeAtLocation(receiver).getSymbol()?.declarations ?? []).includes(ctx.clientClass)

/** `client['readAll'](...)`, `client[method](...)`: a client call under each name the key can be, refused where it may be any. */
const elementClientCalls = (ctx: Context, state: HandlerState, call: ts.CallExpression) => {
  const callee = call.expression
  if (!ts.isElementAccessExpression(callee) || !mayBeClient(ctx, state, callee.expression)) return []
  const key = callee.argumentExpression
  const names = ts.isStringLiteralLike(key) ? [key.text] : keyNames(ctx, state, key)
  if (!names) return cannotTell(callee, 'the client method')
  const methods = new Set(ctx.clientClass.members.filter(ts.isMethodDeclaration).map((m) => keyOf(m.name)))
  return names.filter((name) => methods.has(name)).map((method) => ({ call, method }))
}

/** Whether every value a receiver can be is an object literal (or undefined, which would throw before writing). */
const onlyLiterals = (ctx: Context, values: Values) => {
  const literals = literalsOf(ctx, values).length
  return literals > 0 && literals + (hasUndefined(values) ? 1 : 0) === values.size
}

/** Whether a value can be a table or a client: what a computed key or `Object.assign` must not put where the walk cannot see. */
const namesTableOrClient = (values: Values) => withPrefix(values, 'T').length + withPrefix(values, 'C').length > 0

/** Records the tables written onto transaction items, refusing a value that is not one. */
const recordItemWrites = (
  state: HandlerState,
  uses: TableUse,
  target: PropertyTarget,
  items: ts.ObjectLiteralExpression[],
  written: Values
) => {
  const values = withoutUndefined(written)
  if (!onlyKinds(values, ['T:'])) cannotTell(target, 'the item')
  for (const item of items) {
    const action = itemAction(item, target)
    for (const key of tableKeys(values)) record(state, uses, key, action, target, unitOf(target) ?? target)
  }
}

/**
 * One property write, once the fixed point is reached. A write to a property the walk reads a table,
 * an index or a client from must land on object literals it can name, and so must a table or a client
 * written through a computed key, which may be any of them. A `TableName` written onto a transaction
 * item is a use of that table, like one written out in it; a computed key on an item may be that.
 */
const checkWrite = (ctx: Context, state: HandlerState, uses: TableUse, target: PropertyTarget, written: Values) => {
  const name = writtenName(ctx, state, target)
  if (name !== undefined && !READ_PROPERTIES.has(name)) return
  const receiver = valuesOf(ctx, state, target.expression)
  if (!onlyLiterals(ctx, receiver) && (name !== undefined || namesTableOrClient(written)))
    cannotTell(target, 'the write')
  const literals = literalsOf(ctx, receiver)
  if (name === 'TableName') recordItemWrites(state, uses, target, literals, written)
  const items = name === undefined ? literals.filter((literal) => actionOfItem(literal) !== undefined) : []
  if (items.length) recordItemWrites(state, uses, target, items, written)
}

/** An `Object.assign` onto something that is no literal (nor a class's `this`) must not copy in a table or a client. */
const checkAssign = (ctx: Context, state: HandlerState, call: ts.CallExpression) => {
  const [target, ...sources] = call.arguments
  if (!target || onlyLiterals(ctx, valuesOf(ctx, state, target))) return
  for (const source of sources) {
    const values = valuesOf(ctx, state, source)
    if ([...READ_PROPERTIES].some((name) => namesTableOrClient(propertyOf(ctx, state, values, name)))) {
      cannotTell(call, 'the write')
    }
  }
}

const checkWrites = (ctx: Context, state: HandlerState, uses: TableUse) => {
  for (const [target, written] of state.written) {
    if (!CLIENT_FILE.test(target.getSourceFile().fileName)) checkWrite(ctx, state, uses, target, written)
  }
  for (const call of state.assigns) checkAssign(ctx, state, call)
}

const isDefaultExport = (statement: ts.Statement) =>
  ts.isExportAssignment(statement) ||
  (ts.isFunctionDeclaration(statement) &&
    Boolean(ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.ExportDefault))

/** The source files a file imports or re-exports from, type-only imports left out. */
const importsOf = (ctx: Context, file: ts.SourceFile): ts.SourceFile[] => {
  const cached = ctx.imports.get(file)
  if (cached) return cached
  const imported: ts.SourceFile[] = []
  for (const statement of file.statements) {
    const typeOnly = ts.isImportDeclaration(statement) ? statement.importClause?.isTypeOnly : undefined
    const specifier =
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) && !typeOnly
        ? statement.moduleSpecifier
        : undefined
    if (!specifier || (ts.isExportDeclaration(statement) && statement.isTypeOnly)) continue
    const declarations = ctx.checker.getSymbolAtLocation(specifier)?.declarations ?? []
    imported.push(...declarations.filter(ts.isSourceFile).filter(isSourceNode))
  }
  ctx.imports.set(file, imported)
  return imported
}

/** The module-level statements of the handler's file and of every file it imports, which all run when it loads. */
const importStatements = (ctx: Context, start: ts.SourceFile): ts.Statement[] => {
  const seen = new Set<ts.SourceFile>()
  const pending = [start]
  for (let file = pending.pop(); file; file = pending.pop()) {
    if (seen.has(file)) continue
    seen.add(file)
    pending.push(...importsOf(ctx, file))
  }
  return [...seen].flatMap((file) => [...file.statements])
}

/**
 * The import-time code whose unit is not also reached: a reached unit is walked whole, which takes in
 * everything the same code does at import, so walking it again in part adds nothing.
 */
const runsOnlyAtImport = <T extends ts.Node>(state: HandlerState, nodes: T[]): T[] =>
  nodes.filter((node) => {
    const unit = unitOf(node)
    return unit === undefined || !state.via.has(unit)
  })

/** What one unit, reached or run at import, does to the environment in one round. */
const apply = (ctx: Context, state: HandlerState, info: UnitInfo, unit: Unit, atImport: boolean) => {
  for (const call of info.calls) bindCall(ctx, state, call, unit, atImport)
  for (const literal of info.literals) bindObjectLiteral(ctx, state, literal)
  for (const write of info.writes) applyWrite(ctx, state, write)
}

/**
 * One round over what runs so far: the reached units reach further, and they and the code that runs
 * at import bind their calls and literals and apply their writes. A function the import-time code
 * calls runs its own body then, not the functions inside it, and what that code only names is not
 * reached: a factory called at load (`createDynamoLease(...)`) runs, the closures it returns do not.
 */
const step = (ctx: Context, state: HandlerState, imported: ts.Statement[]) => {
  for (const unit of [...state.via.keys()]) {
    const info = unitInfo(ctx, unit)
    for (const target of info.targets) reach(state, target, unit)
    apply(ctx, state, info, unit, false)
  }
  for (const statement of runsOnlyAtImport(state, imported)) {
    apply(ctx, state, importView(ctx, statement), statement, true)
  }
  for (const callee of runsOnlyAtImport(state, [...state.importRun.keys()])) {
    apply(ctx, state, functionView(ctx, callee), callee, true)
  }
}

const analyzeHandler = (ctx: Context, file: ts.SourceFile): TableUse => {
  const start = file.statements.find(isDefaultExport)
  if (!start) throw new Error(`${file.fileName}: no default export`)
  const state: HandlerState = {
    assigns: new Set(),
    changed: true,
    env: new Map(),
    importRun: new Map(),
    memo: new Map(),
    via: new Map([[start, undefined]]),
    written: new Map(),
  }
  const imported = importStatements(ctx, file)
  while (state.changed) {
    state.changed = false
    state.memo.clear()
    step(ctx, state, imported)
  }
  const uses: TableUse = new Map()
  for (const unit of state.via.keys()) collect(ctx, state, unit, unitInfo(ctx, unit), uses)
  for (const statement of runsOnlyAtImport(state, imported)) {
    collect(ctx, state, statement, importView(ctx, statement), uses)
  }
  for (const callee of runsOnlyAtImport(state, [...state.importRun.keys()])) {
    collect(ctx, state, callee, functionView(ctx, callee), uses)
  }
  checkWrites(ctx, state, uses)
  return uses
}

const compilerOptions = (): ts.CompilerOptions => {
  const file = 'src/lambda/tsconfig.json'
  const { config, error } = ts.readConfigFile(file, ts.sys.readFile)
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'))
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(file))
  // Only the lambda sources are walked; the test globals would be parsed for nothing.
  return { ...options, types: ['node'] }
}

const findDeclaration = <T extends ts.ClassDeclaration | ts.VariableDeclaration>(
  file: ts.SourceFile,
  test: (node: ts.Node) => node is T,
  name: string
): T => {
  let found: T | undefined
  const visit = (node: ts.Node) => {
    if (found) return
    if (test(node) && node.name && ts.isIdentifier(node.name) && node.name.text === name) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  if (!found) throw new Error(`${file.fileName}: no ${name}`)
  return found
}

const createContext = (program: ts.Program): Context => {
  const files = program.getSourceFiles()
  const configFile = files.find((f) => CONFIG_FILE.test(f.fileName))
  const clientFile = files.find((f) => CLIENT_FILE.test(f.fileName))
  if (!configFile || !clientFile) throw new Error('config.ts or CustomDynamoClient.ts is not in the program')
  return {
    checker: program.getTypeChecker(),
    clientClass: findDeclaration(clientFile, ts.isClassDeclaration, CLIENT_CLASS),
    config: findDeclaration(configFile, ts.isVariableDeclaration, 'CONFIG'),
    files: files.filter(isSourceNode),
    functionViews: new Map(),
    imports: new Map(),
    importViews: new Map(),
    literalProperties: new Map(),
    nodes: new Map(),
    symbols: new Map(),
    units: new Map(),
  }
}

/** `CONFIG.xTable` to the `process.env.X` each reads, from the object literal in config.ts. */
const configEnvironmentVariables = (config: ts.VariableDeclaration): Map<string, string> => {
  const variables = new Map<string, string>()
  if (!config.initializer || !ts.isObjectLiteralExpression(config.initializer)) {
    throw new Error('CONFIG is not an object literal')
  }
  for (const property of config.initializer.properties) {
    const key = ts.isPropertyAssignment(property) ? keyOf(property.name) : undefined
    if (key === undefined || !ts.isPropertyAssignment(property) || !key.endsWith('Table')) continue
    const visit = (node: ts.Node) => {
      if (ts.isPropertyAccessExpression(node) && node.expression.getText() === 'process.env') {
        variables.set(key, node.name.text)
      }
      ts.forEachChild(node, visit)
    }
    visit(property.initializer)
    if (!variables.has(key)) throw new Error(`CONFIG.${key} does not read process.env`)
  }
  return variables
}

interface TableAnalysis {
  /** Handler file to the CONFIG keys its code reaches. */
  uses: Map<string, TableUse>
  /** CONFIG key (`eventTable`) to the environment variable config.ts reads it from (`EVENT_TABLE_NAME`). */
  environmentVariables: Map<string, string>
}

interface TableUseAnalyzer {
  environmentVariables: Map<string, string>
  /** The tables one of the handlers reaches; throws on the first use it cannot name. */
  usesOf: (handlerFile: string) => TableUse
}

/** One program over the handlers, each walked on request, so a test can hold the failing ones apart. */
export const createTableUseAnalyzer = (handlerFiles: string[]): TableUseAnalyzer => {
  const program = ts.createProgram(
    handlerFiles.map((file) => path.resolve(file)),
    compilerOptions()
  )
  const ctx = createContext(program)
  return {
    environmentVariables: configEnvironmentVariables(ctx.config),
    usesOf: (file) => {
      const source = program.getSourceFile(path.resolve(file))
      if (!source) throw new Error(`${file} is not in the program`)
      return analyzeHandler(ctx, source)
    },
  }
}

/** The tables each handler can reach, by following calls from its default export. */
export const analyzeTableUse = (handlerFiles: string[]): TableAnalysis => {
  const analyzer = createTableUseAnalyzer(handlerFiles)
  const uses = new Map<string, TableUse>()
  for (const file of handlerFiles) uses.set(file, analyzer.usesOf(file))
  return { environmentVariables: analyzer.environmentVariables, uses }
}
