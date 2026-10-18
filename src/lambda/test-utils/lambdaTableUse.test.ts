import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createTableUseAnalyzer } from './lambdaTableUse'

/**
 * A small lambda tree of its own, so each case says what the walk must find or refuse without
 * depending on what the real handlers happen to do. The paths mirror the repository's, since the
 * walk finds CONFIG and the client by them. One program holds every handler; a walk that must
 * throw does so for its own handler only, and each rule has a handler of its own, so that a rule
 * dropped from the walk fails the case that pins it.
 */
const root = mkdtempSync(path.join(tmpdir(), 'lambda-table-use-'))

const write = (file: string, content: string) => {
  const target = path.join(root, 'src/lambda', file)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, content)
  return target
}

const COMMON = `
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
const dynamoDB = new CustomDynamoClient(CONFIG.userTable)
`

const HANDLERS: Record<string, string> = {
  ArithmeticAssign: `${COMMON}
export default async () => {
  let table = CONFIG.judgeTable
  table += '-copy'
  await dynamoDB.readAll({ table })
}
`,
  AssignAnd: `${COMMON}
export default async () => {
  let table = CONFIG.judgeTable
  table &&= CONFIG.locationTable
  await dynamoDB.readAll({ table })
}
`,
  AssignArrayPattern: `${COMMON}
export default async () => {
  let table = CONFIG.judgeTable
  ;[table] = [CONFIG.locationTable]
  await dynamoDB.readAll({ table })
}
`,
  AssignComputedPattern: `${COMMON}
export default async () => {
  let table = CONFIG.judgeTable
  ;({ [String(Date.now())]: table } = { x: CONFIG.locationTable })
  await dynamoDB.readAll({ table })
}
`,
  AssignConfigBinding: `${COMMON}
export default async () => {
  let { judgeTable: table } = CONFIG
  if (Date.now() > 0) table = CONFIG.locationTable
  await dynamoDB.readAll({ table })
}
`,
  AssignCycle: `${COMMON}
let a = CONFIG.judgeTable
let b = CONFIG.locationTable
let c = CONFIG.userTable

export default async () => {
  a = b
  b = c
  c = a
  await dynamoDB.read({ id: 1 }, b)
  await dynamoDB.query({ key: 'id = :id', table: a })
}
`,
  AssignDestructuring: `${COMMON}
export default async () => {
  let table = CONFIG.judgeTable
  if (Date.now() > 0) ({ table } = { table: CONFIG.locationTable })
  await dynamoDB.readAll({ table })
}
`,
  AssignDestructuringDefault: `${COMMON}
export default async () => {
  let table = CONFIG.judgeTable
  if (Date.now() > 0) ({ table: table = CONFIG.userTable } = { table: CONFIG.locationTable })
  await dynamoDB.readAll({ table })
}
`,
  AssignForIn: `${COMMON}
export default async () => {
  let table = CONFIG.judgeTable
  for (table in { a: 1 }) await dynamoDB.readAll({ table })
}
`,
  AssignForOf: `${COMMON}
export default async () => {
  let table = CONFIG.judgeTable
  for (table of [CONFIG.locationTable]) await dynamoDB.readAll({ table })
}
`,
  AssignImported: `${COMMON}
import { stageTable } from '../lib/stage'

export default async () => {
  await dynamoDB.readAll({ table: stageTable })
}
`,
  AssignModuleLevel: `${COMMON}
let table = CONFIG.judgeTable
if (process.env.STAGE === 'x') table = CONFIG.locationTable

export default async () => {
  await dynamoDB.readAll({ table })
}
`,
  AssignNullish: `${COMMON}
export default async () => {
  let table = Date.now() > 0 ? CONFIG.judgeTable : undefined
  table ??= CONFIG.locationTable
  await dynamoDB.readAll({ table })
}
`,
  AssignObjectAssign: `${COMMON}
export default async () => {
  const options = { table: CONFIG.judgeTable }
  Object.assign(options, { table: CONFIG.locationTable })
  await dynamoDB.readAll(options)
}
`,
  AssignObjectAssignClient: `${COMMON}
const make = () => ({ x: 1 })

export default async () => {
  const o = make()
  Object.assign(o, { client: dynamoDB })
  return o
}
`,
  AssignObjectAssignSecondSource: `${COMMON}
const make = () => ({ x: 1 })

export default async () => {
  const o = make()
  Object.assign(o, { a: 1 }, { table: CONFIG.locationTable })
  return o
}
`,
  AssignObjectAssignThis: `${COMMON}
const judges = new CustomDynamoClient(CONFIG.judgeTable)

class Repo {
  client = dynamoDB
  constructor(options: { client: CustomDynamoClient }) {
    Object.assign(this, options)
  }
  list() {
    return this.client.read({ id: 1 })
  }
}

export default async () => new Repo({ client: judges }).list()
`,
  AssignObjectAssignThisTwoFields: `${COMMON}
class Repo {
  label = 'x'
  client = dynamoDB
  constructor(options: object) {
    Object.assign(this, options)
  }
  list() {
    return this.client.read({ id: 1 })
  }
}

export default async () => new Repo({}).list()
`,
  AssignObjectAssignUnknown: `${COMMON}
export default async () => {
  const options = { table: CONFIG.judgeTable }
  for (const o of [options].slice()) Object.assign(o, { table: CONFIG.locationTable })
  await dynamoDB.readAll(options)
}
`,
  AssignOr: `${COMMON}
export default async () => {
  let table = Date.now() > 0 ? CONFIG.judgeTable : undefined
  table ||= CONFIG.locationTable
  await dynamoDB.readAll({ table })
}
`,
  AssignParameter: `${COMMON}
const list = (table: string) => {
  if (Date.now() > 0) table = CONFIG.locationTable
  return dynamoDB.readAll({ table })
}

export default async () => list(CONFIG.judgeTable)
`,
  AssignProperty: `${COMMON}
export default async () => {
  const options: { table?: string } = { table: CONFIG.judgeTable }
  if (Date.now() > 0) options.table = CONFIG.locationTable
  await dynamoDB.readAll(options)
}
`,
  AssignPropertyDelete: `${COMMON}
export default async () => {
  const options: { table?: string } = { table: CONFIG.judgeTable }
  if (Date.now() > 0) delete options.table
  await dynamoDB.readAll(options)
}
`,
  AssignPropertyIndex: `${COMMON}
export default async () => {
  const options: { index?: string; key: string } = { key: 'email = :email' }
  if (Date.now() > 0) options.index = 'gsiName'
  await dynamoDB.query(options)
}
`,
  AssignPropertyKey: `${COMMON}
export default async () => {
  const options: Record<string, string> = { table: CONFIG.judgeTable }
  options[String(Date.now())] = CONFIG.locationTable
  await dynamoDB.readAll(options)
}
`,
  AssignPropertyThroughParameter: `${COMMON}
const useLocations = (options: { table?: string }) => {
  options.table = CONFIG.locationTable
}

export default async () => {
  const options = { table: CONFIG.judgeTable }
  useLocations(options)
  await dynamoDB.readAll(options)
}
`,
  AssignPropertyUnknown: `${COMMON}
export default async () => {
  const options = { table: CONFIG.judgeTable }
  for (const o of [options].slice()) o.table = CONFIG.locationTable
  await dynamoDB.readAll(options)
}
`,
  AssignRestPattern: `${COMMON}
export default async () => {
  let rest = { table: CONFIG.judgeTable }
  ;({ ...rest } = { table: CONFIG.locationTable })
  await dynamoDB.readAll(rest)
}
`,
  AssignWriteClientUnknown: `${COMMON}
export default async () => {
  const repo: { client: CustomDynamoClient } = { client: dynamoDB }
  for (const r of [repo].slice()) r.client = new CustomDynamoClient(CONFIG.judgeTable)
  await repo.client.read({ id: 1 })
}
`,
  AssignWriteComputedUnknown: `${COMMON}
export default async () => {
  const options = { table: CONFIG.judgeTable }
  for (const o of [options].slice()) o[String(Date.now())] = CONFIG.locationTable
  await dynamoDB.readAll(options)
}
`,
  AssignWriteIndexUnknown: `${COMMON}
export default async () => {
  const options: { index?: string; key: string } = { key: 'email = :email' }
  for (const o of [options].slice()) o.index = 'gsiName'
  await dynamoDB.query(options)
}
`,
  ClientElementAnyName: `${COMMON}
const pick = (): 'read' | 'readAll' => 'read'

export default async () => dynamoDB[pick()]({ id: 1 })
`,
  ClientElementCall: `${COMMON}
export default async () => dynamoDB['readAll']({ table: CONFIG.locationTable })
`,
  ClientElementConstName: `${COMMON}
const method = 'readAll'

export default async () => dynamoDB[method]({ table: CONFIG.locationTable })
`,
  ClientElementUnknown: `${COMMON}
export default async () => dynamoDB[String(Date.now()) === 'x' ? 'read' : 'readAll']({ id: 1 })
`,
  ClientOnThis: `${COMMON}
class Repo {
  client = dynamoDB
  list() {
    return this.client.read({ id: 1 })
  }
}

export default async () => new Repo().list()
`,
  ClientOnThisConstructor: `${COMMON}
const judges = new CustomDynamoClient(CONFIG.judgeTable)

class Repo {
  client: CustomDynamoClient
  constructor(client: CustomDynamoClient) {
    this.client = client
  }
  list() {
    return this.client.read({ id: 1 })
  }
}

export default async () => new Repo(judges).list()
`,
  ClientOnThisGrandchild: `${COMMON}
const judges = new CustomDynamoClient(CONFIG.judgeTable)
const locations = new CustomDynamoClient(CONFIG.locationTable)

class Repo {
  client = dynamoDB
  list() {
    return this.client.read({ id: 1 })
  }
}

class JudgeRepo extends Repo {
  override client = judges
}

class LocationRepo extends JudgeRepo {
  override client = locations
}

export default async () => new LocationRepo().list()
`,
  ClientOnThisLiteral: `${COMMON}
const repo = {
  client: dynamoDB,
  list() {
    return this.client.read({ id: 1 })
  },
}

export default async () => repo.list()
`,
  ClientOnThisSubclass: `${COMMON}
const judges = new CustomDynamoClient(CONFIG.judgeTable)

class Repo {
  client = dynamoDB
  list() {
    return this.client.read({ id: 1 })
  }
}

class JudgeRepo extends Repo {
  override client = judges
}

export default async () => new JudgeRepo().list()
`,
  ClientOnThisTwoSubclasses: `${COMMON}
const judges = new CustomDynamoClient(CONFIG.judgeTable)
const locations = new CustomDynamoClient(CONFIG.locationTable)

class Repo {
  client = dynamoDB
  list() {
    return this.client.read({ id: 1 })
  }
}

class JudgeRepo extends Repo {
  override client = judges
}

class LocationRepo extends Repo {
  override client = locations
}

export default async () => [new JudgeRepo().list(), new LocationRepo().list()]
`,
  ClientSubclass: `${COMMON}
class Judges extends CustomDynamoClient {
  constructor() {
    super(CONFIG.judgeTable)
  }
  list() {
    return this.readAll()
  }
}

export default async () => new Judges().list()
`,
  ConditionalIndex: `${COMMON}
export default async () => {
  await dynamoDB.query({ index: Date.now() > 0 ? 'gsiEmail' : undefined, key: 'email = :email' })
}
`,
  ConditionalTable: `${COMMON}
export default async () => {
  await dynamoDB.readAll({ table: Date.now() > 0 ? CONFIG.judgeTable : undefined })
}
`,
  DefaultArgument: `${COMMON}
const byIndex = (index = 'gsiEmail') => dynamoDB.query({ index, key: 'email = :email' })

export default async () => {
  await byIndex()
}
`,
  DefaultOptions: `${COMMON}
type Options = { index?: string }
const inner = (options: Options) => dynamoDB.query({ index: options.index, key: 'email = :email' })
const outer = (options: Options = {}) => inner(options)

export default async () => {
  await outer({ index: 'gsiEmail' })
  await outer()
}
`,
  DefaultProperty: `${COMMON}
const byOptions = ({ index = 'gsiEmail' }: { index?: string }) => dynamoDB.query({ index, key: 'email = :email' })

export default async () => {
  await byOptions({})
}
`,
  Directory: `${COMMON}
type Store = Pick<CustomDynamoClient, 'read'>
const locations = new CustomDynamoClient(CONFIG.locationTable)
const snapshot = (store: Store) => store.read({ id: 'fi' })
const list = (client: CustomDynamoClient, options: { table: string }) => client.readAll({ table: options.table })

export default async () => {
  await snapshot(locations)
  await list(dynamoDB, { table: CONFIG.judgeTable })
}
`,
  EmptyIndex: `${COMMON}
export default async () => {
  await dynamoDB.query({ index: process.env.INDEX ?? '', key: 'email = :email' })
}
`,
  ForOfDeclaration: `${COMMON}
export default async () => {
  for (const table of [CONFIG.judgeTable, CONFIG.locationTable]) await dynamoDB.readAll({ table })
}
`,
  ForOfSpread: `${COMMON}
const tables = [CONFIG.locationTable]

export default async () => {
  for (const table of [CONFIG.judgeTable, ...tables]) await dynamoDB.readAll({ table })
}
`,
  ForOfVariable: `${COMMON}
const tables = [CONFIG.locationTable]

export default async () => {
  let table = CONFIG.judgeTable
  for (table of tables) await dynamoDB.readAll({ table })
}
`,
  ImportBarrel: `${COMMON}
import { stageTable } from '../lib/barrel'

export default async () => {
  await dynamoDB.readAll({ table: stageTable })
}
`,
  ImportBaseField: `${COMMON}
let table = CONFIG.judgeTable
const init = () => {
  table = CONFIG.locationTable
  return 1
}

class Base {
  ready = init()
}

class Stage extends Base {}
new Stage()

export default async () => dynamoDB.readAll({ table })
`,
  ImportCallback: `${COMMON}
void Promise.resolve().then(() => dynamoDB.readAll({ table: CONFIG.locationTable }))

export default async () => dynamoDB.read({ id: 1 })
`,
  ImportCallbackParameter: `${COMMON}
;[CONFIG.judgeTable].forEach((table) => {
  void dynamoDB.readAll({ table })
})

export default async () => dynamoDB.read({ id: 1 })
`,
  ImportCallsSetter: `import { list } from '../lib/callAtImport'

export default async () => list()
`,
  ImportClientCall: `${COMMON}
const warm = () => dynamoDB.readAll({ table: CONFIG.locationTable })
void warm()

export default async () => dynamoDB.read({ id: 1 })
`,
  ImportDeep: `import { list } from '../lib/deep'

export default async () => list()
`,
  ImportDirectClientCall: `import { x } from '../lib/topcall'

export default async () => x
`,
  ImportFactory: `${COMMON}
import '../lib/factory'

export default async () => dynamoDB.read({ id: 1 })
`,
  ImportIife: `import { list } from '../lib/iife'

export default async () => list()
`,
  ImportImplicitConstructor: `${COMMON}
let table = CONFIG.judgeTable

class Base {
  constructor() {
    table = CONFIG.locationTable
  }
}

class Stage extends Base {}
new Stage()

export default async () => dynamoDB.readAll({ table })
`,
  ImportInit: `import { list } from '../lib/init'

export default async () => list()
`,
  ImportInstanceField: `${COMMON}
let table = CONFIG.judgeTable
const init = () => {
  table = CONFIG.locationTable
  return 1
}

class Stage {
  ready = init()
}
new Stage()

export default async () => dynamoDB.readAll({ table })
`,
  ImportInstanceMembers: `${COMMON}
let table = CONFIG.judgeTable
const init = () => {
  table = CONFIG.locationTable
  return 1
}

class Stage {
  ready = init()
  constructor() {
    table = CONFIG.locationTable
  }
  get stage() {
    table = CONFIG.userTable
    return 1
  }
}

export default async () => dynamoDB.readAll({ table })
`,
  ImportLaterWrite: `${COMMON}
let b = CONFIG.judgeTable
let a = CONFIG.judgeTable
if (process.env.STAGE === 'x') a = b
if (process.env.STAGE === 'x') b = CONFIG.locationTable

export default async () => {
  await dynamoDB.readAll({ table: a })
}
`,
  ImportMethod: `import { list } from '../lib/methodInit'

export default async () => list()
`,
  ImportObjectSetter: `import { list } from '../lib/objectSetter'

export default async () => list()
`,
  ImportPromiseExecutor: `${COMMON}
let table = CONFIG.judgeTable
void new Promise((resolve) => {
  table = CONFIG.locationTable
  resolve(1)
})

export default async () => dynamoDB.readAll({ table })
`,
  ImportStaticBlock: `${COMMON}
let table = CONFIG.judgeTable

class Stage {
  static {
    if (process.env.STAGE === 'x') table = CONFIG.locationTable
  }
}

export default async () => dynamoDB.readAll({ table })
`,
  ImportStaticField: `${COMMON}
let table = CONFIG.judgeTable
const init = () => {
  table = CONFIG.locationTable
  return 1
}

class Stage {
  static ready = init()
}

export default async () => dynamoDB.readAll({ table })
`,
  ImportStaticFieldCall: `${COMMON}
class Stage {
  static rows = dynamoDB.readAll({ table: CONFIG.locationTable })
}

export default async () => dynamoDB.read({ id: 1 })
`,
  ImportSuper: `${COMMON}
let table = CONFIG.judgeTable

class Base {
  constructor(next: string) {
    table = next
  }
}

class Stage extends Base {
  constructor() {
    super(CONFIG.locationTable)
  }
}
new Stage()

export default async () => dynamoDB.readAll({ table })
`,
  ImportTypeOnly: `${COMMON}
import type { Shape } from '../lib/typeOnly'
import { stageTarget } from '../lib/stageTarget'

export const shape: Shape | undefined = undefined

export default async () => dynamoDB.readAll({ table: stageTarget })
`,
  ImportWrappedSetter: `import { list } from '../lib/wrapped'

export default async () => list()
`,
  Index: `${COMMON}
export default async () => {
  await dynamoDB.query({ index: 'gsiEmail', key: 'email = :email' })
  await dynamoDB.query({ key: 'id = :id', table: CONFIG.judgeTable })
}
`,
  ItemComputedAnyName: `${COMMON}
export default async () => {
  await dynamoDB.documentTransaction([
    { Put: { Item: { id: 1 }, TableName: CONFIG.judgeTable, [String(Date.now())]: CONFIG.locationTable } },
  ])
}
`,
  ItemComputedNotTable: `${COMMON}
export default async () => {
  await dynamoDB.documentTransaction([{ Put: { [String(Date.now())]: { id: 1 } } }])
}
`,
  ItemComputedTableName: `${COMMON}
export default async () => {
  await dynamoDB.documentTransaction([{ Put: { Item: { id: 1 }, ['TableName']: CONFIG.locationTable } }])
}
`,
  ItemComputedTwoNames: `${COMMON}
export default async () => {
  const key = Date.now() > 0 ? 'TableName' : 'Other'
  await dynamoDB.documentTransaction([{ Put: { Item: { id: 1 }, TableName: CONFIG.judgeTable, [key]: CONFIG.locationTable } }])
}
`,
  ItemDelete: `${COMMON}
export default async () => {
  await dynamoDB.documentTransaction([{ Delete: { Key: { id: 1 }, TableName: CONFIG.judgeTable } }])
}
`,
  ItemDeleteWrite: `${COMMON}
export default async () => {
  const item: { Delete: { Key: object; TableName?: string } } = { Delete: { Key: { id: 1 } } }
  item.Delete.TableName = CONFIG.locationTable
  await dynamoDB.documentTransaction([item])
}
`,
  ItemQuotedTableName: `${COMMON}
export default async () => {
  await dynamoDB.documentTransaction([{ Put: { Item: { id: 1 }, 'TableName': CONFIG.locationTable } }])
}
`,
  ItemTableNameAdded: `${COMMON}
export default async () => {
  const item: { Put: { Item: object; TableName?: string } } = { Put: { Item: { id: 1 } } }
  item.Put.TableName = CONFIG.locationTable
  await dynamoDB.documentTransaction([item])
}
`,
  ItemTableNameAnyKey: `${COMMON}
export default async () => {
  const item: { Put: Record<string, unknown> } = { Put: { Item: { id: 1 } } }
  item.Put[String(Date.now())] = CONFIG.locationTable
  await dynamoDB.documentTransaction([item])
}
`,
  ItemTableNameConstKey: `${COMMON}
const key = 'TableName' as const

export default async () => {
  const item: { Put: { Item: object; TableName?: string } } = { Put: { Item: { id: 1 } } }
  item.Put[key] = CONFIG.locationTable
  await dynamoDB.documentTransaction([item])
}
`,
  ItemTableNameOutside: `${COMMON}
export default async () => {
  const params: { TableName?: string } = {}
  params.TableName = CONFIG.judgeTable
  return params
}
`,
  ItemTableNameUnknown: `${COMMON}
export default async () => {
  const item: { Put: { Item: object; TableName?: string } } = { Put: { Item: { id: 1 } } }
  item.Put.TableName = String(Date.now())
  await dynamoDB.documentTransaction([item])
}
`,
  ItemTableNameWrite: `${COMMON}
export default async () => {
  const item = { Put: { Item: { id: 1 }, TableName: CONFIG.judgeTable } }
  if (Date.now() > 0) item.Put.TableName = CONFIG.locationTable
  await dynamoDB.documentTransaction([item])
}
`,
  LiteralAnyKey: `${COMMON}
export default async () => dynamoDB.readAll({ [String(Date.now())]: CONFIG.locationTable })
`,
  LiteralConstKey: `${COMMON}
const key = 'table'

export default async () => dynamoDB.readAll({ [key]: CONFIG.locationTable })
`,
  LiteralNumericKeys: `${COMMON}
export default async () => dynamoDB.readAll({ table: CONFIG.judgeTable, 0: 'x', [1]: 'y' })
`,
  LiteralStringKey: `${COMMON}
export default async () => dynamoDB.readAll({ 'table': CONFIG.locationTable })
`,
  NoDefaultExport: `${COMMON}
export const handler = async () => dynamoDB.read({ id: 1 })
`,
  NonLiteralIndex: `${COMMON}
const byIndex = (index: string) => dynamoDB.query({ index, key: 'email = :email' })

export default async () => {
  await byIndex(String(Date.now()))
}
`,
  OptionalArgument: `${COMMON}
const byIndex = (index?: string) => dynamoDB.query({ index, key: 'email = :email' })

export default async () => {
  await byIndex('gsiEmail')
  await byIndex()
}
`,
  OptionalProperty: `${COMMON}
const byOptions = (options: { index?: string }) => dynamoDB.query({ index: options.index, key: 'email = :email' })

export default async () => {
  await byOptions({})
  await byOptions({ index: 'gsiName' })
}
`,
  OptionalTableArgument: `${COMMON}
const readOne = (id: string, table?: string) => dynamoDB.read({ id }, table)

export default async () => {
  await readOne('a')
  await readOne('b', CONFIG.judgeTable)
}
`,
  OptionalTableOption: `${COMMON}
const list = (options: { table?: string }) => dynamoDB.readAll({ table: options.table })

export default async () => {
  await list({})
  await list({ table: CONFIG.judgeTable })
}
`,
  PropertyTwoLiterals: `${COMMON}
type ScanOptions = { table?: string }

export default async () => {
  const judges: ScanOptions = { table: CONFIG.judgeTable }
  const locations: ScanOptions = {}
  locations.table = CONFIG.locationTable
  await dynamoDB.readAll({ table: judges.table })
  await dynamoDB.read({ id: 1 }, locations.table)
}
`,
  ReassignedIndex: `${COMMON}
export default async () => {
  let index: string | undefined = 'gsiEmail'
  if (Date.now() > 0) index = undefined
  await dynamoDB.query({ index, key: 'email = :email' })
}
`,
  ReassignedTable: `${COMMON}
export default async () => {
  let table = CONFIG.judgeTable
  if (Date.now() > 0) table = CONFIG.locationTable
  await dynamoDB.readAll({ table })
}
`,
  SetterCaller: `import { list, useLocations } from '../lib/setter'

export default async () => {
  useLocations()
  await list()
}
`,
  SetterReader: `import { list } from '../lib/setter'

export default async () => list()
`,
  Shorthand: `${COMMON}
const TableName = CONFIG.judgeTable

export default async () => {
  await dynamoDB.documentTransaction([{ Put: { Item: { id: 1 }, TableName } }])
}
`,
  SpreadIndex: `${COMMON}
const base = { index: 'gsiEmail', key: 'email = :email' }
const byOptions = (options: { index?: string }) => dynamoDB.query({ index: options.index, key: 'email = :email' })

export default async () => {
  await dynamoDB.query({ ...base })
  await byOptions({ ...base })
}
`,
  SpreadKeep: `${COMMON}
const page = { limit: 10 }

export default async () => {
  await dynamoDB.query({ index: 'gsiEmail', key: 'email = :email', ...page })
  await dynamoDB.readAll({ table: CONFIG.judgeTable, ...page })
}
`,
  SpreadOverride: `${COMMON}
const query = { index: 'gsiEmail', key: 'email = :email' }
const scan = { table: CONFIG.locationTable }

export default async () => {
  await dynamoDB.query({ ...query, index: 'gsiName' })
  await dynamoDB.readAll({ ...scan, table: CONFIG.judgeTable })
}
`,
  SpreadSelf: `${COMMON}
const retry = async (options: { attempt: number; index?: string }): Promise<unknown> =>
  options.attempt > 3
    ? dynamoDB.query({ index: options.index, key: 'email = :email' })
    : retry({ ...options, attempt: options.attempt + 1 })

export default async () => retry({ attempt: 0, index: 'gsiEmail' })
`,
  SpreadShared: `${COMMON}
const shared = { key: 'id = :id' }
const withTable = { ...shared, table: CONFIG.judgeTable }
const plain = { ...shared }

export default async () => {
  await dynamoDB.query({ ...(Date.now() > 0 ? withTable : plain) })
}
`,
  SpreadTable: `${COMMON}
const options = { key: 'id = :id', table: CONFIG.judgeTable }

export default async () => {
  await dynamoDB.query({ ...options })
}
`,
  SpreadUnknown: `${COMMON}
const query = (options: object) => dynamoDB.query({ ...options, key: 'id = :id' })

export default async () => query(JSON.parse('{}'))
`,
  TableNameOutsideItem: `${COMMON}
const params = { TableName: CONFIG.judgeTable }

export default async () => params.TableName.length
`,
  TernaryClient: `${COMMON}
const makeClient = () => new CustomDynamoClient(CONFIG.judgeTable)

export default async () => {
  const client = Date.now() > 0 ? dynamoDB : makeClient()
  await client.read({ id: 1 })
}
`,
  TernaryIndex: `${COMMON}
const pick = () => 'gsiName'

export default async () => {
  await dynamoDB.query({ index: Date.now() > 0 ? 'gsiEmail' : pick(), key: 'email = :email' })
}
`,
  TernaryOptions: `${COMMON}
const build = () => ({ key: 'email = :email' })

export default async () => {
  await dynamoDB.query(Date.now() > 0 ? { index: 'gsiEmail', key: 'email = :email' } : build())
}
`,
  TernarySpread: `${COMMON}
const base = { key: 'email = :email' }
const build = () => ({ key: 'email = :email' })

export default async () => {
  await dynamoDB.query({ ...(Date.now() > 0 ? base : build()) })
}
`,
  TernaryTableCall: `${COMMON}
export default async () => {
  await dynamoDB.readAll({ table: Date.now() > 0 ? CONFIG.judgeTable : String(Date.now()) })
}
`,
  TernaryTableNull: `${COMMON}
export default async () => {
  await dynamoDB.readAll({ table: Date.now() > 0 ? CONFIG.judgeTable : null })
}
`,
  UnclassifiedMethod: `${COMMON}
export default async () => dynamoDB.scanAll()
`,
  UnknownClient: `${COMMON}
const makeClient = () => new CustomDynamoClient(CONFIG.judgeTable)
const first = (client: Pick<CustomDynamoClient, 'read'>) => client.read({ id: 1 })

export default async () => first(makeClient())
`,
  UnknownClientTable: `${COMMON}
export default async () => {
  const client = new CustomDynamoClient(Date.now() > 0 ? CONFIG.judgeTable : String(Date.now()))
  await client.read({ id: 1 })
}
`,
  UnknownEnvIndex: `${COMMON}
export default async () => {
  await dynamoDB.query({ index: Date.now() > 0 ? 'gsiEmail' : process.env.INDEX, key: 'email = :email' })
}
`,
  UnknownEnvTable: `${COMMON}
export default async () => {
  await dynamoDB.readAll({ table: Date.now() > 0 ? CONFIG.judgeTable : process.env.OTHER_TABLE })
}
`,
  UnknownEventOptions: `${COMMON}
export default async (event: { options: { key: string; table?: string } }) => {
  await dynamoDB.query(Date.now() > 0 ? { key: 'id = :id', table: CONFIG.judgeTable } : event.options)
}
`,
  UnknownEventSpread: `${COMMON}
export default async (event: { options: { table?: string } }) => {
  await dynamoDB.readAll({ ...(Date.now() > 0 ? { table: CONFIG.judgeTable } : event.options) })
}
`,
  UnknownEventTable: `${COMMON}
export default async (event: { table: string }) => {
  await dynamoDB.readAll({ table: Date.now() > 0 ? CONFIG.judgeTable : event.table })
}
`,
  UnknownItem: `${COMMON}
const put = (TableName: string) => dynamoDB.documentTransaction([{ Put: { Item: { id: 1 }, TableName } }])

export default async () => put(String(Date.now()))
`,
  UnknownItemHalf: `${COMMON}
export default async () => {
  await dynamoDB.documentTransaction([
    { Put: { Item: { id: 1 }, TableName: Date.now() > 0 ? CONFIG.judgeTable : String(Date.now()) } },
  ])
}
`,
  UnknownMember: `${COMMON}
export default async () => {
  await dynamoDB.readAll({ table: Date.now() > 0 ? CONFIG.judgeTable : dynamoDB.table })
}
`,
  UnknownOptions: `${COMMON}
const list = (options: { table?: string }) => dynamoDB.readAll(options)

export default async () => list(JSON.parse('{}'))
`,
  UnknownParameter: `${COMMON}
export default async (table: string) => {
  await dynamoDB.readAll({ table: Date.now() > 0 ? CONFIG.judgeTable : table })
}
`,
  UnknownReceiver: `${COMMON}
export default async () => {
  const options = Date.now() > 0 ? { table: CONFIG.judgeTable } : JSON.parse('{}')
  await dynamoDB.readAll({ table: options.table })
}
`,
  UnknownTable: `${COMMON}
const readTable = (table: string) => dynamoDB.readAll({ table })

export default async () => readTable(process.env.OTHER_TABLE ?? '')
`,
  UnknownTableArgument: `${COMMON}
export default async () => dynamoDB.read({ id: 1 }, String(Date.now()))
`,
  WriteConstKey: `${COMMON}
const key = 'table'

export default async () => {
  const options: { table?: string } = { table: CONFIG.judgeTable }
  options[key] = CONFIG.locationTable
  return dynamoDB.readAll(options)
}
`,
  WriteNumericKey: `${COMMON}
export default async () => {
  const options: Record<string | number, string> = { index: 'gsiEmail', key: 'k', table: CONFIG.judgeTable }
  options[0] = 'x'
  return dynamoDB.query(options)
}
`,
  WrongKindIndex: `${COMMON}
export default async () => {
  await dynamoDB.query({ index: Date.now() > 0 ? 'gsiEmail' : CONFIG.judgeTable, key: 'email = :email' })
}
`,
  WrongKindTable: `${COMMON}
export default async () => {
  await dynamoDB.read({ id: 1 }, Date.now() > 0 ? CONFIG.judgeTable : 'other-table')
}
`,
}

