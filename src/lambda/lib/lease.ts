import type CustomDynamoClient from '../utils/CustomDynamoClient'
import { randomUUID } from 'node:crypto'

interface DynamoLeaseOptions<Item extends object> {
  client: CustomDynamoClient
  durationMs: number
  itemExistsField: Extract<keyof Item, string>
  leaseField: Extract<keyof Item, string>
  table: string
}

interface ClaimOptions {
  key: Record<string, number | string | undefined>
  missingItemMessage: string
}

const isConditionalCheckFailure = (error: unknown) =>
  typeof error === 'object' && error !== null && 'name' in error && error.name === 'ConditionalCheckFailedException'

export const createDynamoLease = <Item extends object, Phase extends Extract<keyof Item, string>>({
  client,
  durationMs,
  itemExistsField,
  leaseField,
  table,
}: DynamoLeaseOptions<Item>) => {
  const leaseName = `#${leaseField}`
  const itemExistsName = `#${itemExistsField}`

  const claim = async ({ key, missingItemMessage }: ClaimOptions) => {
    const token = randomUUID()
    const now = Date.now()
    try {
      await client.update(key, { set: { [leaseField]: { expiresAt: now + durationMs, token } } }, table, undefined, {
        expression: `attribute_exists(${itemExistsName}) AND (attribute_not_exists(${leaseName}) OR ${leaseName}.#expiresAt < :now)`,
        names: {
          '#expiresAt': 'expiresAt',
          [itemExistsName]: itemExistsField,
          [leaseName]: leaseField,
        },
        values: { ':now': now },
      })
    } catch (error) {
      if (isConditionalCheckFailure(error)) return undefined
      throw error
    }

    const item = await client.read<Item>(key, table, true)
    if (!item) throw new Error(missingItemMessage)

    const release = async () => {
      try {
        await client.update(key, { remove: [leaseField] }, table, undefined, {
          expression: `${leaseName}.#token = :token`,
          names: { [leaseName]: leaseField, '#token': 'token' },
          values: { ':token': token },
        })
      } catch (error) {
        // An expired lease may already belong to a retry. Never release that
        // retry's lease or replace the original processing error.
        if (!isConditionalCheckFailure(error)) throw error
      }
    }

    return { item, release, token }
  }

  const markPhase = (key: Record<string, number | string | undefined>, token: string, phase: Phase) =>
    client.update(key, { set: { [phase]: new Date().toISOString() } }, table, undefined, {
      expression: `${leaseName}.#token = :token`,
      names: { [leaseName]: leaseField, '#token': 'token' },
      values: { ':token': token },
    })

  return { claim, markPhase }
}
