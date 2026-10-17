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
  const table = tableOfKey(key)
  return table !== key && allows(grants.get(indexKey(table, '*')))
}

/** The write actions only the crud template carries (`DynamoDBWritePolicy` has neither). */
const CRUD_ONLY_WRITES: ReadonlySet<Action> = new Set(['ConditionCheckItem', 'DeleteItem'])

const accessesOf = (actions: ReadonlySet<Action>) => {
  const accesses = new Set<Access>()
  for (const action of actions) {
    if (action === '*') accesses.add('read').add('write')
    else accesses.add(accessOf(action))
  }
  return accesses
}

/** Grant keys (a table or its index) to actions, folded onto the table. */
const byTable = (actions: ReadonlyMap<string, ReadonlySet<Action>>) => {
  const tables = new Map<string, Set<Action>>()
  for (const [key, keyActions] of actions) {
    const table = tableOfKey(key)
    const all = tables.get(table) ?? new Set<Action>()
    for (const action of keyActions) all.add(action)
    tables.set(table, all)
  }
  return tables
}

/**
 * The read and write classes granted on a table the code never uses in that class. A table the code
 * only deletes from or condition-checks is the one exception: no write template carries those two
 * actions, so the crud template's read class (every read action, as the template grants them) is
 * not excess there. A narrower read grant beside a delete is still excess: it could have been left out.
 */
export const unusedGrants = (
  granted: ReadonlyMap<string, ReadonlySet<Action>>,
  used: ReadonlyMap<string, ReadonlySet<Action>>
): { access: Access; table: string }[] => {
  const usedByTable = byTable(used)
  const unused: { access: Access; table: string }[] = []
  for (const [table, actions] of byTable(granted)) {
    const usedActions = usedByTable.get(table) ?? new Set<Action>()
    const usedAccesses = accessesOf(usedActions)
    const needsCrud =
      [...usedActions].some((action) => CRUD_ONLY_WRITES.has(action)) &&
      [...READ_ACTIONS].every((action) => actions.has(action))
    for (const access of accessesOf(actions)) {
      if (usedAccesses.has(access) || (access === 'read' && needsCrud)) continue
      unused.push({ access, table })
    }
  }
  return unused
}