/** Lib modules the handlers import, for the rules that depend on which lambda runs a write. */
const LIBS: Record<string, string> = {
  'lib/barrel.ts': `export * from './stage'
`,
  'lib/callAtImport.ts': `${COMMON}
let table = CONFIG.judgeTable
const use = (next: string) => {
  table = next
}
if (process.env.STAGE === 'x') use(CONFIG.locationTable)

export const list = () => dynamoDB.readAll({ table })
`,
  'lib/deep.ts': `${COMMON}
let table = CONFIG.judgeTable
const inner = () => {
  const later = () => {
    table = CONFIG.locationTable
  }
  return later
}
const outer = () => inner()
outer()

export const list = () => dynamoDB.readAll({ table })
`,
  'lib/factory.ts': `${COMMON}
const makeReader = (table: string) => {
  const read = () => dynamoDB.readAll({ table })
  return { read }
}

export const locations = makeReader(CONFIG.locationTable)
`,
  'lib/iife.ts': `${COMMON}
let table = CONFIG.judgeTable
;(() => {
  if (process.env.STAGE === 'x') table = CONFIG.locationTable
})()

export const list = () => dynamoDB.readAll({ table })
`,
  'lib/init.ts': `${COMMON}
let table = CONFIG.judgeTable
function init() {
  if (process.env.STAGE === 'x') table = CONFIG.locationTable
}
init()

export const list = () => dynamoDB.readAll({ table })
`,
  'lib/methodInit.ts': `${COMMON}
let table = CONFIG.judgeTable
const stage = {
  init() {
    table = CONFIG.locationTable
  },
}
stage.init()

export const list = () => dynamoDB.readAll({ table })
`,
  'lib/objectSetter.ts': `${COMMON}
let table = CONFIG.judgeTable

export const admin = {
  useLocations() {
    table = CONFIG.locationTable
  },
}

export const list = () => dynamoDB.readAll({ table })
`,
  'lib/setter.ts': `${COMMON}
let table = CONFIG.judgeTable

export const useLocations = () => {
  table = CONFIG.locationTable
}

export const list = () => dynamoDB.readAll({ table })
`,
  'lib/stage.ts': `import { CONFIG } from '../config'

export let stageTable = CONFIG.judgeTable
if (process.env.STAGE === 'x') stageTable = CONFIG.locationTable
`,
  'lib/stageTarget.ts': `import { CONFIG } from '../config'

export let stageTarget = CONFIG.judgeTable
export const setStage = (next: string) => {
  stageTarget = next
}
`,
  'lib/topcall.ts': `${COMMON}
void dynamoDB.readAll({ table: CONFIG.locationTable })

export const x = 1
`,
  'lib/typeOnly.ts': `import { CONFIG } from '../config'
import { setStage } from './stageTarget'

export interface Shape {
  ok: boolean
}
setStage(CONFIG.locationTable)
`,
  'lib/wrapped.ts': `${COMMON}
let table = CONFIG.judgeTable
const wrap = <T>(f: T) => f

export const useLocations = wrap(() => {
  table = CONFIG.locationTable
})

export const list = () => dynamoDB.readAll({ table })
`,
}

