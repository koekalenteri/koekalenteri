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
  Index: `${COMMON}
export default async () => {
  await dynamoDB.query({ index: 'gsiEmail', key: 'email = :email' })
  await dynamoDB.query({ key: 'id = :id', table: CONFIG.judgeTable })
}
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
    this.table = tableName
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
    return []
  }
  async write<T>(_item: T, _table?: string): Promise<void> {}
  async documentTransaction(_items: { Put?: { Item: object; TableName: string } }[]): Promise<void> {}
}
`
  )
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
  ])('refuses %s', (_, name, message) => {
    expect(() => analyzer.usesOf(handlerFile(name))).toThrow(message)
  })
})
