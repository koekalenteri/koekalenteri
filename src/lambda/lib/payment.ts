import type {
  DogEvent,
  JsonDogEvent,
  JsonPaymentTransaction,
  JsonRefundTransaction,
  JsonTransaction,
  Language,
} from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'
import type { PaytrailError } from './paytrail'
import { timingSafeEqual } from 'node:crypto'
import { i18n } from '../../i18n/lambda'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { audit, registrationAuditKey } from './audit'
import { getEvent } from './event'
import { LambdaError } from './lambda'
import { calculateHmac, getPayment, HMAC_KEY_PREFIX, parsePaytrailErrorMessage } from './paytrail'
import { getRegistration } from './registration'
import { getPaytrailConfig } from './secrets'
import { publishParticipantRegistrationPatch, publishRegistrationPatches } from './ws/actions'

const { registrationTable, transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)

type CreationType = 'payment' | 'refund'
type RegistrationStatusField = 'paymentStatus' | 'refundStatus'
type TransactionClient = Pick<CustomDynamoClient, 'documentTransaction'>

const creationFields = (type: CreationType) => ({
  at: `${type}CreationAt`,
  stamp: `${type}CreationStamp`,
})

export const claimTransactionCreation = async (
  client: TransactionClient,
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
    await client.documentTransaction([
      {
        Update: {
          ConditionExpression: `attribute_not_exists(${fields.at}) OR ${fields.at} < :staleBefore`,
          ExpressionAttributeValues: {
            [creationAtValue]: creationAt,
            ':staleBefore': new Date(Date.now() - staleAgeMs).toISOString(),
            ':stamp': stamp,
          },
          Key: { eventId, id: registrationId },
          TableName: registrationTable,
          UpdateExpression: `SET ${fields.at} = ${creationAtValue}, ${fields.stamp} = :stamp`,
        },
      },
    ])
    return true
  } catch (error) {
    if ((error as Error).name === 'TransactionCanceledException') return false
    throw error
  }
}

export const releaseTransactionCreation = async (
  client: TransactionClient,
  type: CreationType,
  eventId: string,
  registrationId: string,
  stamp: string
) => {
  const fields = creationFields(type)

  try {
    await client.documentTransaction([
      {
        Update: {
          ConditionExpression: `${fields.stamp} = :stamp`,
          ExpressionAttributeValues: { ':stamp': stamp },
          Key: { eventId, id: registrationId },
          TableName: registrationTable,
          UpdateExpression: `REMOVE ${fields.at}, ${fields.stamp}`,
        },
      },
    ])
  } catch (error) {
    console.error(`Failed to release ${type} creation claim`, error)
  }
}

export const formatPaytrailErrorMessage = (operation: string, error: PaytrailError) =>
  `${operation} epäonnistui Paytrailissa (${error.status}): ${parsePaytrailErrorMessage(error.error)}`

interface CancelTransactionOptions<T extends JsonTransaction> {
  auditMessage: (transaction: T, provider: string | undefined) => string
  auditUser: (transaction: T) => string
  params: Partial<PaytrailCallbackParams>
  statusField: RegistrationStatusField
  updateProvider?: boolean
}

export const cancelTransaction = async <T extends JsonTransaction>({
  auditMessage,
  auditUser,
  params,
  statusField,
  updateProvider = false,
}: CancelTransactionOptions<T>) => {
  const { eventId, provider, registrationId, transactionId } = parseParams(params)

  await verifyParams(params)

  const transaction = await dynamoDB.read<T>({ transactionId })
  if (!transaction) throw new LambdaError(404, `Transaction with id '${transactionId}' was not found`)

  const registration = await getRegistration(eventId, registrationId)
  const updated = await updateTransactionStatus(transaction, 'fail', updateProvider ? provider : undefined)

  if (!updated) {
    console.log(`Transaction '${transactionId}' already marked as failed`)
    return
  }

  if (registration[statusField] === 'PENDING') {
    const updatedAt = new Date().toISOString()
    await dynamoDB.update(
      { eventId, id: registrationId },
      { set: { [statusField]: 'CANCEL', updatedAt } },
      registrationTable
    )
    const confirmedEvent = await getEvent(eventId)
    await publishRegistrationPatches(
      eventId,
      [{ eventId, id: registrationId, [statusField]: 'CANCEL', updatedAt }],
      confirmedEvent.organizer.id
    )
    await publishParticipantRegistrationPatch(eventId, registrationId, {
      eventId,
      id: registrationId,
      [statusField]: 'CANCEL',
      updatedAt,
    })
  }

  await audit({
    auditKey: registrationAuditKey(registration),
    message: auditMessage(transaction, provider),
    user: auditUser(transaction),
  })
}

