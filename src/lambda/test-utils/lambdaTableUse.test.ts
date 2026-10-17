import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { analyzeTableUse } from './lambdaTableUse'

/**
 * A small lambda tree of its own, so each case says what the walk must find or refuse without
 * depending on what the real handlers happen to do. The paths mirror the repository's, since the
 * walk finds CONFIG and the client by them.
 */
const root = mkdtempSync(path.join(tmpdir(), 'lambda-table-use-'))

const write = (file: string, content: string) => {
  const target = path.join(root, 'src/lambda', file)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, content)
  return target
}

const handler = (name: string, content: string) => write(`${name}Function/handler.ts`, content)

const COMMON = `
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
`

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
  async query<T>(_params: { key: string; table?: string; index?: string }): Promise<T[]> {
    return []
  }
  async write<T>(_item: T, _table?: string): Promise<void> {}
  async documentTransaction(_items: { Put?: { Item: object; TableName: string } }[]): Promise<void> {}
}
`
  )
})

afterAll(() => rmSync(root, { force: true, recursive: true }))

const usesOf = (file: string) => {
  const { uses } = analyzeTableUse([file])
  const found = uses.get(file)
  if (!found) throw new Error('no analysis')
  return [...found].flatMap(([key, byAction]) => [...byAction.keys()].map((action) => `${action} ${key}`)).sort()
}

describe('analyzeTableUse', () => {
  it('follows a client through a Pick parameter and a table through an options property', () => {
    const file = handler(
      'Directory',
      `${COMMON}
type Store = Pick<CustomDynamoClient, 'read'>
const dynamoDB = new CustomDynamoClient(CONFIG.locationTable)
const snapshot = (store: Store) => store.read({ id: 'fi' })
const list = (client: CustomDynamoClient, options: { table: string }) => client.readAll({ table: options.table })

export default async () => {
  await snapshot(dynamoDB)
  await list(dynamoDB, { table: CONFIG.judgeTable })
}
`
    )

    expect(usesOf(file)).toEqual(['GetItem locationTable', 'Scan judgeTable'])
  })

  it('collects a shorthand TableName in a transaction item', () => {
    const file = handler(
      'Shorthand',
      `${COMMON}
const dynamoDB = new CustomDynamoClient(CONFIG.locationTable)
const TableName = CONFIG.judgeTable

export default async () => {
  await dynamoDB.documentTransaction([{ Put: { Item: { id: 1 }, TableName } }])
}
`
    )

    expect(usesOf(file)).toEqual(['PutItem judgeTable'])
  })

  it('keeps the index of a query apart from its table', () => {
    const file = handler(
      'Index',
      `${COMMON}
const dynamoDB = new CustomDynamoClient(CONFIG.userTable)

export default async () => {
  await dynamoDB.query({ index: 'gsiEmail', key: 'email = :email' })
  await dynamoDB.query({ key: 'id = :id', table: CONFIG.judgeTable })
}
`
    )

    expect(usesOf(file)).toEqual(['Query judgeTable', 'Query userTable/index/gsiEmail'])
  })

  it('refuses a table that is not a CONFIG key', () => {
    const file = handler(
      'Unknown',
      `${COMMON}
const dynamoDB = new CustomDynamoClient(CONFIG.locationTable)
const readTable = (table: string) => dynamoDB.readAll({ table })

export default async () => {
  await readTable(process.env.OTHER_TABLE ?? '')
}
`
    )

    expect(() => analyzeTableUse([file])).toThrow(/handler\.ts:\d+: cannot tell which table the table option/)
  })
})
