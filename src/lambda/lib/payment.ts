import type {
  DogEvent,
  JsonDogEvent,
  JsonPaymentTransaction,
  JsonRefundTransaction,
  JsonTransaction,
  Language,
} from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'
import { i18n } from '../../i18n/lambda'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { calculateHmac, getPayment, HMAC_KEY_PREFIX } from './paytrail'
import { getPaytrailConfig } from './secrets'

const { registrationTable, transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)

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
    console.error('Missing checkout-transaction-id from params', { params })
    throw new Error('Missing checkout-transaction-id from params')
  }

  const cfg = await getPaytrailConfig()
  const signature = params.signature
  const hmacParams = Object.fromEntries(Object.entries(params).filter(([key]) => key.startsWith(HMAC_KEY_PREFIX)))
  const hmac = calculateHmac(cfg.PAYTRAIL_SECRET, hmacParams)

  if (hmac !== signature) {
    console.error('Verifying payment signature failed', { hmac, params, signature })
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
  transactionExists = true
) => {
  const appliedAt = new Date().toISOString()
  const transactionNames: Record<string, string> = { '#status': 'status' }
  const transactionValues: Record<string, any> = {
    ':appliedAt': appliedAt,
    ':ok': 'ok',
  }
  const transactionSet = ['#status = :ok', 'statusAt = :appliedAt', 'registrationAppliedAt = :appliedAt']
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
