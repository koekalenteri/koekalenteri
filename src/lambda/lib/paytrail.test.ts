import type { PaymentCustomer, PaytrailCallbackParams, PaytrailConfig } from '../types/paytrail'
import {
  calculateHmac,
  createPaymentCallbackUrls,
  createPaymentRedirectUrls,
  createRefundCallbackUrls,
  PaytrailClient,
  PaytrailError,
} from './paytrail'

const config: PaytrailConfig = { PAYTRAIL_MERCHANT_ID: '375917', PAYTRAIL_SECRET: 'SAIPPUAKAUPPIAS' }
const loadConfig = vi.fn(async () => config)

const originalFetch = global.fetch
global.fetch = vi.fn<typeof fetch>()
const mockFetch = vi.mocked(fetch)
/** The doubles here are partial Responses: the client reads only ok, status, json and text. */
const respondOnce = (response: Partial<Response>) => mockFetch.mockResolvedValueOnce(response as Response)

const customer: PaymentCustomer = { email: 'payer@example.com.local' }
const payment = {
  amount: 4500,
  apiHost: 'api.example.com',
  customer,
  items: [
    {
      merchant: 'submerchant-1',
      productCode: 'event-1',
      reference: 'registration-1',
      stamp: 'item-stamp-1',
      unitPrice: 4500,
      units: 1,
      vatPercentage: 0,
    },
  ],
  language: 'FI' as const,
  origin: 'https://example.com',
  reference: 'event-1:registration-1',
  stamp: 'stamp-1',
}

const requestInit = () => mockFetch.mock.calls[0][1] as RequestInit
const requestHeaders = () => requestInit().headers as Record<string, string>

