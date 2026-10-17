/** The DynamoDB actions the lambdas send and the templates grant, shared by the two sides of the policy check (KOE-1492). */

type Access = 'read' | 'write'

/** A DynamoDB action without its `dynamodb:` prefix: `GetItem`, `Query`, `PutItem`, ... */
export type Action = string

export const READ_ACTIONS: ReadonlySet<Action> = new Set(['BatchGetItem', 'DescribeTable', 'GetItem', 'Query', 'Scan'])
export const WRITE_ACTIONS: ReadonlySet<Action> = new Set([
  'BatchWriteItem',
  'ConditionCheckItem',
  'DeleteItem',
  'PutItem',
  'UpdateItem',
])

export const accessOf = (action: Action): Access => {
  if (READ_ACTIONS.has(action)) return 'read'
  if (WRITE_ACTIONS.has(action)) return 'write'
  throw new Error(`dynamodb:${action} is not classified in dynamoActions.ts`)
}

/**
 * What a use or a grant is keyed by: the table (`EventTable`, or the CONFIG key `eventTable` on the
 * code side), or one of its indexes (`UserTable/index/gsiEmail`). A grant on `X/index/*` covers every
 * index of X. IAM resolves a Query on an index against the index's ARN, not the table's, so the two
 * are kept apart on both sides.
 */
export const indexKey = (table: string, index: string) => `${table}/index/${index}`

export const tableOfKey = (key: string) => key.split('/')[0]

/** Whether `actions` (a key to the actions granted on it) allow `action` on `key`. */
export const isGranted = (grants: ReadonlyMap<string, ReadonlySet<Action>>, key: string, action: Action) => {
  const allows = (granted: ReadonlySet<Action> | undefined) =>
    granted !== undefined && (granted.has(action) || granted.has('*'))
  if (allows(grants.get(key))) return true
  const [table, , index] = key.split('/')
  return index !== undefined && allows(grants.get(indexKey(table, '*')))
}
