import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb'
import type { JsonEmailDeliveryStatus, JsonRegistration } from '../../../types'
import type { RegistrationStatsInput } from '../../../types/Stats'
import type { UpdateActions, UpdateCondition } from '../../utils/CustomDynamoClient'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { isConditionalCheckFailure, isTransactionCanceled } from '../api-gw'
import { foldedFrom } from '../conditionalWrite'
import { createDynamoLease } from '../lease'
import { logger } from '../log'

// Every read and write of the registration table, and the registration's key, are here (KOE-1409).
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

/**
 * The registration, or undefined when there is none. `consistent` asks for the row as last written:
 * the convention every writer that just changed the row and must publish its current state uses,
 * rather than publish from a possibly stale, eventually consistent copy (KOE-1529).
 */
export const readRegistration = async (eventId: string, id: string, consistent = false) =>
  dynamoDB.read<JsonRegistration>({ eventId, id }, consistent)

/** Every registration of the event, whatever its state. */
export const readEventRegistrations = async (eventId: string, consistent = false): Promise<JsonRegistration[]> =>
  (await dynamoDB.query<JsonRegistration>({
    ...(consistent ? { consistent: true } : {}),
    key: 'eventId = :eventId',
    values: { ':eventId': eventId },
  })) ?? []

/** Stores the whole registration, replacing the row. */
export const writeRegistration = async (registration: JsonRegistration) => {
  await dynamoDB.write(registration)
}

/** Puts the registrations in batches, retrying what DynamoDB leaves unprocessed. */
export const writeRegistrations = async (registrations: JsonRegistration[]) => dynamoDB.batchWrite(registrations)

/**
 * The event id of every registration row, deleted ones included, each once: what a data migration
 * walks the table by, an event's rows at a time, so the whole table is never held in memory at once.
 */
export const readRegistrationEventIds = async (): Promise<string[]> => {
  const keys = await dynamoDB.readAll<Pick<JsonRegistration, 'eventId'>>({
    includeDeleted: true,
    projection: 'eventId',
  })
  return [...new Set((keys ?? []).map(({ eventId }) => eventId))]
}

/**
 * Writes a migration's changes on condition that the row still exists and nobody moved it since it
 * was read with `readUpdatedAt`; without the existence check an update of a deleted row would create a
 * stub holding only the migrated fields. Throws the condition failure otherwise.
 */
export const writeMigratedRegistration = async (
  eventId: string,
  id: string,
  changes: UpdateActions,
  readUpdatedAt: string | undefined
) => {
  await dynamoDB.update(
    { eventId, id },
    changes,
    undefined,
    foldedFrom('#updatedAt', { '#updatedAt': 'updatedAt' }, readUpdatedAt)
  )
}

/** Sets and removes fields of the registration, with no condition. */
export const writeRegistrationFields = async (eventId: string, id: string, changes: UpdateActions) => {
  await dynamoDB.update({ eventId, id }, changes)
}

/** Sets one field of the registration and bumps `updatedAt`. */
export const updateRegistrationField = async <F extends keyof JsonRegistration>(
  eventId: JsonRegistration['eventId'],
  id: JsonRegistration['id'],
  field: F,
  value: JsonRegistration[F]
) => writeRegistrationFields(eventId, id, { set: { [field]: value, updatedAt: new Date().toISOString() } })

/** Remove a field outright. DynamoDB refuses `SET x = :undefined`, so clearing is its own expression. */
export const removeRegistrationField = async (
  eventId: JsonRegistration['eventId'],
  id: JsonRegistration['id'],
  field: Extract<keyof JsonRegistration, string>
) => writeRegistrationFields(eventId, id, { remove: [field], set: { updatedAt: new Date().toISOString() } })

/** Forgets how the last email to the registration was delivered, before a new one is sent. */
export const clearRegistrationEmailDeliveryStatus = async (
  eventId: JsonRegistration['eventId'],
  id: JsonRegistration['id']
) => removeRegistrationField(eventId, id, 'emailDeliveryStatus')

/**
 * Stores how SES says an email to the registration went (a bounce or a complaint), only if the
 * registration exists: an unconditional update is an upsert, and would leave a row holding nothing
 * but `emailDeliveryStatus` in this stack's table. Answers whether it was written.
 */
export const writeEmailDeliveryStatus = async (
  eventId: JsonRegistration['eventId'],
  id: JsonRegistration['id'],
  emailDeliveryStatus: JsonEmailDeliveryStatus
): Promise<boolean> => {
  try {
    await dynamoDB.update({ eventId, id }, { set: { emailDeliveryStatus } }, undefined, {
      expression: 'attribute_exists(#id)',
      names: { '#id': 'id' },
    })
    return true
  } catch (error) {
    if (isConditionalCheckFailure(error)) return false
    throw error
  }
}

