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
import { calculateHmac, HMAC_KEY_PREFIX } from './paytrail'
import { getPaytrailConfig } from './secrets'

const { transactionTable } = CONFIG
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
  const updateObj: { set: Record<string, any> } = {
    set: {
      status,
      statusAt: new Date().toISOString(),
    },
  }

  // Add provider if provided
  if (provider) {
    updateObj.set.provider = provider
  }

  await dynamoDB.update({ transactionId: transaction.transactionId }, updateObj, transactionTable)

  return true
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
