import { createRequire } from 'node:module'

// ratchet.js is CommonJS and runs its gate only when run as a script.
const { locate } = createRequire(import.meta.url)('./ratchet.js')

const clients = (file, lines) => locate(file, `${lines.join('\n')}\n`).dynamoClientsOutsideRepositories

const LIB = 'src/lambda/lib/someDomain.ts'
const REPOSITORY = 'src/lambda/lib/repositories/someRepository.ts'

// KOE-1415: with every table behind its repository the client count is 0, so each form a file
// can open a client in statically must be counted, or the ban has a hole.
describe('ratchet: DynamoDB clients outside repositories', () => {
  it.each([
    ['CustomDynamoClient under its own name', ["import CustomDynamoClient from '../utils/CustomDynamoClient'", "new CustomDynamoClient('x')"]],
    ['CustomDynamoClient under an alias', ["import Client from '../utils/CustomDynamoClient'", "new Client('x')"]],
    [
      'CustomDynamoClient through a named default import',
      ["import { default as Client } from '../utils/CustomDynamoClient'", "new Client('x')"],
    ],
    ['a subclass of CustomDynamoClient', ["import Client from '../utils/CustomDynamoClient'", 'class Judges extends Client {}']],
    ['new DynamoDBClient', ["import { DynamoDBClient } from '@aws-sdk/client-dynamodb'", 'new DynamoDBClient({})']],
    ['new DynamoDBClient under an alias', ["import { DynamoDBClient as Raw } from '@aws-sdk/client-dynamodb'", 'new Raw({})']],
    ['new DynamoDBClient through a namespace import', ["import * as sdk from '@aws-sdk/client-dynamodb'", 'new sdk.DynamoDBClient({})']],
    ['new DynamoDB', ["import { DynamoDB } from '@aws-sdk/client-dynamodb'", 'new DynamoDB({})']],
    [
      'DynamoDBDocumentClient.from under an alias',
      ["import { DynamoDBDocumentClient as Doc } from '@aws-sdk/lib-dynamodb'", 'Doc.from(client)'],
    ],
    ['DynamoDBDocument.from', ["import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb'", 'DynamoDBDocument.from(client)']],
    ['new DynamoDBDocument', ["import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb'", 'new DynamoDBDocument(client)']],
    ['a subclass of DynamoDBClient', ["import { DynamoDBClient } from '@aws-sdk/client-dynamodb'", 'class X extends DynamoDBClient {}']],
    ['a subclass of DynamoDB', ["import { DynamoDB } from '@aws-sdk/client-dynamodb'", 'class X extends DynamoDB {}']],
  ])('counts %s', (_, lines) => {
    expect(clients(LIB, lines)).toEqual([`${LIB}:2`])
  })

  it('counts an SDK client in a repository too: only CustomDynamoClient.ts builds one', () => {
    expect(clients(REPOSITORY, ["import { DynamoDBClient } from '@aws-sdk/client-dynamodb'", 'new DynamoDBClient({})'])).toEqual([
      `${REPOSITORY}:2`,
    ])
    expect(
      clients('src/lambda/utils/CustomDynamoClient.ts', [
        "import { DynamoDBClient } from '@aws-sdk/client-dynamodb'",
        'new DynamoDBClient({})',
      ])
    ).toEqual([])
  })

  it.each([
    ['in a test', 'src/lambda/lib/someDomain.test.ts', ["import Client from '../utils/CustomDynamoClient'", "new Client('x')"]],
    ['in test support', 'src/lambda/test-utils/integration.ts', ["import { DynamoDBClient } from '@aws-sdk/client-dynamodb'", 'new DynamoDBClient({})']],
    [
      'through a type-only import',
      LIB,
      ["import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'", 'DynamoDBDocumentClient.from(client)'],
    ],
    [
      'through a type-only import specifier',
      LIB,
      ["import { type DynamoDBClient } from '@aws-sdk/client-dynamodb'", 'new DynamoDBClient({})'],
    ],
    ['a class of another module under the same name', LIB, ["import { DynamoDB } from './other'", 'new DynamoDB({})']],
    // Code that compiles imports the class; a name nothing imports is some other class.
    ['under a name the file does not import', LIB, ["const CustomDynamoClient = class {}", "new CustomDynamoClient('x')"]],
    // The SDK clause covers the lambda code only.
    ['outside the lambda code', 'src/lib/x.ts', ["import { DynamoDBClient } from '@aws-sdk/client-dynamodb'", 'new DynamoDBClient({})']],
    ['re-exported as a type only', LIB, ["export type { DynamoDBClient } from '@aws-sdk/client-dynamodb'"]],
    ['re-exported from another module', LIB, ["export * from './other'"]],
    [
      're-exported by name when it is no client class',
      LIB,
      ["export { DynamoDBServiceException } from '@aws-sdk/client-dynamodb'"],
    ],
    ['re-exported through a type-only specifier', LIB, ["export { type DynamoDBClient } from '@aws-sdk/client-dynamodb'"]],
    ['in a local export of something else', LIB, ['const a = 1', 'export { a }']],
    [
      'in a local type-only export',
      LIB,
      ["import { DynamoDBClient } from '@aws-sdk/client-dynamodb'", 'export { type DynamoDBClient }'],
    ],
  ])('does not count a client %s', (_, file, lines) => {
    expect(clients(file, lines)).toEqual([])
  })

  // A re-export hands the constructor on to a file the ban then cannot see build it.
  it.each([
    ['an SDK client by name', ["export { DynamoDBClient } from '@aws-sdk/client-dynamodb'"]],
    ['an SDK client under an alias', ["export { DynamoDBDocument as Doc } from '@aws-sdk/lib-dynamodb'"]],
    ['CustomDynamoClient under a name', ["export { default as Client } from '../utils/CustomDynamoClient'"]],
    ['every export of an SDK package', ["export * from '@aws-sdk/lib-dynamodb'"]],
    ['an SDK package as a namespace', ["export * as sdk from '@aws-sdk/client-dynamodb'"]],
  ])('counts a re-export of %s', (_, lines) => {
    expect(clients(LIB, lines)).toEqual([`${LIB}:1`])
  })

  // An imported constructor exported on from the file hands it on just the same.
  it.each([
    ['CustomDynamoClient by name', ["import C from '../utils/CustomDynamoClient'", 'export { C }']],
    ['an SDK client under an alias', ["import { DynamoDBClient } from '@aws-sdk/client-dynamodb'", 'export { DynamoDBClient as X }']],
    ['CustomDynamoClient as the default export', ["import C from '../utils/CustomDynamoClient'", 'export default C']],
  ])('counts a local export of %s', (_, lines) => {
    expect(clients(LIB, lines)).toEqual([`${LIB}:2`])
  })

})

