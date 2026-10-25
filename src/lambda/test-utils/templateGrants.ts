/**
 * Which DynamoDB tables each function in the built SAM template may use, from its `Policies`
 * (KOE-1492): the SAM policy templates, inline statements with `dynamodb:` actions, and `!Ref`s to
 * managed policies (`WebSocketPolicy`, `AuthorizePolicy`). Anything else that names DynamoDB is an
 * error, so a new policy shape is classified before it is trusted.
 */
import type { Action } from './dynamoActions'
import { isRecord, listField, parseTemplate, recordField, stringField } from './cloudFormationYaml'
import { indexKey, READ_ACTIONS, tableOfKey, WRITE_ACTIONS } from './dynamoActions'

interface FunctionGrants {
  codeUri: string
  /** Table logical id, or `X/index/<name>`, to the actions the function's policies allow on it (`*` for all). */
  grants: Map<string, Set<Action>>
}

interface TemplateTables {
  /** Function logical id to what its policies grant. */
  functions: Map<string, FunctionGrants>
  /** Environment variable (`EVENT_TABLE_NAME`) to the table logical id the Globals set it to. */
  environmentVariables: Map<string, string>
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const actionsOf = (actions: string[], where: string): Action[] =>
  actions.map((action) => {
    const name = action.slice('dynamodb:'.length)
    if (name !== '*' && !READ_ACTIONS.has(name) && !WRITE_ACTIONS.has(name)) {
      throw new Error(`${where}: ${action} is not classified in dynamoActions.ts`)
    }
    return name
  })

/** The grant key an IAM resource names: `!GetAtt X.Arn` is X, `!Sub ${X.Arn}/index/gsiEmail` is X/index/gsiEmail. */
const keyOfResource = (resource: unknown, where: string): string => {
  if (isRecord(resource)) {
    const getAtt = stringField(resource, 'GetAtt')?.match(/^(\w+)\.Arn$/)
    if (getAtt) return getAtt[1]
    const sub = stringField(resource, 'Sub')?.match(/^\$\{(\w+)\.Arn\}(?:\/index\/([\w*-]+))?$/)
    if (sub) return sub[2] === undefined ? sub[1] : indexKey(sub[1], sub[2])
  }
  throw new Error(`${where}: resource ${JSON.stringify(resource)} is not a table ARN this check understands`)
}

const grant = (grants: FunctionGrants, key: string, actions: Action[]) => {
  const granted = grants.grants.get(key) ?? new Set<Action>()
  for (const action of actions) granted.add(action)
  grants.grants.set(key, granted)
}

const grantStatements = (grants: FunctionGrants, statements: unknown[], tables: Set<string>, where: string) => {
  for (const statement of statements) {
    if (!isRecord(statement)) throw new Error(`${where}: statement is not a map`)
    const actions = listField(statement, 'Action')
    if (!isStringArray(actions)) throw new Error(`${where}: actions are not strings`)
    const dynamo = actions.filter((action) => action.startsWith('dynamodb:'))
    if (!dynamo.length) continue
    if (stringField(statement, 'Effect') !== 'Allow') {
      throw new Error(`${where}: a dynamodb statement that is not Allow`)
    }
    for (const resource of listField(statement, 'Resource')) {
      const key = keyOfResource(resource, where)
      if (!tables.has(tableOfKey(key))) throw new Error(`${where}: ${key} is not a table`)
      grant(grants, key, actionsOf(dynamo, where))
    }
  }
}

/**
 * What the SAM policy templates allow, as policy_templates.json has them (the PartiQL actions left
 * out: nothing here sends PartiQL). Note that the write template has no DeleteItem and no
 * ConditionCheckItem: a delete or a transaction condition needs the crud template.
 */
const POLICY_TEMPLATES: Record<string, Action[]> = {
  DynamoDBCrudPolicy: [...READ_ACTIONS, ...WRITE_ACTIONS],
  DynamoDBReadPolicy: [...READ_ACTIONS],
  DynamoDBWritePolicy: ['BatchWriteItem', 'PutItem', 'UpdateItem'],
}

const grantManagedPolicy = (
  grants: FunctionGrants,
  reference: string,
  resources: Record<string, unknown>,
  tables: Set<string>,
  where: string
) => {
  const managed = recordField(resources, reference)
  if (stringField(managed, 'Type') !== 'AWS::IAM::ManagedPolicy') {
    throw new Error(`${where}: ${reference} is not a managed policy`)
  }
  const document = recordField(recordField(managed, 'Properties'), 'PolicyDocument')
  grantStatements(grants, listField(document, 'Statement'), tables, `${where} (${reference})`)
}

const grantPolicyTemplate = (
  grants: FunctionGrants,
  policy: Record<string, unknown>,
  name: string,
  tables: Set<string>,
  where: string
) => {
  const table = stringField(recordField(recordField(policy, name), 'TableName'), 'Ref')
  if (!table || !tables.has(table)) throw new Error(`${where}: ${name} names no table`)
  // The templates cover the table and every index of it.
  grant(grants, table, POLICY_TEMPLATES[name])
  grant(grants, indexKey(table, '*'), POLICY_TEMPLATES[name])
}

/** One entry of a function's `Policies` list. */
const grantPolicy = (
  grants: FunctionGrants,
  policy: unknown,
  resources: Record<string, unknown>,
  tables: Set<string>,
  where: string
) => {
  if (!isRecord(policy)) throw new Error(`${where}: a policy that is not a map`)
  // An inline policy document, with or without a Version beside the statements.
  if ('Statement' in policy) {
    grantStatements(grants, listField(policy, 'Statement'), tables, where)
    return
  }
  const [name] = Object.keys(policy)
  if (name === 'Ref') {
    grantManagedPolicy(grants, stringField(policy, 'Ref') ?? '', resources, tables, where)
  } else if (name in POLICY_TEMPLATES) {
    grantPolicyTemplate(grants, policy, name, tables, where)
  } else if (name.includes('DynamoDB') || !name.endsWith('Policy')) {
    throw new Error(`${where}: ${name} is not a policy this check understands`)
  }
  // Any other SAM policy template (CloudWatchPutMetricPolicy, S3ReadPolicy, ...) grants no table.
}

/** Every function in the built template with what its policies grant, and the Globals' table variables. */
export const templateTables = (templateText: string): TemplateTables => {
  const parsed = parseTemplate(templateText)
  if (!isRecord(parsed)) throw new Error('template is not a map')
  const resources = recordField(parsed, 'Resources')
  const tables = new Set(
    Object.entries(resources)
      .filter(([, resource]) => isRecord(resource) && resource.Type === 'AWS::DynamoDB::Table')
      .map(([name]) => name)
  )
  const functions = new Map<string, FunctionGrants>()
  for (const [name, resource] of Object.entries(resources)) {
    if (!isRecord(resource) || resource.Type !== 'AWS::Serverless::Function') continue
    const properties = recordField(resource, 'Properties')
    const grants: FunctionGrants = { codeUri: stringField(properties, 'CodeUri') ?? '', grants: new Map() }
    for (const policy of listField(properties, 'Policies')) grantPolicy(grants, policy, resources, tables, name)
    functions.set(name, grants)
  }
  const globals = recordField(recordField(recordField(parsed, 'Globals'), 'Function'), 'Environment')
  const environmentVariables = new Map<string, string>()
  for (const [variable, value] of Object.entries(recordField(globals, 'Variables'))) {
    const table = isRecord(value) ? stringField(value, 'Ref') : undefined
    if (table && tables.has(table)) environmentVariables.set(variable, table)
  }
  return { environmentVariables, functions }
}
