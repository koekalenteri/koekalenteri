import type {
  CallbackUrl,
  CreatePaymentRequest,
  CreatePaymentResponse,
  PaymentCustomer,
  PaymentItem,
} from '../types/paytrail'

import { createHmac } from 'crypto'
import { nanoid } from 'nanoid'
import fetch from 'node-fetch'

import { currentFinnishTime } from '../utils/dates'

import { getPaytrailConfig } from './secrets'

const PAYTRAIL_API_ENDPOINT = 'https://services.paytrail.com'

export const calculateHmac = (
  secret: string,
  params: Record<string, string | undefined>,
  body?: object | undefined
): string => {
  const hmacPayload = Object.keys(params)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => [key, params[key]].join(':'))
    .concat(body ? JSON.stringify(body) : '')
    .join('\n')

  return createHmac('sha256', secret).update(hmacPayload).digest('hex')
}

export const paytrailRequest = async <T extends object>(
  merchantId: string,
  method: 'GET' | 'POST',
  path: string,
  body: object | undefined,
  transactionId?: string
) => {
  const cfg = await getPaytrailConfig()

  const paytrailHeaders: Record<string, string> = {
    'checkout-account': merchantId,
    'checkout-algorithm': 'sha256',
    'checkout-method': method,
    'checkout-nonce': nanoid(),
    'checkout-timestamp': currentFinnishTime(),
  }

  if (transactionId) {
    paytrailHeaders['checkout-transaction-id'] = transactionId
  }

  const headers = {
    'content-type': 'application/json; charset=utf-8',
    ...paytrailHeaders,
    signature: calculateHmac(cfg.PAYTRAIL_SECRET, paytrailHeaders, body),
    'platform-name': 'koekalenteri.snj.fi',
  }

  console.log(headers, body)

  let json: T | undefined
  try {
    const res = await fetch(`${PAYTRAIL_API_ENDPOINT}/${path}`, {
      method,
      headers,
      body,
    })
    const status = res.status
    try {
      if (res.ok) {
        json = (await res.json()) as T
      }
      if (!json) {
        const error = await res.text()
        console.error('not ok', status, error)
      }
    } catch (jse) {
      console.error(jse)
    }
  } catch (e: unknown) {
    console.error(e)
  }
  return json
}

export const createRedirectUrls = (origin: string): CallbackUrl => ({
  success: `${origin}/p/success`,
  cancel: `${origin}/p/cancel`,
})

export const createCallbackUrls = (host: string): CallbackUrl => ({
  success: `https://${host}/payment/success`,
  cancel: `https://${host}/payment/cancel`,
})

export const createPayment = async (
  apiHost: string,
  origin: string,
  merchantId: string,
  amount: number,
  reference: string,
  items: PaymentItem[],
  customer: PaymentCustomer
): Promise<CreatePaymentResponse | undefined> => {
  const redirectUrls = createRedirectUrls(origin)
  const callbackUrls = createCallbackUrls(apiHost)

  const body: CreatePaymentRequest = {
    stamp: 'd2568f2a-e4c6-40ba-a7cd-d573382ce548',
    reference,
    amount,
    currency: 'EUR',
    language: 'FI',
    items,
    customer,
    redirectUrls,
    callbackUrls,
  }

  return paytrailRequest<CreatePaymentResponse>(merchantId, 'POST', 'payments', body)
}