// KOE-1576: a repository opens one client, on its own table: `<x>Table` in `<x>Repository.ts`,
// `wsConnectionsTable` in the WebSocket connection repository. Only the file named after a table
// may open it, so no table gets a second client in another file either.
describe('ratchet: one repository per table', () => {
  const WS = 'src/lambda/lib/ws/connectionRepository.ts'
  const CLIENT_IMPORT = "import CustomDynamoClient from '../../utils/CustomDynamoClient'"
  const IMPORTS = ["import { CONFIG } from '../../config'", CLIENT_IMPORT]
  const OWN_CLIENT = 'new CustomDynamoClient(CONFIG.someTable)'

  it.each([
    ['its own table', REPOSITORY, [...IMPORTS, `const dynamoDB = ${OWN_CLIENT}`]],
    [
      'its own table under aliased imports',
      REPOSITORY,
      [
        "import { CONFIG as config } from '../../config'",
        "import { default as Client } from '../../utils/CustomDynamoClient'",
        'new Client(config.someTable)',
      ],
    ],
    ['the WebSocket connections table', WS, [...IMPORTS, 'new CustomDynamoClient(CONFIG.wsConnectionsTable)']],
  ])('does not count a repository client on %s', (_, file, lines) => {
    expect(clients(file, lines)).toEqual([])
  })

  it.each([
    ["another repository's table", REPOSITORY, [...IMPORTS, 'new CustomDynamoClient(CONFIG.registrationTable)']],
    ['another table in the WebSocket connection repository', WS, [...IMPORTS, 'new CustomDynamoClient(CONFIG.eventTable)']],
    ['a table name in a string', REPOSITORY, [...IMPORTS, "new CustomDynamoClient('some-table')"]],
    ['a table name in a variable', REPOSITORY, [...IMPORTS, 'new CustomDynamoClient(someTable)']],
    ['a table read with brackets', REPOSITORY, [...IMPORTS, "new CustomDynamoClient(CONFIG['someTable'])"]],
    ['a second argument', REPOSITORY, [...IMPORTS, 'new CustomDynamoClient(CONFIG.someTable, x)']],
    ['no argument', REPOSITORY, [...IMPORTS, 'new CustomDynamoClient()']],
    [
      'a CONFIG of another module',
      REPOSITORY,
      ["import { CONFIG } from './config'", CLIENT_IMPORT, OWN_CLIENT],
    ],
    [
      'a CONFIG the file defines',
      REPOSITORY,
      ["const CONFIG = { someTable: 'x' }", CLIENT_IMPORT, OWN_CLIENT],
    ],
    [
      'another export of the config module',
      REPOSITORY,
      ["import { OTHER as CONFIG } from '../../config'", CLIENT_IMPORT, OWN_CLIENT],
    ],
    ['a type-only CONFIG import', REPOSITORY, ["import type { CONFIG } from '../../config'", CLIENT_IMPORT, OWN_CLIENT]],
    [
      'the config module through a namespace',
      REPOSITORY,
      ["import * as config from '../../config'", CLIENT_IMPORT, 'new CustomDynamoClient(config.CONFIG.someTable)'],
    ],
    [
      'a table of a file not named after one',
      'src/lambda/lib/repositories/someHelpers.ts',
      [...IMPORTS, 'new CustomDynamoClient(CONFIG.someHelpersTable)'],
    ],
    [
      'the WebSocket connections table outside lib/ws',
      'src/lambda/lib/repositories/wsConnectionsRepository.ts',
      [...IMPORTS, 'new CustomDynamoClient(CONFIG.wsConnectionsTable)'],
    ],
    ['a subclass', REPOSITORY, [...IMPORTS, 'class Judges extends CustomDynamoClient {}']],
    ['a re-export', REPOSITORY, ['', '', "export { default as Client } from '../../utils/CustomDynamoClient'"]],
    ['a local export', REPOSITORY, [...IMPORTS, 'export { CustomDynamoClient }']],
  ])('counts a repository client on %s', (_, file, lines) => {
    expect(clients(file, lines)).toEqual([`${file}:3`])
  })

  it('counts a second client on its own table', () => {
    expect(clients(REPOSITORY, [...IMPORTS, `const a = ${OWN_CLIENT}`, `const b = ${OWN_CLIENT}`])).toEqual([`${REPOSITORY}:4`])
  })
})
