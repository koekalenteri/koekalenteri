import type {
  CreatePaymentResponse,
  GetPaymentResponse,
  PaymentItem,
  RefundItem,
  RefundPaymentResponse,
} from '../../types'
import type {
  CallbackUrl,
  CreatePaymentRequest,
  PaymentCustomer,
  PaytrailCallbackParams,
  PaytrailConfig,
  PaytrailHeaders,
  RefundRequest,
} from '../types/paytrail'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { nanoid } from 'nanoid'
import { currentFinnishTime } from '../../i18n/dates'
import { keysOf } from '../../lib/typeGuards'
import { logger } from './log'
import { getPaytrailConfig } from './secrets'

const PAYTRAIL_API_ENDPOINT = 'https://services.paytrail.com'

const HMAC_KEY_PREFIX = 'checkout-'

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
export const calculateHmac = (
  // Request headers on the way out, callback parameters on the way in: both are checkout- key/value
  // pairs, and Paytrail signs them the same way.
  secret: string,
  params: Record<string, string | undefined>,
  body?: object | undefined
): string => {
  const hmacPayload = keysOf(params)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => [key, params[key]].join(':'))
    .concat(body ? JSON.stringify(body) : '')
    .join('\n')

  return createHmac('sha256', secret).update(hmacPayload).digest('hex')
}

export class PaytrailError extends Error {
  status: number
  error: string | undefined

  constructor(status: number, error: string | undefined) {
    const message = `${status} ${error}`
    super(message)
    this.status = status
    this.error = error
  }
}

export const parsePaytrailErrorMessage = (error?: string) => {
  if (!error) return 'Tuntematon virhe'

  try {
    const details = JSON.parse(error) as { message?: unknown }
    return typeof details.message === 'string' ? details.message : error
  } catch {
    return error
  }
}

const createCallbackUrls = (baseUrl: string): CallbackUrl => ({
  cancel: `${baseUrl}/cancel`,
  success: `${baseUrl}/success`,
})

export const createPaymentRedirectUrls = (origin: string, editToken?: string): CallbackUrl => {
  const redirectUrls = createCallbackUrls(`${origin}/p`)
  if (!editToken) return redirectUrls

  const token = encodeURIComponent(editToken)
  return {
    cancel: `${redirectUrls.cancel}?editToken=${token}`,
    success: `${redirectUrls.success}?editToken=${token}`,
  }
}

export const createPaymentCallbackUrls = (host: string): CallbackUrl => createCallbackUrls(`https://${host}/payment`)

export const createRefundCallbackUrls = (host: string): CallbackUrl => createCallbackUrls(`https://${host}/refund`)

type CreatePaymentParams = {
  apiHost: string
  origin: string
  amount: number
  reference: string
  stamp: string
  items: PaymentItem[]
  customer: PaymentCustomer
  editToken?: string
  language: 'FI' | 'EN' | 'SV'
}

interface PaytrailClientOptions {
  /** ISO 8601 timestamp for `checkout-timestamp`. */
  now?: () => string
  /** Unique value for `checkout-nonce`. */
  nonce?: () => string
}

/**
 * Paytrail's Checkout API.
 *
 * Everything it needs from the outside is handed to the constructor -- the credentials, the clock
 * and the nonce source -- so nothing in here reaches for application state. That is what makes it
 * separable, and it is the point of the shape: KOE-1337.
 */
export class PaytrailClient {
  private config?: PaytrailConfig
  private readonly loadConfig: () => Promise<PaytrailConfig>
  private readonly now: () => string
  private readonly nonce: () => string

  constructor(loadConfig: () => Promise<PaytrailConfig>, { now, nonce }: PaytrailClientOptions = {}) {
    this.loadConfig = loadConfig
    this.now = now ?? (() => new Date().toISOString())
    this.nonce = nonce ?? randomUUID
  }

  private async getConfig(): Promise<PaytrailConfig> {
    this.config ??= await this.loadConfig()

    return this.config
  }

