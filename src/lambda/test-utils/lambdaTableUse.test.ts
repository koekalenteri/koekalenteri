import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createTableUseAnalyzer } from './lambdaTableUse'

/**
 * A small lambda tree of its own, so each case says what the walk must find or refuse without
 * depending on what the real handlers happen to do. The paths mirror the repository's, since the
 * walk finds CONFIG and the client by them. One program holds every handler; a walk that must
 * throw does so for its own handler only.
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
  OptionalIndex: `${COMMON}
const byIndex = (index?: string) => dynamoDB.query({ index, key: 'email = :email' })
const byOptions = (options: { index?: string }) => dynamoDB.query({ index: options.index, key: 'email = :email' })

export default async () => {
  await byIndex('gsiEmail')
  await byIndex()
  await byOptions({})
  await byOptions({ index: 'gsiName' })
}
`,
  Shorthand: `${COMMON}
const TableName = CONFIG.judgeTable

export default async () => {
  await dynamoDB.documentTransaction([{ Put: { Item: { id: 1 }, TableName } }])
}
`,
  TableNameOutsideItem: `${COMMON}
const params = { TableName: CONFIG.judgeTable }

export default async () => params.TableName.length
`,
  UnclassifiedMethod: `${COMMON}
export default async () => dynamoDB.scanAll()
`,
  UnknownClient: `${COMMON}
const makeClient = () => new CustomDynamoClient(CONFIG.judgeTable)
const first = (client: Pick<CustomDynamoClient, 'read'>) => client.read({ id: 1 })

export default async () => first(makeClient())
`,
  UnknownItem: `${COMMON}
const put = (TableName: string) => dynamoDB.documentTransaction([{ Put: { Item: { id: 1 }, TableName } }])

export default async () => put(String(Date.now()))
`,
  UnknownOptions: `${COMMON}
const list = (options: { table?: string }) => dynamoDB.readAll(options)

export default async () => list(JSON.parse('{}'))
`,
  UnknownTable: `${COMMON}
const readTable = (table: string) => dynamoDB.readAll({ table })

export default async () => readTable(process.env.OTHER_TABLE ?? '')
`,
  UnknownTableArgument: `${COMMON}
export default async () => dynamoDB.read({ id: 1 }, String(Date.now()))
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
  // is granted, so it is recorded beside the index.
  it('records the table itself for a query whose index may be undefined', () => {
    expect(usesOf('OptionalIndex')).toEqual([
      'Query userTable',
      'Query userTable/index/gsiEmail',
      'Query userTable/index/gsiName',
    ])
    expect(usesOf('ConditionalIndex')).toEqual(['Query userTable', 'Query userTable/index/gsiEmail'])
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
