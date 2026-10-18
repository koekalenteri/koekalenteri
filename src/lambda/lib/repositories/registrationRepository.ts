import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb'
import type { JsonRegistration } from '../../../types'
import type { RegistrationStatsInput } from '../../../types/Stats'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { logger } from '../log'

// Partial: the reads the stats code needs and the payment path's writes (KOE-1408). KOE-1409 moves
// the rest of the table here.
const dynamoDB = new CustomDynamoClient(CONFIG.registrationTable)

const REGISTRATION_STATS_PROJECTION_NAMES = {
  '#class': 'class',
  '#group': 'group',
  '#handler': 'handler',
  '#key': 'key',
  '#owner': 'owner',
}
const REGISTRATION_STATS_PROJECTION =
  'eventId, id, cancelled, paidAmount, refundAmount, eventType, dog.regNo, dog.breedCode, #handler.email, #handler.membership, #owner.membership, owners, ownerHandles, #class, #group.#key'

/** Every registration, with only the fields the stats rebuild counts from. */
export const readRegistrationsForStats = async (): Promise<RegistrationStatsInput[]> =>
  (await dynamoDB.readAll<RegistrationStatsInput>({
    names: REGISTRATION_STATS_PROJECTION_NAMES,
    projection: REGISTRATION_STATS_PROJECTION,
  })) ?? []

/** The registration as last written, or undefined when there is none. */
export const readRegistrationConsistently = async (eventId: string, id: string) =>
  dynamoDB.read<JsonRegistration>({ eventId, id }, undefined, true)

type TransactionItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number]
type RegistrationUpdate = Omit<NonNullable<TransactionItem['Update']>, 'Key' | 'TableName'>

/**
 * One registration's update as an item of a transaction: the registration's key and table are
 * named only here, also for the transactions another table's repository writes
 * (`transactionRepository`).
 */
export const registrationUpdateItem = (eventId: string, id: string, update: RegistrationUpdate): TransactionItem => ({
  Update: { ...update, Key: { eventId, id }, TableName: CONFIG.registrationTable },
})

const isErrorNamed = (error: unknown, name: string) =>
  typeof error === 'object' && error !== null && 'name' in error && error.name === name

type CreationType = 'payment' | 'refund'

const creationFields = (type: CreationType) => ({
  at: `${type}CreationAt`,
  stamp: `${type}CreationStamp`,
})

/**
 * Marks a payment or refund as being created for the registration, unless another creation that is
 * not yet stale holds the mark: false then. The creation's own transaction, or the release, removes
 * the mark.
 */
export const claimTransactionCreation = async (
  type: CreationType,
  eventId: string,
  registrationId: string,
  stamp: string,
  staleAgeMs: number
) => {
  const fields = creationFields(type)
  const creationAt = new Date().toISOString()
  const creationAtValue = `:${fields.at}`

  try {
    await dynamoDB.documentTransaction([
      registrationUpdateItem(eventId, registrationId, {
        ConditionExpression: `attribute_not_exists(${fields.at}) OR ${fields.at} < :staleBefore`,
        ExpressionAttributeValues: {
          [creationAtValue]: creationAt,
          ':staleBefore': new Date(Date.now() - staleAgeMs).toISOString(),
          ':stamp': stamp,
        },
        UpdateExpression: `SET ${fields.at} = ${creationAtValue}, ${fields.stamp} = :stamp`,
      }),
    ])
    return true
  } catch (error) {
    if (isErrorNamed(error, 'TransactionCanceledException')) return false
    throw error
  }
}

/** Removes this creation's mark, if it still holds it. Never rejects: a failure is logged. */
export const releaseTransactionCreation = async (
  type: CreationType,
  eventId: string,
  registrationId: string,
  stamp: string
) => {
  const fields = creationFields(type)

  try {
    await dynamoDB.documentTransaction([
      registrationUpdateItem(eventId, registrationId, {
        ConditionExpression: `${fields.stamp} = :stamp`,
        ExpressionAttributeValues: { ':stamp': stamp },
        UpdateExpression: `REMOVE ${fields.at}, ${fields.stamp}`,
      }),
    ])
  } catch (error) {
    logger.error('failed to release creation claim', { error, registrationId, type })
  }
}

/** The registration field a payment's or a refund's open transaction ids are kept in. */
export type OpenSetField = 'openPayments' | 'openRefunds'

/**
 * Takes the transaction id out of the registration's open set and bumps `updatedAt`,
 * unconditionally. Answers the set as it was before the write.
 */
export const dropOpenTransactionId = async (
  eventId: string,
  id: string,
  field: OpenSetField,
  transactionId: string,
  updatedAt: string
): Promise<string[] | undefined> => {
  const result = await dynamoDB.update(
    { eventId, id },
    { delete: { [field]: new Set([transactionId]) }, set: { updatedAt } },
    undefined,
    'UPDATED_OLD'
  )
  return result.Attributes?.[field]
}

/** Marks the registration's payment a duplicate and takes the transaction id out of its open payments. */
export const markDuplicatePayment = async (
  eventId: string,
  id: string,
  transactionId: string,
  duplicatePaymentAt: string
) => {
  await dynamoDB.update(
    { eventId, id },
    {
      delete: { openPayments: new Set([transactionId]) },
      set: { paymentStatus: 'DUPLICATE', updatedAt: duplicatePaymentAt },
    }
  )
}
