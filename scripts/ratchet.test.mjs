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
    ['in a repository', REPOSITORY, ["import CustomDynamoClient from '../../utils/CustomDynamoClient'", "new CustomDynamoClient('x')"]],
    [
      'in the WebSocket connection repository',
      'src/lambda/lib/ws/connectionRepository.ts',
      ["import CustomDynamoClient from '../../utils/CustomDynamoClient'", "new CustomDynamoClient('x')"],
    ],
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
  ])('does not count a client %s', (_, file, lines) => {
    expect(clients(file, lines)).toEqual([])
  })
})