export const parseParams = (params: Partial<PaytrailCallbackParams>) => {
  const [eventId, registrationId] = params['checkout-reference']?.split(':') ?? []

  return {
    eventId,
    provider: params['checkout-provider'],
    registrationId,
    status: params['checkout-status'],
    transactionId: params['checkout-transaction-id'],
  }
}

export const verifyParams = async (params: Partial<PaytrailCallbackParams>) => {
  if (!params['checkout-transaction-id']) {
    console.error('Missing checkout-transaction-id from payment callback')
    throw new Error('Missing checkout-transaction-id from params')
  }

  const cfg = await getPaytrailConfig()
  const signature = Buffer.from(params.signature ?? '')
  const hmacParams = Object.fromEntries(Object.entries(params).filter(([key]) => key.startsWith(HMAC_KEY_PREFIX)))
  const hmac = Buffer.from(calculateHmac(cfg.PAYTRAIL_SECRET, hmacParams))

  if (hmac.length !== signature.length || !timingSafeEqual(hmac, signature)) {
    console.error('Verifying payment signature failed')
    throw new Error('Verifying payment signature failed')
  }
}

export const updateTransactionStatus = async (
  transaction: JsonTransaction | undefined,
  status: JsonTransaction['status'] | undefined,
  provider?: string
): Promise<boolean> => {
  if (!transaction || !status) return false

  // Skip update if no changes
  if (transaction.statusAt && transaction.status === status && (!provider || transaction.provider === provider)) {
    console.log('skipping no-op transaction status/provider update')
    return false
  }

  // Prepare update object with set operations
  const updateObj: { set: Record<string, any>; remove?: string[] } = {
    set: {
      status,
      statusAt: new Date().toISOString(),
    },
  }

  // Add provider if provided
  if (provider) {
    updateObj.set.provider = provider
  }

  if (status !== 'new') {
    updateObj.remove = ['paymentResponse']
  }

  await dynamoDB.update({ transactionId: transaction.transactionId }, updateObj, transactionTable)

  return true
}

const transactionWasAlreadyApplied = async (transactionId: string) => {
  const current = await dynamoDB.read<JsonTransaction>({ transactionId }, transactionTable, true)
  return Boolean(current?.registrationAppliedAt)
}

const runRegistrationTransaction = async (
  transactionId: string,
  items: Parameters<CustomDynamoClient['documentTransaction']>[0]
) => {
  try {
    await dynamoDB.documentTransaction(items)
    return true
  } catch (error) {
    if (
      (error as Error).name === 'TransactionCanceledException' &&
      (await transactionWasAlreadyApplied(transactionId))
    ) {
      console.log(`Transaction '${transactionId}' was already applied to its registration`)
      return false
    }
    throw error
  }
}

export const applySuccessfulPayment = async (
  transaction: JsonTransaction,
  eventId: string,
  registrationId: string,
  provider: string | undefined,
  confirmed: boolean,
  transactionExists = true,
  previouslyPaid = 0
) => {
  const appliedAt = new Date().toISOString()
  const transactionNames: Record<string, string> = { '#status': 'status' }
  const transactionValues: Record<string, any> = {
    ':appliedAt': appliedAt,
    ':ok': 'ok',
    ':receiptPreviouslyPaid': previouslyPaid,
    ':receiptTotalPaid': previouslyPaid + transaction.amount / 100,
  }
  const transactionSet = [
    '#status = :ok',
    'statusAt = :appliedAt',
    'registrationAppliedAt = :appliedAt',
    'receiptPreviouslyPaid = :receiptPreviouslyPaid',
    'receiptTotalPaid = :receiptTotalPaid',
  ]
  if (provider) {
    transactionSet.push('#provider = :provider')
    transactionNames['#provider'] = 'provider'
    transactionValues[':provider'] = provider
  }

  const transactionOperation = transactionExists
    ? {
        Update: {
          ConditionExpression: 'attribute_exists(transactionId) AND attribute_not_exists(registrationAppliedAt)',
          ExpressionAttributeNames: transactionNames,
          ExpressionAttributeValues: transactionValues,
          Key: { transactionId: transaction.transactionId },
          TableName: transactionTable,
          UpdateExpression: `SET ${transactionSet.join(', ')} REMOVE paymentResponse`,
        },
      }
    : {
        Put: {
          ConditionExpression: 'attribute_not_exists(transactionId)',
          Item: {
            ...transaction,
            paymentResponse: undefined,
            provider,
            receiptPreviouslyPaid: previouslyPaid,
            receiptTotalPaid: previouslyPaid + transaction.amount / 100,
            registrationAppliedAt: appliedAt,
            status: 'ok',
            statusAt: appliedAt,
          },
          TableName: transactionTable,
        },
      }

  const registrationValues: Record<string, unknown> = {
    ':amount': transaction.amount / 100,
    ':appliedAt': appliedAt,
    ':paymentStatus': 'SUCCESS',
    ':ready': 'ready',
  }
  const registrationSet = [
    'paidAt = :appliedAt',
    'paymentStatus = :paymentStatus',
    '#state = :ready',
    'updatedAt = :appliedAt',
  ]
  if (confirmed) {
    registrationSet.unshift('confirmed = :confirmed')
    registrationValues[':confirmed'] = true
  }

  const applied = await runRegistrationTransaction(transaction.transactionId, [
    transactionOperation,
    {
      Update: {
        ConditionExpression: 'attribute_exists(id)',
        ExpressionAttributeNames: { '#state': 'state' },
        ExpressionAttributeValues: registrationValues,
        Key: { eventId, id: registrationId },
        TableName: registrationTable,
        UpdateExpression: `SET ${registrationSet.join(', ')} REMOVE paymentCreationAt, paymentCreationStamp ADD paidAmount :amount`,
      },
    },
  ])

  return { applied, appliedAt }
}

