import type { DogEvent, JsonDogEvent, Language } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'
import { i18n } from '../../i18n/lambda'
import { calculateHmac, HMAC_KEY_PREFIX } from './paytrail'
import { getPaytrailConfig } from './secrets'

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
