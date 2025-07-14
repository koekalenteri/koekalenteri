import type { CreatePaymentResponse, GetPaymentResponse, RefundPaymentResponse } from '../../types'
import type {
  CallbackUrl,
  CreatePaymentRequest,
  PaymentCustomer,
  PaymentItem,
  PaytrailHeaders,
  RefundItem,
  RefundRequest,
} from '../types/paytrail'

import { createHmac } from 'crypto'
import { nanoid } from 'nanoid'

import { currentFinnishTime } from '../../i18n/dates'

import { getPaytrailConfig } from './secrets'

const PAYTRAIL_API_ENDPOINT = 'https://services.paytrail.com'

export const HMAC_KEY_PREFIX = 'checkout-'

/**
 * All API responses are signed the same way, allowing merchant to verify response validity.
 * In addition, the responses contain request-id header. Saving or logging the value of this header is recommended.
 *
 * The signature is transmitted in the signature HTTP header.
 * Signature payload consists of the following fields separated with a line feed (\n).
 * Carriage returns (\r) are not supported.
 *
 * - All checkout- headers in alphabetical order. The header keys must be in lowercase. Each header key and value are separated with :
 * HTTP body in exactly the same format as it will be sent, or empty string if no body
 */
export const calculateHmac = (secret: string, params: Partial<PaytrailHeaders>, body?: object | undefined): string => {
  const hmacPayload = (Object.keys(params) as Array<keyof PaytrailHeaders>)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => [key, params[key]].join(':'))
    .concat(body ? JSON.stringify(body) : '')
    .join('\n')

  return createHmac('sha256', secret).update(hmacPayload).digest('hex')
}

class PaytrailError extends Error {
  status: number
  error: string | undefined

  constructor(status: number, error: string | undefined) {
    const message = `${status} ${error}`
    super(message)
    this.status = status
    this.error = error
  }
}

const paytrailRequest = async <T extends object>(
  method: 'GET' | 'POST',
  path: string,
  body: object | undefined,
  transactionId?: string
) => {
  /**
   * All API calls need to be signed using HMAC and SHA-256 or SHA-512.
   * When a request contains a body, the body must be valid JSON and a
   * content-type header with the value application/json; charset=utf-8 must be included.
   */
  const cfg = await getPaytrailConfig()

  const paytrailHeaders: PaytrailHeaders = {
    'checkout-account': cfg.PAYTRAIL_MERCHANT_ID,
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
  let status = 500
  let error: string | undefined
  try {
    const res = await fetch(`${PAYTRAIL_API_ENDPOINT}/${path}`, {
      method,
      headers,
      body: JSON.stringify(body),
    })
    status = res.status
    try {
      if (res.ok) {
        json = (await res.json()) as T
      }
      if (!json) {
        error = await res.text()
        console.error('not ok', status, error)
      }
    } catch (jse) {
      console.error(jse)
      if (jse instanceof Error) error = jse.message
    }
  } catch (e: unknown) {
    console.error(e)
    if (e instanceof Error) error = e.message
  }

  if (status >= 400) {
    throw new PaytrailError(status, error)
  }

  return json
}

const createCallbackUrls = (baseUrl: string): CallbackUrl => ({
  success: `${baseUrl}/success`,
  cancel: `${baseUrl}/cancel`,
})

export const createPaymentRedirectUrls = (origin: string): CallbackUrl => createCallbackUrls(`${origin}/p`)

export const createPaymentCallbackUrls = (host: string): CallbackUrl => createCallbackUrls(`https://${host}/payment`)

export const createPayment = async (
  apiHost: string,
  origin: string,
  amount: number,
  reference: string,
  stamp: string,
  items: PaymentItem[],
  customer: PaymentCustomer
): Promise<CreatePaymentResponse | undefined> => {
  const redirectUrls = createPaymentRedirectUrls(origin)
  const callbackUrls = createPaymentCallbackUrls(apiHost)

  const body: CreatePaymentRequest = {
    stamp,
    reference,
    amount,
    currency: 'EUR',
    language: 'FI',
    items,
    customer,
    redirectUrls,
    callbackUrls,
  }

  return paytrailRequest<CreatePaymentResponse>('POST', 'payments', body)
}

/**
 * @lintignore
 */
export const getPayment = async (transactionId: string): Promise<GetPaymentResponse | undefined> =>
  paytrailRequest('GET', `payments/${transactionId}`, undefined, transactionId)

export const createRefundCallbackUrls = (host: string): CallbackUrl => createCallbackUrls(`https://${host}/refund`)

export const refundPayment = async (
  apiHost: string,
  transactionId: string,
  refundReference: string,
  refundStamp: string,
  items: RefundItem[] | undefined,
  amount: number | undefined,
  email: PaymentCustomer['email']
) => {
  const callbackUrls = createRefundCallbackUrls(apiHost)

  const body: RefundRequest = {
    email,
    refundStamp,
    refundReference,
    callbackUrls,
    items,
    amount,
  }

  return paytrailRequest<RefundPaymentResponse>('POST', `payments/${transactionId}/refund`, body, transactionId)
}