const handlerFile = (name: string) => path.join(root, 'src/lambda', `${name}Function/handler.ts`)

let analyzer: ReturnType<typeof createTableUseAnalyzer>

beforeAll(() => {
  write(
    'config.ts',
    `export const CONFIG = {
  judgeTable: process.env.JUDGE_TABLE_NAME ?? 'judge-table',
  locationTable: process.env.LOCATION_TABLE_NAME ?? 'location-table',
  userTable: process.env.USER_TABLE_NAME ?? 'user-table',
}
`
  )
  write(
    'utils/CustomDynamoClient.ts',
    `export default class CustomDynamoClient {
  table: string
  constructor(tableName: string) {
    this.table = String(tableName)
  }
  async read<T>(_key: object, _table?: string): Promise<T | undefined> {
    return undefined
  }
  async readAll<T>(_options: { table?: string } = {}): Promise<T[]> {
    return []
  }
  async scanAll<T>(): Promise<T[]> {
    return []
  }
  async query<T>(_params: { key: string; table?: string; index?: string }): Promise<T[]> {
    await this.readAll()
    return []
  }
  async write<T>(_item: T, _table?: string): Promise<void> {}
  async documentTransaction(_items: { Put?: { Item: object; TableName: string } }[]): Promise<void> {}
}
`
  )
  for (const [file, content] of Object.entries(LIBS)) write(file, content)
  for (const [name, content] of Object.entries(HANDLERS)) write(`${name}Function/handler.ts`, content)
  analyzer = createTableUseAnalyzer(Object.keys(HANDLERS).map(handlerFile))
})