  private async request<T extends object>(
    method: 'GET' | 'POST',
    path: string,
    body: object | undefined,
    transactionId?: string
  ) {
    /**
     * All API calls need to be signed using HMAC and SHA-256 or SHA-512.
     * When a request contains a body, the body must be valid JSON and a
     * content-type header with the value application/json; charset=utf-8 must be included.
     */
    const cfg = await this.getConfig()

    const paytrailHeaders: PaytrailHeaders = {
      'checkout-account': cfg.PAYTRAIL_MERCHANT_ID,
      'checkout-algorithm': 'sha256',
      'checkout-method': method,
      'checkout-nonce': this.nonce(),
      'checkout-timestamp': this.now(),
    }

    if (transactionId) {
      paytrailHeaders['checkout-transaction-id'] = transactionId
    }

    const headers = {
      'content-type': 'application/json; charset=utf-8',
      ...paytrailHeaders,
      'platform-name': 'koekalenteri.snj.fi',
      signature: calculateHmac(cfg.PAYTRAIL_SECRET, paytrailHeaders, body),
    }

    logger.info('Paytrail request', {
      method,
      path: transactionId ? path.replace(transactionId, ':transactionId') : path,
    })

    let json: T | undefined
    let status = 500
    let error: string | undefined
    try {
      const res = await fetch(`${PAYTRAIL_API_ENDPOINT}/${path}`, {
        body: JSON.stringify(body),
        headers,
        method,
      })
      status = res.status
      try {
        if (res.ok) {
          json = (await res.json()) as T
        }
        if (!json) {
          error = await res.text()
          logger.error('Paytrail request was not ok', { error, method, status })
        }
      } catch (error_) {
        logger.error('Paytrail response could not be read', { error: error_, method, status })
        if (error_ instanceof Error) error = error_.message
      }
    } catch (e: unknown) {
      logger.error('Paytrail request failed', { error: e, method })
      if (e instanceof Error) error = e.message
    }

    if (status >= 400) {
      throw new PaytrailError(status, error)
    }

    return json
  }

  async createPayment({
    apiHost,
    origin,
    amount,
    reference,
    stamp,
    items,
    customer,
    editToken,
    language,
  }: CreatePaymentParams): Promise<CreatePaymentResponse | undefined> {
    const body: CreatePaymentRequest = {
      amount,
      callbackUrls: createPaymentCallbackUrls(apiHost),
      currency: 'EUR',
      customer,
      items,
      language,
      redirectUrls: createPaymentRedirectUrls(origin, editToken),
      reference,
      stamp,
    }

    return this.request<CreatePaymentResponse>('POST', 'payments', body)
  }

  async getPayment(transactionId: string): Promise<GetPaymentResponse | undefined> {
    return this.request('GET', `payments/${transactionId}`, undefined, transactionId)
  }

  async refundPayment(
    apiHost: string,
    transactionId: string,
    refundReference: string,
    refundStamp: string,
    items: RefundItem[] | undefined,
    amount: number | undefined,
    email: PaymentCustomer['email'] | undefined = ''
  ) {
    const body: RefundRequest = {
      amount,
      callbackUrls: createRefundCallbackUrls(apiHost),
      email,
      items,
      refundReference,
      refundStamp,
    }

    return this.request<RefundPaymentResponse>('POST', `payments/${transactionId}/refund`, body, transactionId)
  }

  /**
   * Whether the `signature` on a redirect or callback really came from Paytrail. The comparison is
   * length-checked first because timingSafeEqual throws on differing lengths.
   */
  async verifyCallbackSignature(params: Partial<PaytrailCallbackParams>): Promise<boolean> {
    const cfg = await this.getConfig()
    const signature = Buffer.from(params.signature ?? '')
    const signedParams = Object.fromEntries(Object.entries(params).filter(([key]) => key.startsWith(HMAC_KEY_PREFIX)))
    const hmac = Buffer.from(calculateHmac(cfg.PAYTRAIL_SECRET, signedParams))

    return hmac.length === signature.length && timingSafeEqual(hmac, signature)
  }
}

/**
 * The application's client. The class above is what would move into a package of its own; this line
 * is the wiring that stays behind -- the secret, and the timestamp and nonce formats this merchant
 * has always sent.
 */
export const paytrail = new PaytrailClient(getPaytrailConfig, { nonce: nanoid, now: currentFinnishTime })