export const applySuccessfulRefund = async (
  transaction: JsonRefundTransaction,
  eventId: string,
  registrationId: string,
  transactionExists = true
) => {
  const appliedAt = new Date().toISOString()
  const transactionOperation = transactionExists
    ? {
        Update: {
          ConditionExpression: 'attribute_exists(transactionId) AND attribute_not_exists(registrationAppliedAt)',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':appliedAt': appliedAt, ':ok': 'ok' },
          Key: { transactionId: transaction.transactionId },
          TableName: transactionTable,
          UpdateExpression:
            'SET #status = :ok, statusAt = :appliedAt, registrationAppliedAt = :appliedAt REMOVE paymentResponse',
        },
      }
    : {
        Put: {
          ConditionExpression: 'attribute_not_exists(transactionId)',
          Item: { ...transaction, registrationAppliedAt: appliedAt, status: 'ok', statusAt: appliedAt },
          TableName: transactionTable,
        },
      }
  const applied = await runRegistrationTransaction(transaction.transactionId, [
    transactionOperation,
    {
      Update: {
        ConditionExpression: 'attribute_exists(id)',
        ExpressionAttributeValues: {
          ':amount': transaction.amount / 100,
          ':appliedAt': appliedAt,
          ':handlingCost': (transaction.handlingCost ?? 0) / 100,
          ':refundStatus': 'SUCCESS',
        },
        Key: { eventId, id: registrationId },
        TableName: registrationTable,
        UpdateExpression:
          'SET refundAt = :appliedAt, refundStatus = :refundStatus, updatedAt = :appliedAt REMOVE refundCreationAt, refundCreationStamp ADD refundAmount :amount, refundHandlingCost :handlingCost',
      },
    },
  ])

  return { applied, appliedAt }
}

export const paymentDescription = (
  jsonEvent: Pick<JsonDogEvent | DogEvent, 'eventType' | 'startDate' | 'endDate' | 'name' | 'location'>,
  language: Language
) => {
  const t = i18n.getFixedT(language)
  const eventDate = t('dateFormat.datespan', {
    end: jsonEvent.endDate,
    noYear: true,
    start: jsonEvent.startDate,
  })

  return [jsonEvent.eventType, eventDate, jsonEvent.location, jsonEvent.name].filter(Boolean).join(' ')
}

export const getTransactionsByReference = async (reference: string) =>
  dynamoDB.query<JsonPaymentTransaction | JsonRefundTransaction>({
    index: 'gsiReference',
    key: '#reference = :reference',
    names: {
      '#reference': 'reference',
    },
    table: transactionTable,
    values: { ':reference': reference },
  })

const shouldRefreshTransactionStatus = (transaction: JsonPaymentTransaction | JsonRefundTransaction) =>
  transaction.type === 'refund'
    ? transaction.status !== 'ok'
    : ['new', 'pending', 'delayed'].includes(transaction.status)

export const refreshTransactionStatusesFromPaytrail = async (
  transactions: (JsonPaymentTransaction | JsonRefundTransaction)[] | undefined
) => {
  if (!transactions?.length) return transactions

  return Promise.all(
    transactions.map(async (transaction) => {
      if (!shouldRefreshTransactionStatus(transaction)) return transaction

      const payment = await getPayment(transaction.transactionId)
      if (!payment) return transaction

      const updated = await updateTransactionStatus(transaction, payment.status, payment.provider)

      return {
        ...transaction,
        provider: payment.provider,
        status: payment.status,
        statusAt: updated ? new Date().toISOString() : transaction.statusAt,
      }
    })
  )
}
