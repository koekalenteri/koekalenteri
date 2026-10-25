/**
 * Enough of IAM's policy evaluation to ask whether a set of identity policies lets a call through:
 * an explicit Deny wins, otherwise some Allow must match the action, the resource and every
 * condition. Wildcards are IAM's `*` and `?`; actions match without regard to case, resources with.
 * Only the condition operators the deploy role uses are known, and any other one throws, so a check
 * built on this never passes on a condition it did not read.
 */
import { isRecord, listField } from './cloudFormationYaml'

export interface PolicyStatement {
  sid: string
  effect: 'Allow' | 'Deny'
  actions: string[]
  resources: string[]
  /** Operator to condition key to the values any of which satisfies it. */
  conditions: Map<string, Map<string, string[]>>
}

/** Condition keys of the request, such as `iam:PermissionsBoundary`. */
export type RequestContext = Record<string, string>

const OPERATORS = new Set(['ArnEquals', 'ArnLike', 'StringEquals', 'StringLike'])

const strings = (value: unknown, where: string): string[] =>
  listField({ value }, 'value').map((item) => {
    if (typeof item !== 'string') throw new Error(`${where}: ${JSON.stringify(item)} is not a string`)
    return item
  })

const escapeRegExp = (text: string) => text.replaceAll(/[.+^${}()|[\]\\]/g, String.raw`\$&`)

export const wildcardMatches = (pattern: string, value: string, ignoreCase = false): boolean =>
  new RegExp(`^${escapeRegExp(pattern).replaceAll('*', '.*').replaceAll('?', '.')}$`, ignoreCase ? 'i' : '').test(value)

const conditionsOf = (condition: unknown, where: string): PolicyStatement['conditions'] => {
  const conditions: PolicyStatement['conditions'] = new Map()
  if (condition === undefined) return conditions
  if (!isRecord(condition)) throw new Error(`${where}: Condition is not a map`)
  for (const [operator, keys] of Object.entries(condition)) {
    if (!OPERATORS.has(operator)) throw new Error(`${where}: condition operator ${operator} is not handled`)
    if (!isRecord(keys)) throw new Error(`${where}: ${operator} is not a map`)
    conditions.set(operator, new Map(Object.entries(keys).map(([key, values]) => [key, strings(values, where)])))
  }
  return conditions
}

/** The statements of a policy document whose intrinsics are already resolved. */
export const policyStatements = (document: unknown, where: string): PolicyStatement[] => {
  if (!isRecord(document)) throw new Error(`${where}: the policy document is not a map`)
  return listField(document, 'Statement').map((statement, index) => {
    const at = `${where} statement ${index}`
    if (!isRecord(statement)) throw new Error(`${at} is not a map`)
    if (statement.NotAction !== undefined || statement.NotResource !== undefined) {
      throw new Error(`${at}: NotAction and NotResource are not handled`)
    }
    const effect = statement.Effect
    if (effect !== 'Allow' && effect !== 'Deny') throw new Error(`${at}: Effect ${String(effect)}`)
    return {
      actions: strings(statement.Action, at),
      conditions: conditionsOf(statement.Condition, at),
      effect,
      resources: strings(statement.Resource, at),
      sid: typeof statement.Sid === 'string' ? statement.Sid : at,
    }
  })
}

const conditionHolds = (operator: string, key: string, values: string[], context: RequestContext) => {
  const actual = context[key]
  if (actual === undefined) return false
  // IAM matches ArnEquals with wildcards exactly as ArnLike; only StringEquals compares literally.
  const like = operator !== 'StringEquals'
  return values.some((value) => (like ? wildcardMatches(value, actual) : value === actual))
}

const applies = (statement: PolicyStatement, action: string, resource: string, context: RequestContext) =>
  statement.actions.some((pattern) => wildcardMatches(pattern, action, true)) &&
  statement.resources.some((pattern) => wildcardMatches(pattern, resource)) &&
  [...statement.conditions].every(([operator, keys]) =>
    [...keys].every(([key, values]) => conditionHolds(operator, key, values, context))
  )

export const isAllowed = (
  statements: PolicyStatement[],
  action: string,
  resource: string,
  context: RequestContext = {}
): boolean => {
  const matching = statements.filter((statement) => applies(statement, action, resource, context))
  return matching.some((statement) => statement.effect === 'Allow') && matching.every((s) => s.effect === 'Allow')
}
