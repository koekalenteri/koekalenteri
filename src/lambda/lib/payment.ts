import type { DogEvent, JsonDogEvent, JsonTransaction, Language } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'

import { i18n } from '../../i18n/lambda'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

import { calculateHmac, HMAC_KEY_PREFIX } from './paytrail'
import { getPaytrailConfig } from './secrets'

const { transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)

export const parseParams = (headers: Partial<PaytrailCallbackParams>) => {
  const [eventId, registrationId] = headers['checkout-reference']?.split(':') ?? []

  return { eventId, registrationId, transactionId: headers['checkout-transaction-id'] }
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
    console.error('Verifying payment signature failed', { hmac, signature, params })
    throw new Error('Verifying payment signature failed')
  }
}

export const updateTransactionStatus = async (transactionId: string | undefined, status: JsonTransaction['status']) => {
  if (!transactionId) return

  dynamoDB.update(
    { transactionId },
    'set #status = :status, #statusAt = :statusAt',
    {
      '#status': 'status',
      '#statusAt': 'statusAt',
    },
    {
      ':status': status,
      ':statusAt': new Date().toISOString(),
    },
    transactionTable
  )
}

export const paymentDescription = (
  jsonEvent: Pick<JsonDogEvent | DogEvent, 'eventType' | 'startDate' | 'endDate' | 'name' | 'location'>,
  language: Language
) => {
  const t = i18n.getFixedT(language)
  const eventDate = t('dateFormat.datespan', {
    start: jsonEvent.startDate,
    end: jsonEvent.endDate,
    noYear: true,
  })

  return [jsonEvent.eventType, eventDate, jsonEvent.location, jsonEvent.name].filter(Boolean).join(' ')
}