afterAll(() => rmSync(root, { force: true, recursive: true }))

const usesOf = (name: string) =>
  [...analyzer.usesOf(handlerFile(name))]
    .flatMap(([key, byAction]) => [...byAction.keys()].map((action) => `${action} ${key}`))
    .sort()

describe('createTableUseAnalyzer', () => {
  it('maps the CONFIG keys to the environment variables they read', () => {
    expect([...analyzer.environmentVariables]).toEqual([
      ['judgeTable', 'JUDGE_TABLE_NAME'],
      ['locationTable', 'LOCATION_TABLE_NAME'],
      ['userTable', 'USER_TABLE_NAME'],
    ])
  })

  it('follows a client through a Pick parameter and a table through an options property', () => {
    expect(usesOf('Directory')).toEqual(['GetItem locationTable', 'Scan judgeTable'])
  })

  it('collects a shorthand TableName in a transaction item', () => {
    expect(usesOf('Shorthand')).toEqual(['PutItem judgeTable'])
  })

  it('keeps the index of a query apart from its table', () => {
    expect(usesOf('Index')).toEqual(['Query judgeTable', 'Query userTable/index/gsiEmail'])
  })

  // The base-table query of the calls without an index is the one IAM denies when only the index
  // is granted, so it is recorded beside the index. One handler per way the index goes missing.
  it.each([
    ['an optional argument some call omits', 'OptionalArgument', ['Query userTable', 'Query userTable/index/gsiEmail']],
    [
      'an optional property some literal lacks',
      'OptionalProperty',
      ['Query userTable', 'Query userTable/index/gsiName'],
    ],
    ['a conditional', 'ConditionalIndex', ['Query userTable', 'Query userTable/index/gsiEmail']],
    [
      'an options object with a default, handed on',
      'DefaultOptions',
      ['Query userTable', 'Query userTable/index/gsiEmail'],
    ],
  ])('records the table itself for a query whose index may be undefined through %s', (_, name, expected) => {
    expect(usesOf(name)).toEqual(expected)
  })

  // A default fills in for an omitted argument or property: the call is on the index, not the table.
  it.each([
    ['a parameter default', 'DefaultArgument'],
    ['a destructuring default', 'DefaultProperty'],
  ])('reads %s in place of an omitted index', (_, name) => {
    expect(usesOf(name)).toEqual(['Query userTable/index/gsiEmail'])
  })

  // The same for a table: where it may be undefined, the call lands on the client's default table.
  it.each([
    ['an optional argument', 'OptionalTableArgument', ['GetItem judgeTable', 'GetItem userTable']],
    ['an optional option', 'OptionalTableOption', ['Scan judgeTable', 'Scan userTable']],
    ['a conditional option', 'ConditionalTable', ['Scan judgeTable', 'Scan userTable']],
  ])("records the client's default table for a table that may be undefined through %s", (_, name, expected) => {
    expect(usesOf(name)).toEqual(expected)
  })

  it('reads an index and a table through a spread in the options literal', () => {
    expect(usesOf('SpreadIndex')).toEqual(['Query userTable/index/gsiEmail'])
    expect(usesOf('SpreadTable')).toEqual(['Query judgeTable'])
  })

  it('keeps a property a later spread lacks, and lets a later property override a spread', () => {
    expect(usesOf('SpreadKeep')).toEqual(['Query userTable/index/gsiEmail', 'Scan judgeTable'])
    expect(usesOf('SpreadOverride')).toEqual(['Query userTable/index/gsiName', 'Scan judgeTable'])
  })

  // Two literals spreading one shared literal: the second visit of the shared one is not a cycle.
  it('reads a literal that two spread sources share', () => {
    expect(usesOf('SpreadShared')).toEqual(['Query judgeTable', 'Query userTable'])
  })

  it('reads a literal that spreads itself through a parameter once', () => {
    expect(usesOf('SpreadSelf')).toEqual(['Query userTable/index/gsiEmail'])
  })

  // A variable holds its initializer and everything assigned to it later.
  it('reads what is assigned to a variable after its initializer', () => {
    expect(usesOf('ReassignedTable')).toEqual(['Scan judgeTable', 'Scan locationTable'])
    expect(usesOf('ReassignedIndex')).toEqual(['Query userTable', 'Query userTable/index/gsiEmail'])
  })

  // Every form of write adds to what the variable or property holds (KOE-1557). Flow-insensitive: after
  // `??=` and `||=` the initializer's undefined still counts, so the client's default table does too.
  it.each([
    ['`??=`', 'AssignNullish', ['Scan judgeTable', 'Scan locationTable', 'Scan userTable']],
    ['`||=`', 'AssignOr', ['Scan judgeTable', 'Scan locationTable', 'Scan userTable']],
    ['`&&=`', 'AssignAnd', ['Scan judgeTable', 'Scan locationTable']],
    ['a destructuring assignment', 'AssignDestructuring', ['Scan judgeTable', 'Scan locationTable']],
    // The pattern's default (the user table) is not taken where the source has the property.
    [
      'a destructuring assignment with a default',
      'AssignDestructuringDefault',
      ['Scan judgeTable', 'Scan locationTable'],
    ],
    ['an assignment to a CONFIG binding', 'AssignConfigBinding', ['Scan judgeTable', 'Scan locationTable']],
    ['an assignment to a parameter', 'AssignParameter', ['Scan judgeTable', 'Scan locationTable']],
    ['a for-of loop over an existing variable', 'AssignForOf', ['Scan judgeTable', 'Scan locationTable']],
    ['a for-of loop declaring its variable', 'ForOfDeclaration', ['Scan judgeTable', 'Scan locationTable']],
    ['a module-level statement nothing reaches', 'AssignModuleLevel', ['Scan judgeTable', 'Scan locationTable']],
    ['a module-level statement of an imported file', 'AssignImported', ['Scan judgeTable', 'Scan locationTable']],
    ['an assignment to a property', 'AssignProperty', ['Scan judgeTable', 'Scan locationTable']],
    [
      'an assignment to a property through a parameter',
      'AssignPropertyThroughParameter',
      ['Scan judgeTable', 'Scan locationTable'],
    ],
  ])('reads what %s writes', (_, name, expected) => {
    expect(usesOf(name)).toEqual(expected)
  })

  it('reads an index written onto the options, and the default table of a deleted one', () => {
    expect(usesOf('AssignPropertyIndex')).toEqual(['Query userTable', 'Query userTable/index/gsiName'])
    expect(usesOf('AssignPropertyDelete')).toEqual(['Scan judgeTable', 'Scan userTable'])
  })

  // `a = b; b = c; c = a` gives each of the three all three tables once the fixed point is reached.
  it('reads writes that go round in a cycle', () => {
    const tables = ['judgeTable', 'locationTable', 'userTable']
    expect(usesOf('AssignCycle')).toEqual([
      ...tables.map((table) => `GetItem ${table}`),
      ...tables.map((table) => `Query ${table}`),
    ])
  })

  // A lib's setter runs only for the lambda that calls it, so it changes no other lambda.
  it('counts a write in a function only for the lambda that calls it', () => {
    expect(usesOf('SetterReader')).toEqual(['Scan judgeTable'])
    expect(usesOf('SetterCaller')).toEqual(['Scan judgeTable', 'Scan locationTable'])
  })

  // The checker resolves `locations.table` to ScanOptions.table, which every literal of the type
  // shares: the write lands on the one literal, not there, so `judges.table` stays the judge table.
  // (`locations.table` reads the type's property too, which holds what the literals write out.)
  it('counts a property write only for the literal it is made on', () => {
    expect(usesOf('PropertyTwoLiterals')).toEqual([
      'GetItem judgeTable',
      'GetItem locationTable',
      'GetItem userTable',
      'Scan judgeTable',
    ])
  })

  // What runs at import: the module-level code, a function it calls (only that function's own body),
  // a function called on the spot, a static block. A function it only names or builds runs later.
  it.each([
    ['a module-level call of a function that writes', 'ImportInit', ['Scan judgeTable', 'Scan locationTable']],
    ['a module-level call of a setter', 'ImportCallsSetter', ['Scan judgeTable', 'Scan locationTable']],
    ['a function called on the spot', 'ImportIife', ['Scan judgeTable', 'Scan locationTable']],
    ['a static block', 'ImportStaticBlock', ['Scan judgeTable', 'Scan locationTable']],
    ['a file re-exported through another', 'ImportBarrel', ['Scan judgeTable', 'Scan locationTable']],
    [
      'a write whose value another module-level write sets later',
      'ImportLaterWrite',
      ['Scan judgeTable', 'Scan locationTable'],
    ],
    ['a client call in a function called at import', 'ImportClientCall', ['GetItem userTable', 'Scan locationTable']],
    // A function written out as an argument may run during the call; the wrapper here does not call
    // it, so this is the over-approximation the rule accepts.
    ['a function handed to a wrapper', 'ImportWrappedSetter', ['Scan judgeTable', 'Scan locationTable']],
    ['a static field', 'ImportStaticField', ['Scan judgeTable', 'Scan locationTable']],
    ['a client call in a static field', 'ImportStaticFieldCall', ['GetItem userTable', 'Scan locationTable']],
    ['a client call written out at module level', 'ImportDirectClientCall', ['Scan locationTable']],
    ['a method of a module-level object called there', 'ImportMethod', ['Scan judgeTable', 'Scan locationTable']],
    ['a callback handed to a call', 'ImportCallback', ['GetItem userTable', 'Scan locationTable']],
    ['a Promise executor', 'ImportPromiseExecutor', ['Scan judgeTable', 'Scan locationTable']],
    ['a constructor reached through super()', 'ImportSuper', ['Scan judgeTable', 'Scan locationTable']],
    [
      'the base constructor of a class without one',
      'ImportImplicitConstructor',
      ['Scan judgeTable', 'Scan locationTable'],
    ],
    ['the instance fields of an object built there', 'ImportInstanceField', ['Scan judgeTable', 'Scan locationTable']],
    ['the instance fields of a base class', 'ImportBaseField', ['Scan judgeTable', 'Scan locationTable']],
  ])('reads what runs at import: %s', (_, name, expected) => {
    expect(usesOf(name)).toEqual(expected)
  })

  it.each([
    ['a method of an exported object literal', 'ImportObjectSetter', ['Scan judgeTable']],
    ['a closure a factory called at import returns', 'ImportFactory', ['GetItem userTable']],
    ['the closure a function called there builds', 'ImportDeep', ['Scan judgeTable']],
    ['the constructor, fields and accessors of a class nothing builds', 'ImportInstanceMembers', ['Scan judgeTable']],
    ['a file imported for its types only', 'ImportTypeOnly', ['Scan judgeTable']],
  ])('counts nothing at import from %s', (_, name, expected) => {
    expect(usesOf(name)).toEqual(expected)
  })

  it.each([
    ['a string key', 'LiteralStringKey'],
    ['a computed key that can only be its name', 'LiteralConstKey'],
  ])('reads a table option written under %s', (_, name) => {
    expect(usesOf(name)).toEqual(['Scan locationTable'])
  })

  it('reads a written-out table and skips numeric keys, in literals and in writes', () => {
    expect(usesOf('LiteralNumericKeys')).toEqual(['Scan judgeTable'])
    expect(usesOf('WriteConstKey')).toEqual(['Scan judgeTable', 'Scan locationTable'])
    expect(usesOf('WriteNumericKey')).toEqual(['Query judgeTable/index/gsiEmail'])
  })

  it('reads a client method named by a key', () => {
    expect(usesOf('ClientElementCall')).toEqual(['Scan locationTable'])
    expect(usesOf('ClientElementConstName')).toEqual(['Scan locationTable'])
    expect(usesOf('ClientElementUnknown')).toEqual(['GetItem userTable', 'Scan userTable'])
  })

  // Each use is `file:line (call chain)`, the chain starting at the handler, or at the module-level
  // statement for code that runs at import.
  it('says where each use is and how the handler gets there', () => {
    const where = (name: string, key: string, action: string) =>
      analyzer.usesOf(handlerFile(name)).get(key)?.get(action) ?? []
    expect(where('ImportClientCall', 'locationTable', 'Scan')).toEqual([
      expect.stringMatching(/ImportClientCallFunction\/handler\.ts:6 \(import void warm\(\) > warm\)$/),
    ])
    expect(where('OptionalTableArgument', 'judgeTable', 'GetItem')).toEqual([
      expect.stringMatching(/OptionalTableArgumentFunction\/handler\.ts:6 \(readOne\)$/),
    ])
  })

  it('reads a TableName written onto a transaction item', () => {
    expect(usesOf('ItemTableNameWrite')).toEqual(['PutItem judgeTable', 'PutItem locationTable'])
    expect(usesOf('ItemTableNameAdded')).toEqual(['PutItem locationTable'])
    expect(usesOf('ItemTableNameConstKey')).toEqual(['PutItem locationTable'])
    // A computed key on an item may be its TableName.
    expect(usesOf('ItemTableNameAnyKey')).toEqual(['PutItem locationTable'])
  })

  it.each([
    ['quoted', 'ItemQuotedTableName', ['PutItem locationTable']],
    ['under a literal computed key', 'ItemComputedTableName', ['PutItem locationTable']],
    ['beside a computed key that may be it', 'ItemComputedTwoNames', ['PutItem judgeTable', 'PutItem locationTable']],
    [
      'beside a computed key that may be anything',
      'ItemComputedAnyName',
      ['PutItem judgeTable', 'PutItem locationTable'],
    ],
  ])('reads a TableName written out in an item %s', (_, name, expected) => {
    expect(usesOf(name)).toEqual(expected)
  })

  it('takes the action of a transaction item from the key it sits under', () => {
    expect(usesOf('ItemDelete')).toEqual(['DeleteItem judgeTable'])
    expect(usesOf('ItemDeleteWrite')).toEqual(['DeleteItem locationTable'])
  })

  it.each([
    ['its field initializer', 'ClientOnThis', ['GetItem userTable']],
    ['its constructor', 'ClientOnThisConstructor', ['GetItem judgeTable']],
    ['a subclass that declares it again', 'ClientOnThisSubclass', ['GetItem judgeTable', 'GetItem userTable']],
    [
      'two subclasses of one base',
      'ClientOnThisTwoSubclasses',
      ['GetItem judgeTable', 'GetItem locationTable', 'GetItem userTable'],
    ],
    [
      'a subclass of a subclass',
      'ClientOnThisGrandchild',
      ['GetItem judgeTable', 'GetItem locationTable', 'GetItem userTable'],
    ],
  ])('reads a client on this from %s', (_, name, expected) => {
    expect(usesOf(name)).toEqual(expected)
  })

  it.each([
    [
      'a table that is not a CONFIG key',
      'UnknownTable',
      /handler\.ts:\d+: cannot tell which table the table option \(table\) names/,
    ],
    ['a table argument that is not a CONFIG key', 'UnknownTableArgument', /cannot tell which table the table argument/],
    [
      'a client it cannot trace to its construction',
      'UnknownClient',
      /cannot tell which table the client \(client\) names/,
    ],
    ['options it cannot trace to a literal', 'UnknownOptions', /cannot tell which table the options \(options\) names/],
    ['a spread it cannot see into', 'SpreadUnknown', /cannot tell which table the table option/],
    // A value it can name beside one it cannot is refused, not taken for the named half.
    ['options that may come from a call', 'TernaryOptions', /cannot tell which table the options/],
    ['an index that may come from a call', 'TernaryIndex', /cannot tell which table the index option/],
    ['a table that may come from a call', 'TernaryTableCall', /cannot tell which table the table option/],
    ['a table that may be null', 'TernaryTableNull', /cannot tell which table the table option/],
    ['a spread that may come from a call', 'TernarySpread', /cannot tell which table the table option/],
    ['a client that may come from a call', 'TernaryClient', /cannot tell which table the client \(client\) names/],
    ['a table that may come from the environment', 'UnknownEnvTable', /cannot tell which table the table option/],
    ['a table that may come from the event', 'UnknownEventTable', /cannot tell which table the table option/],
    // An identifier nothing binds, and a member of a known value that nothing sets, each on its own.
    ['a table that may be a parameter nothing binds', 'UnknownParameter', /cannot tell which table the table option/],
    ['a table that may be a member nothing sets', 'UnknownMember', /cannot tell which table the table option/],
    ['an index that may come from the environment', 'UnknownEnvIndex', /cannot tell which table the index option/],
    ['options that may come from the event', 'UnknownEventOptions', /cannot tell which table the options/],
    ['a spread that may come from the event', 'UnknownEventSpread', /cannot tell which table the table option/],
    ['a transaction item whose table may come from a call', 'UnknownItemHalf', /cannot tell which table the item/],
    ['a table that may be a plain string', 'WrongKindTable', /cannot tell which table the table argument/],
    ['an index that may be a table', 'WrongKindIndex', /cannot tell which table the index option/],
    [
      'a client built on a table that may come from a call',
      'UnknownClientTable',
      /cannot tell which table the client \(client\) names/,
    ],
    [
      'a table read from a receiver that may come from a call',
      'UnknownReceiver',
      /cannot tell which table the table option/,
    ],
    [
      'a transaction item whose table it cannot name',
      'UnknownItem',
      /cannot tell which table the item \(TableName\) names/,
    ],
    [
      'an index that is not a string literal',
      'NonLiteralIndex',
      /cannot tell which table the index option \(index\) names/,
    ],
    ['an index that may be empty', 'EmptyIndex', /cannot tell which table the index option/],
    ['a TableName outside a transaction item', 'TableNameOutsideItem', /TableName outside a transaction item/],
    ['a client method it has not classified', 'UnclassifiedMethod', /CustomDynamoClient\.scanAll is not classified/],
    ['a handler without a default export', 'NoDefaultExport', /no default export/],
    // KOE-1557: writes the walk cannot follow.
    ['a for-in loop variable', 'AssignForIn', /cannot tell which table the table option/],
    [
      'a for-of loop over an array it does not see written out',
      'ForOfVariable',
      /cannot tell which table the table option/,
    ],
    [
      'a write to a table property of something that is no literal',
      'AssignPropertyUnknown',
      /cannot tell which table the write \(o\.table\) names/,
    ],
    ['options Object.assign has copied into', 'AssignObjectAssign', /cannot tell which table the table option/],
    // A computed key may be any property: here it may have put a table where the index goes.
    ['options written through a computed key', 'AssignPropertyKey', /cannot tell which table the index option/],
    ['a TableName written outside a transaction item', 'ItemTableNameOutside', /TableName outside a transaction item/],
    ['a TableName written onto an item that is no table', 'ItemTableNameUnknown', /cannot tell which table the item/],
    ['an index written onto something that is no literal', 'AssignWriteIndexUnknown', /the write \(o\.index\)/],
    ['a client written onto something that is no literal', 'AssignWriteClientUnknown', /the write \(r\.client\)/],
    [
      'a table written through a computed key onto something that is no literal',
      'AssignWriteComputedUnknown',
      /the write \(o\[String\(Date\.now\(\)\)\]\)/,
    ],
    [
      'a table Object.assign copies onto something that is no literal',
      'AssignObjectAssignUnknown',
      /the write \(Object\.assign/,
    ],
    ['a client field Object.assign may overwrite', 'AssignObjectAssignThis', /the client \(this\.client\)/],
    ['a client subclass calling its own methods', 'ClientSubclass', /the client \(this\) names/],
    ['a for-of array that spreads another', 'ForOfSpread', /cannot tell which table the table option/],
    ['an arithmetic assignment', 'ArithmeticAssign', /cannot tell which table the table option/],
    ['a position in an array pattern', 'AssignArrayPattern', /cannot tell which table the table option/],
    ['a computed name in an assignment pattern', 'AssignComputedPattern', /cannot tell which table the table option/],
    ['a rest element in an assignment pattern', 'AssignRestPattern', /cannot tell which table the options/],
    // A computed key may be any property: here it may put a table where the index goes.
    ['an options literal with a computed key', 'LiteralAnyKey', /cannot tell which table the index option/],
    // KOE-1557 round 2.
    [
      'a callback run at import whose table nothing binds',
      'ImportCallbackParameter',
      /cannot tell which table the table option/,
    ],
    [
      'an item whose computed key may hold something that is no table',
      'ItemComputedNotTable',
      /cannot tell which table the item/,
    ],
    ['a client method under a key that may be anything', 'ClientElementAnyName', /the client method/],
    [
      'a table Object.assign copies in from a later source',
      'AssignObjectAssignSecondSource',
      /the write \(Object\.assign/,
    ],
    [
      'a client Object.assign copies onto something that is no literal',
      'AssignObjectAssignClient',
      /the write \(Object\.assign/,
    ],
    [
      'a client among the fields Object.assign may overwrite',
      'AssignObjectAssignThisTwoFields',
      /the client \(this\.client\)/,
    ],
    [
      'a client on this outside a class',
      'ClientOnThisLiteral',
      /cannot tell which table the client \(this\.client\) names/,
    ],
  ])('refuses %s', (_, name, message) => {
    expect(() => analyzer.usesOf(handlerFile(name))).toThrow(message)
  })
})