/**
 * Records what sending a dog's result to Kennelliitto came to (KOE-1140). The write lands only on the
 * record it was made from: `previousAt` is the `at` of the `kcResult` that was read (none when there
 * was none), so two secretaries sending the same dog at once cannot both claim the last word. Answers
 * whether it was written.
 */
export const writeKcResult = async (
  eventId: JsonRegistration['eventId'],
  id: JsonRegistration['id'],
  kcResult: NonNullable<JsonRegistration['kcResult']>,
  previousAt: string | undefined,
  updatedAt: string
): Promise<boolean> => {
  // DynamoDB refuses a name or a value the expression does not use, so each branch declares its own.
  const condition: UpdateCondition =
    previousAt === undefined
      ? {
          expression: 'attribute_exists(#id) AND attribute_not_exists(#kcResult)',
          names: { '#id': 'id', '#kcResult': 'kcResult' },
        }
      : {
          expression: 'attribute_exists(#id) AND #kcResult.#at = :at',
          names: { '#at': 'at', '#id': 'id', '#kcResult': 'kcResult' },
          values: { ':at': previousAt },
        }
  try {
    await dynamoDB.update({ eventId, id }, { set: { kcResult, updatedAt } }, 'NONE', condition)
    return true
  } catch (error) {
    if (isConditionalCheckFailure(error)) return false
    throw error
  }
}

/**
 * Takes the registration number Kennelliitto knows the dog by (KOE-1653): `dog.regNo` alone, nothing
 * else of the dog. Moves `updatedAt`, so the incremental fetch hands the row on, and not `modifiedAt`: a
 * form open on the entry is not stale for it, and its save carries operations that leave the number as
 * written here unless the number itself was edited (KOE-1575). Answers whether the row was there.
 */
export const writeDogRegNo = async (
  eventId: JsonRegistration['eventId'],
  id: JsonRegistration['id'],
  regNo: string,
  updatedAt: string
): Promise<boolean> => {
  try {
    await dynamoDB.update({ eventId, id }, { set: { 'dog.regNo': regNo, updatedAt } }, 'NONE', {
      expression: 'attribute_exists(#id)',
      names: { '#id': 'id' },
    })
    return true
  } catch (error) {
    if (isConditionalCheckFailure(error)) return false
    throw error
  }
}

/** The steps after a new registration is stored that must each run once, however many attempts arrive. */
export type NewRegistrationPhase =
  | 'newRegistrationPublishedAt'
  | 'newRegistrationAuditAt'
  | 'newRegistrationEmailSentAt'
  | 'newRegistrationProcessedAt'

const NEW_REGISTRATION_LEASE_DURATION_MS = 90 * 1000

// Built where it is used, not at import: the lease holds no state of its own, and a lease built at
// import would count, for the policy check (lambdaTableUse), as reaching this table from every
// lambda that imports this module.
const newRegistrationLease = () =>
  createDynamoLease<JsonRegistration, NewRegistrationPhase>({
    client: dynamoDB,
    durationMs: NEW_REGISTRATION_LEASE_DURATION_MS,
    itemExistsField: 'id',
    leaseField: 'newRegistrationLease',
  })

/**
 * Leases the new registration's post-processing to this attempt. Undefined while another attempt
 * holds it; otherwise the registration as stored once leased, its phase markers included.
 */
export const claimNewRegistrationPostProcessing = async (eventId: string, id: string) => {
  const claim = await newRegistrationLease().claim({
    key: { eventId, id },
    missingItemMessage: `Registration '${id}' disappeared while claiming post-processing`,
  })
  if (!claim) return undefined

  return { registration: claim.item, release: claim.release, token: claim.token }
}

/** Marks a post-processing phase done, as long as this attempt still holds the lease. */
export const markNewRegistrationPhase = (eventId: string, id: string, token: string, phase: NewRegistrationPhase) =>
  newRegistrationLease().markPhase({ eventId, id }, token, phase)

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

/**
 * The new registration's stats marker as an item of the stats transaction
 * (`commitNewRegistrationStats` in `eventStatsRepository`): conditioned on the registration
 * existing, not being counted yet and still holding the caller's lease.
 */
export const newRegistrationStatsMarkItem = (
  eventId: string,
  id: string,
  leaseToken: string,
  statsAt: string
): TransactionItem =>
  registrationUpdateItem(eventId, id, {
    ConditionExpression: 'attribute_exists(#id) AND attribute_not_exists(#statsAt) AND #lease.#token = :leaseToken',
    ExpressionAttributeNames: {
      '#id': 'id',
      '#lease': 'newRegistrationLease',
      '#statsAt': 'newRegistrationStatsAt',
      '#token': 'token',
    },
    ExpressionAttributeValues: { ':leaseToken': leaseToken, ':statsAt': statsAt },
    UpdateExpression: 'SET #statsAt = :statsAt',
  })

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
    if (isTransactionCanceled(error)) return false
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
    'UPDATED_OLD'
  )
  return result.Attributes?.[field]
}