describe('paytrail', () => {
  let client: PaytrailClient

  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterAll(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    client = new PaytrailClient(loadConfig, { nonce: () => 'nonce-1', now: () => '2026-09-08T10:00:00+03:00' })
  })

  it('createPaymentCallbackUrls', () => {
    expect(createPaymentCallbackUrls('some-host')).toEqual({
      cancel: 'https://some-host/payment/cancel',
      success: 'https://some-host/payment/success',
    })
  })

  it('createPaymentRedirectUrls', () => {
    expect(createPaymentRedirectUrls('https://some-origin')).toEqual({
      cancel: 'https://some-origin/p/cancel',
      success: 'https://some-origin/p/success',
    })
  })

  it('preserves the edit token in payment redirect URLs', () => {
    expect(createPaymentRedirectUrls('https://some-origin', 'edit token')).toEqual({
      cancel: 'https://some-origin/p/cancel?editToken=edit%20token',
      success: 'https://some-origin/p/success?editToken=edit%20token',
    })
  })

  it('createRefundCallbackUrls', () => {
    expect(createRefundCallbackUrls('some-host')).toEqual({
      cancel: 'https://some-host/refund/cancel',
      success: 'https://some-host/refund/success',
    })
  })

  describe('createPayment', () => {
    it('posts a signed request built from the injected config, clock and nonce', async () => {
      respondOnce({ json: async () => ({ transactionId: 'tx-1' }), ok: true, status: 201 })

      const result = await client.createPayment(payment)

      expect(result).toEqual({ transactionId: 'tx-1' })
      expect(mockFetch).toHaveBeenCalledWith('https://services.paytrail.com/payments', expect.any(Object))

      const headers = requestHeaders()
      expect(headers).toMatchObject({
        'checkout-account': '375917',
        'checkout-algorithm': 'sha256',
        'checkout-method': 'POST',
        'checkout-nonce': 'nonce-1',
        'checkout-timestamp': '2026-09-08T10:00:00+03:00',
        'content-type': 'application/json; charset=utf-8',
        'platform-name': 'koekalenteri.snj.fi',
      })
      expect(requestInit().method).toBe('POST')
    })

    it('signs the checkout headers and the exact body it sends', async () => {
      respondOnce({ json: async () => ({}), ok: true, status: 201 })

      await client.createPayment(payment)

      const headers = requestHeaders()
      const signed = Object.fromEntries(Object.entries(headers).filter(([key]) => key.startsWith('checkout-')))
      const body = JSON.parse(requestInit().body as string)

      expect(headers.signature).toBe(calculateHmac(config.PAYTRAIL_SECRET, signed, body))
    })

    it('sends the callback and redirect urls for the given host and origin', async () => {
      respondOnce({ json: async () => ({}), ok: true, status: 201 })

      await client.createPayment({ ...payment, editToken: 'edit token' })

      expect(JSON.parse(requestInit().body as string)).toMatchObject({
        amount: 4500,
        callbackUrls: {
          cancel: 'https://api.example.com/payment/cancel',
          success: 'https://api.example.com/payment/success',
        },
        currency: 'EUR',
        redirectUrls: {
          cancel: 'https://example.com/p/cancel?editToken=edit%20token',
          success: 'https://example.com/p/success?editToken=edit%20token',
        },
      })
    })

    it('loads the config once and reuses it', async () => {
      respondOnce({ json: async () => ({}), ok: true, status: 201 })
      respondOnce({ json: async () => ({}), ok: true, status: 201 })

      await client.createPayment(payment)
      await client.createPayment(payment)

      expect(loadConfig).toHaveBeenCalledTimes(1)
    })
  })

  describe('getPayment', () => {
    it('sends the transaction id in the path and in the signed headers', async () => {
      respondOnce({ json: async () => ({ status: 'ok' }), ok: true, status: 200 })

      const result = await client.getPayment('tx-1')

      expect(result).toEqual({ status: 'ok' })
      expect(mockFetch).toHaveBeenCalledWith('https://services.paytrail.com/payments/tx-1', expect.any(Object))
      expect(requestHeaders()['checkout-transaction-id']).toBe('tx-1')
      expect(requestInit().method).toBe('GET')
    })
  })

  describe('refundPayment', () => {
    it('posts the refund to the transaction and signs it', async () => {
      respondOnce({ json: async () => ({ status: 'ok' }), ok: true, status: 201 })

      await client.refundPayment('api.example.com', 'tx-1', 'ref-1', 'stamp-2', undefined, 4500, 'payer@example.com')

      expect(mockFetch).toHaveBeenCalledWith('https://services.paytrail.com/payments/tx-1/refund', expect.any(Object))
      expect(JSON.parse(requestInit().body as string)).toEqual({
        amount: 4500,
        callbackUrls: {
          cancel: 'https://api.example.com/refund/cancel',
          success: 'https://api.example.com/refund/success',
        },
        email: 'payer@example.com',
        refundReference: 'ref-1',
        refundStamp: 'stamp-2',
      })
    })
  })

  describe('errors', () => {
    it('throws PaytrailError with the status and the body Paytrail sent', async () => {
      respondOnce({ ok: false, status: 400, text: async () => '{"message":"Invalid stamp"}' })

      const error = await client.createPayment(payment).catch((thrown: unknown) => thrown)

      expect(error).toBeInstanceOf(PaytrailError)
      expect(error).toMatchObject({ error: '{"message":"Invalid stamp"}', status: 400 })
    })

    it('throws PaytrailError 500 when the request never got through', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(client.createPayment(payment)).rejects.toMatchObject({ error: 'Network error', status: 500 })
    })

    // A 200 whose body will not parse is reported as "no payment" rather than as a failure: the
    // callers that ask Paytrail for a status treat a missing answer as "nothing to update", and a
    // throw there would fail a whole refresh sweep over one bad response.
    it('returns nothing when a successful response body cannot be read', async () => {
      respondOnce({
        json: async () => {
          throw new Error('Unexpected token')
        },
        ok: true,
        status: 200,
        text: async () => '',
      })

      await expect(client.getPayment('tx-1')).resolves.toBeUndefined()
    })
  })

  describe('verifyCallbackSignature', () => {
    const params: Partial<PaytrailCallbackParams> = {
      'checkout-account': '375917',
      'checkout-algorithm': 'sha256',
      'checkout-amount': '4500',
      'checkout-stamp': 'stamp-1',
      'checkout-status': 'ok',
      'checkout-transaction-id': 'tx-1',
    }

    it('accepts a signature Paytrail could have produced', async () => {
      const signature = calculateHmac(config.PAYTRAIL_SECRET, params)

      await expect(client.verifyCallbackSignature({ ...params, signature })).resolves.toBe(true)
    })

    it('rejects a signature over different params', async () => {
      const signature = calculateHmac(config.PAYTRAIL_SECRET, { ...params, 'checkout-amount': '1' })

      await expect(client.verifyCallbackSignature({ ...params, signature })).resolves.toBe(false)
    })

    it('rejects a signature of the wrong length instead of throwing', async () => {
      await expect(client.verifyCallbackSignature({ ...params, signature: 'short' })).resolves.toBe(false)
    })
  })
})
