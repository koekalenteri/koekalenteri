import type { AuditMessage } from '../../lib/audit'
import { vi } from 'vitest'
import { httpError } from '../lib/lambda'
import { answerRejections, constructPartialAPIGwEvent } from '../test-utils/helpers'

const setEventBody = (event: { body: string | null }, body: unknown) => {
  event.body = JSON.stringify(body)
}

const mockLambda = vi.fn((_name, fn) => answerRejections(fn, mockResponse))
const mockResponse = vi.fn()
const mockAuthorizeWithMemberOf = vi.fn()
const mockGetApiHost = vi.fn()
const mockRefundPayment = vi.fn()
const mockGetEvent = vi.fn()
const mockGetRegistration = vi.fn()
const mockAudit = vi.fn()
const mockRegistrationAuditKey = vi.fn()
const mockRead = vi.fn()
const mockReadTransactionsByReference = vi.fn()
const mockCreatePendingRefundTransaction = vi.fn()
const mockCreateSettledRefundTransaction = vi.fn()
const mockNanoid = vi.fn()
const mockClaimTransactionCreation = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true))
const mockReleaseTransactionCreation = vi.fn<() => Promise<void>>(() => Promise.resolve())

class MockPaytrailError extends Error {
  status: number
  error: string | undefined

  constructor(status: number, error: string | undefined) {
    super(`${status} ${error}`)
    this.status = status
    this.error = error
  }
}

// Tested with real Paytrail errors in lib/payment.test.ts; here the handler only has to write what it returns.
const mockRefundPaytrailErrorAudit = vi.fn<(error: MockPaytrailError) => AuditMessage>()

vi.doMock('../lib/lambda', async () => ({
  ...(await vi.importActual<typeof import('../lib/lambda')>('../lib/lambda')),
  LambdaError: class LambdaError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))

vi.doMock('../utils/proxyEvent', () => ({
  getApiHost: mockGetApiHost,
}))

vi.doMock('../lib/paytrail', () => ({
  PaytrailError: MockPaytrailError,
  paytrail: { refundPayment: mockRefundPayment },
}))

vi.doMock('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

vi.doMock('../lib/registration', () => ({
  getRegistration: mockGetRegistration,
}))

vi.doMock('../lib/audit', () => ({
  audit: mockAudit,
  registrationAuditKey: mockRegistrationAuditKey,
}))

// The organizer read answers from the same read mock as the transaction read, told apart by the table.
vi.doMock('../lib/repositories/organizerRepository', () => ({
  readOrganizer: async (id: string) => mockRead({ id }, 'organizer'),
}))

vi.doMock('../lib/repositories/registrationRepository', () => ({
  claimTransactionCreation: mockClaimTransactionCreation,
  releaseTransactionCreation: mockReleaseTransactionCreation,
}))

vi.doMock('../lib/repositories/transactionRepository', () => ({
  createPendingRefundTransaction: mockCreatePendingRefundTransaction,
  createSettledRefundTransaction: mockCreateSettledRefundTransaction,
  readTransaction: async (transactionId: string) => mockRead({ transactionId }),
  readTransactionsByReference: mockReadTransactionsByReference,
}))

vi.doMock('nanoid', () => ({
  nanoid: mockNanoid,
}))

vi.doMock('../lib/payment', () => ({
  refundPaytrailErrorAudit: mockRefundPaytrailErrorAudit,
}))

const { default: refundCreateLambda } = await import('./handler')

describe('refundCreateLambda', () => {
  const event = constructPartialAPIGwEvent({
    body: JSON.stringify({
      amount: 1000,
      handlingCost: 500,
      transactionId: 'transaction123',
    }),
    headers: {},
  })

  const mockPaymentTransaction = {
    amount: 2000,
    items: [
      {
        stamp: 'item123',
      },
    ],
    reference: 'event123:reg456',
    status: 'ok',
    transactionId: 'transaction123',
    type: 'payment',
  }

  const mockConfirmedEvent = {
    id: 'event123',
    organizer: {
      id: 'org123',
    },
  }

  const mockRegistration = {
    eventId: 'event123',
    id: 'reg456',
    payer: {
      email: 'payer@example.com',
    },
  }

  const mockOrganizer = {
    id: 'org123',
    paytrailMerchantId: 'merchant123',
  }

  const mockRefundResult = {
    provider: 'paytrail',
    status: 'ok',
    transactionId: 'refund123',
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementations
    mockAuthorizeWithMemberOf.mockResolvedValue({
      memberOf: ['org123'],
      user: { id: 'user123', name: 'Test User' },
    })

    setEventBody(event, {
      amount: 1000,
      handlingCost: 500,
      transactionId: 'transaction123',
    })

    mockGetApiHost.mockReturnValue('api.example.com')

    // Set up default behavior for DynamoDB read
    mockRead.mockImplementation((params: any, table: any) => {
      if (table === 'organizer' || params.id === 'org123') {
        return Promise.resolve(mockOrganizer)
      }
      if (params.transactionId === 'transaction123' || !table || table === 'transaction') {
        return Promise.resolve(mockPaymentTransaction)
      }
      return Promise.resolve(null)
    })

    mockReadTransactionsByReference.mockResolvedValue([mockPaymentTransaction])
    mockGetEvent.mockResolvedValue(mockConfirmedEvent)
    mockGetRegistration.mockResolvedValue(mockRegistration)

    mockNanoid.mockReturnValue('stamp123')

    mockRefundPayment.mockResolvedValue(mockRefundResult)

    mockRegistrationAuditKey.mockReturnValue('event123:reg456')
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorizeWithMemberOf.mockRejectedValueOnce(httpError(401, 'Unauthorized'))

    await refundCreateLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('rejects users outside the event organizer before loading registration data or refunding', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({
      memberOf: ['another-organizer'],
      user: { admin: false, id: 'user123', name: 'Test User' },
    })

    await expect(refundCreateLambda(event)).rejects.toMatchObject({ message: 'Forbidden', status: 403 })

    expect(mockGetRegistration).not.toHaveBeenCalled()
    expect(mockRefundPayment).not.toHaveBeenCalled()
    expect(mockCreatePendingRefundTransaction).not.toHaveBeenCalled()
    expect(mockCreateSettledRefundTransaction).not.toHaveBeenCalled()
  })

  it('throws error if transaction is not found', async () => {
    mockRead.mockImplementationOnce(() => Promise.resolve(null))

    await expect(refundCreateLambda(event)).rejects.toThrow("Transaction with id 'transaction123' was not found")
    expect(mockGetEvent).not.toHaveBeenCalled()
  })

  it('throws error if organizer does not have MerchantId', async () => {
    // Reset all mocks
    vi.clearAllMocks()

    // Mock transaction read
    mockRead.mockImplementation((params: any, table: any) => {
      if (table === 'organizer' || params.id === 'org123') {
        return Promise.resolve({ id: 'org123' }) // No paytrailMerchantId
      }
      if (params.transactionId === 'transaction123' || !table || table === 'transaction') {
        return Promise.resolve(mockPaymentTransaction)
      }
      return Promise.resolve(null)
    })

    await expect(refundCreateLambda(event)).rejects.toThrow('Organizer org123 does not have MerchantId!')
    expect(mockRefundPayment).not.toHaveBeenCalled()
  })

  it('throws error if refundPayment does not return a result', async () => {
    // Reset all mocks
    vi.clearAllMocks()

    // Mock transaction read
    mockRead.mockImplementation((params: any, table: any) => {
      if (table === 'organizer' || params.id === 'org123') {
        return Promise.resolve(mockOrganizer)
      }
      if (params.transactionId === 'transaction123' || !table || table === 'transaction') {
        return Promise.resolve(mockPaymentTransaction)
      }
      return Promise.resolve(null)
    })

    mockRefundPayment.mockResolvedValueOnce(null)

    await expect(refundCreateLambda(event)).rejects.toThrow(/refundPayment did not return a result/)
    expect(mockCreatePendingRefundTransaction).not.toHaveBeenCalled()
    expect(mockCreateSettledRefundTransaction).not.toHaveBeenCalled()
  })

  it('audits a Paytrail refusal and rejects with its words', async () => {
    const paytrailMessage =
      'API refund failed and provider does not support email refunds. Provider message: Revert failed'
    const paytrailError = JSON.stringify({ message: paytrailMessage, status: 'error' })
    mockRefundPayment.mockRejectedValueOnce(new MockPaytrailError(400, paytrailError))
    mockRefundPaytrailErrorAudit.mockReturnValueOnce({
      messageKey: 'audit.messages.refundPaytrailFailed',
      messageParams: { error: paytrailMessage, status: 400 },
    })

    // Thrown as httpError and answered by the wrapper (answerRejections here) with the body as written.
    await refundCreateLambda(event)
    expect(mockResponse).toHaveBeenCalledWith(400, { error: paytrailError, provider: 'paytrail' }, event)

    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event123:reg456',
      messageKey: 'audit.messages.refundPaytrailFailed',
      messageParams: { error: paytrailMessage, status: 400 },
      user: 'Test User',
    })
    // The claim is let go and the row written before the request is refused.
    expect(mockReleaseTransactionCreation).toHaveBeenCalledTimes(1)
    expect(mockCreatePendingRefundTransaction).not.toHaveBeenCalled()
    expect(mockCreateSettledRefundTransaction).not.toHaveBeenCalled()
  })

  it('marks a Paytrail refusal without words as Paytrail, with an empty error', async () => {
    mockRefundPayment.mockRejectedValueOnce(new MockPaytrailError(502, undefined))
    mockRefundPaytrailErrorAudit.mockReturnValueOnce({
      messageKey: 'audit.messages.refundPaytrailFailed',
      messageParams: { errorKey: 'audit.unknownError', status: 502 },
    })

    await refundCreateLambda(event)
    expect(mockResponse).toHaveBeenCalledWith(502, { error: '', provider: 'paytrail' }, event)
  })

  it('creates a refund transaction with items', async () => {
    // Reset all mocks
    vi.clearAllMocks()

    // Mock transaction read
    mockRead.mockImplementation((params: any, table: any) => {
      if (table === 'organizer' || params.id === 'org123') {
        return Promise.resolve(mockOrganizer)
      }
      if (params.transactionId === 'transaction123' || !table || table === 'transaction') {
        return Promise.resolve(mockPaymentTransaction)
      }
      return Promise.resolve(null)
    })

    await refundCreateLambda(event)

    // Verify refundPayment was called with correct parameters
    expect(mockRefundPayment).toHaveBeenCalledWith(
      'api.example.com',
      'transaction123',
      'event123:reg456',
      'stamp123',
      [
        {
          amount: 1000,
          refundReference: 'reg456',
          refundStamp: 'stamp123',
          stamp: 'item123',
        },
      ],
      undefined,
      'payer@example.com'
    )

    // A settled refund: not pending, so its registration's refundStatus is written in the same
    // transaction (transactionRepository.test.ts pins the write).
    expect(mockCreateSettledRefundTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1000,
        handlingCost: 500,
        // The refund keeps the application's own line shape, naming the payment line it
        // refunds. The fixture above is a row in the old, provider-shaped form, which still
        // works because `stamp` is the field that carries over (KOE-1337).
        items: [{ amount: 1000, eventId: 'event123', registrationId: 'reg456', stamp: 'item123' }],
        status: 'ok',
        transactionId: 'refund123',
        type: 'refund',
      }),
      'event123',
      'reg456',
      expect.any(String)
    )
    expect(mockCreatePendingRefundTransaction).not.toHaveBeenCalled()

    // Verify audit was not called (since status is 'ok')
    expect(mockAudit).not.toHaveBeenCalled()

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, mockRefundResult, event)
  })

  it('rejects a concurrent refund creation before calling Paytrail', async () => {
    mockClaimTransactionCreation.mockResolvedValueOnce(false)

    await refundCreateLambda(event)

    expect(mockResponse).toHaveBeenCalledWith(409, 'Refund already in progress', event)
    expect(mockRefundPayment).not.toHaveBeenCalled()
  })

  it('creates a refund transaction without items', async () => {
    // Reset all mocks
    vi.clearAllMocks()

    // Mock a payment transaction without items
    const paymentWithoutItems = {
      amount: 2000,
      reference: 'event123:reg456',
      status: 'ok',
      transactionId: 'transaction123',
      type: 'payment',
    }
    mockReadTransactionsByReference.mockResolvedValue([paymentWithoutItems])
    mockRead.mockImplementation((params: any, table: any) => {
      if (table === 'organizer' || params.id === 'org123') {
        return Promise.resolve(mockOrganizer)
      }
      if (params.transactionId === 'transaction123' || !table || table === 'transaction') {
        return Promise.resolve(paymentWithoutItems)
      }
      return Promise.resolve(null)
    })

    await refundCreateLambda(event)

    // Verify refundPayment was called with correct parameters
    expect(mockRefundPayment).toHaveBeenCalledWith(
      'api.example.com',
      'transaction123',
      'event123:reg456',
      'stamp123',
      undefined,
      1000,
      'payer@example.com'
    )

    expect(mockCreateSettledRefundTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1000, items: undefined, transactionId: 'refund123' }),
      'event123',
      'reg456',
      expect.any(String)
    )
    expect(mockCreatePendingRefundTransaction).not.toHaveBeenCalled()
  })

  it('creates audit entry for pending refunds', async () => {
    // Reset all mocks
    vi.clearAllMocks()

    // Mock transaction read
    mockRead.mockImplementation((params: any, table: any) => {
      if (table === 'organizer' || params.id === 'org123') {
        return Promise.resolve(mockOrganizer)
      }
      if (params.transactionId === 'transaction123' || !table || table === 'transaction') {
        return Promise.resolve(mockPaymentTransaction)
      }
      return Promise.resolve(null)
    })

    mockRefundPayment.mockResolvedValueOnce({
      provider: 'paytrail',
      status: 'pending',
      transactionId: 'refund123',
    })

    await refundCreateLambda(event)

    // Verify audit was called
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event123:reg456',
      messageKey: 'audit.messages.refundPending',
      messageParams: { amount: '10,00 €', provider: 'Paytrail' },
      user: 'Test User',
    })

    // No refundStatus is written: PENDING is never written any more, and a pending refund's own
    // SUCCESS comes later, from applySuccessfulRefund, once it has actually been applied (KOE-1529).
    expect(mockCreatePendingRefundTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', transactionId: 'refund123' }),
      'event123',
      'reg456',
      expect.any(String)
    )
    expect(mockCreateSettledRefundTransaction).not.toHaveBeenCalled()
  })

  it('creates audit entry for email refunds', async () => {
    // Reset all mocks
    vi.clearAllMocks()

    // Mock transaction read
    mockRead.mockImplementation((params: any, table: any) => {
      if (table === 'organizer' || params.id === 'org123') {
        return Promise.resolve(mockOrganizer)
      }
      if (params.transactionId === 'transaction123' || !table || table === 'transaction') {
        return Promise.resolve(mockPaymentTransaction)
      }
      return Promise.resolve(null)
    })

    mockRefundPayment.mockResolvedValueOnce({
      provider: 'email refund',
      status: 'ok',
      transactionId: 'refund123',
    })

    await refundCreateLambda(event)

    // Verify audit was called
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event123:reg456',
      messageKey: 'audit.messages.refundPending',
      messageParams: { amount: '10,00 €', provider: 'Sähköposti + tilisiirto' },
      user: 'Test User',
    })

    // An email refund is pending until the customer's bank account has it.
    expect(mockCreatePendingRefundTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'email refund', transactionId: 'refund123' }),
      'event123',
      'reg456',
      expect.any(String)
    )
    expect(mockCreateSettledRefundTransaction).not.toHaveBeenCalled()
  })

  it('handles unsupported transaction with multiple items', async () => {
    // Reset all mocks
    vi.clearAllMocks()

    // Mock transaction with multiple items
    mockRead.mockImplementation((params: any, table: any) => {
      if (table === 'organizer' || params.id === 'org123') {
        return Promise.resolve(mockOrganizer)
      }
      if (params.transactionId === 'transaction123' || !table || table === 'transaction') {
        return Promise.resolve({
          items: [{ stamp: 'item1' }, { stamp: 'item2' }],
          reference: 'event123:reg456',
          transactionId: 'transaction123',
        })
      }
      return Promise.resolve(null)
    })

    await expect(refundCreateLambda(event)).rejects.toThrow('Unsupported transaction')
    expect(mockRefundPayment).not.toHaveBeenCalled()
  })

  it('creates a partial refund with complex cost structure', async () => {
    const partialRefundAmount = 500
    setEventBody(event, {
      amount: partialRefundAmount,
      handlingCost: 500,
      transactionId: 'transaction123',
    })

    await refundCreateLambda(event)

    expect(mockRefundPayment).toHaveBeenCalledWith(
      'api.example.com',
      'transaction123',
      'event123:reg456',
      'stamp123',
      [
        {
          amount: partialRefundAmount,
          refundReference: 'reg456',
          refundStamp: 'stamp123',
          stamp: 'item123',
        },
      ],
      undefined,
      'payer@example.com'
    )

    expect(mockCreateSettledRefundTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: partialRefundAmount, handlingCost: 500 }),
      'event123',
      'reg456',
      expect.any(String)
    )
    expect(mockCreatePendingRefundTransaction).not.toHaveBeenCalled()
  })

  // KOE-1614: the body is the secretary's browser's word, and the handling fee ends on the row, in the
  // mail and in the balance.
  describe('what may be refunded', () => {
    const refundRow = (status: string, amount: number, handlingCost = 0) => ({
      amount,
      handlingCost,
      reference: 'event123:reg456',
      status,
      transactionId: `refund-${status}`,
      type: 'refund',
      user: 'Test User',
    })

    const selectPayment = (payment: object, transactions: object[] = [payment]) => {
      mockRead.mockImplementation((_params: unknown, table?: string) =>
        Promise.resolve(table === 'organizer' ? mockOrganizer : payment)
      )
      mockReadTransactionsByReference.mockResolvedValue(transactions)
    }

    const expectNothingStarted = () => {
      expect(mockClaimTransactionCreation).not.toHaveBeenCalled()
      expect(mockRefundPayment).not.toHaveBeenCalled()
      expect(mockCreatePendingRefundTransaction).not.toHaveBeenCalled()
      expect(mockCreateSettledRefundTransaction).not.toHaveBeenCalled()
    }

    const expectRefused = (remaining: number) => {
      expect(mockResponse).toHaveBeenCalledWith(422, { remaining }, event)
      expectNothingStarted()
    }

    it.each([
      ['a zero amount', { amount: 0, transactionId: 'transaction123' }, 'amount'],
      ['a negative amount', { amount: -100, transactionId: 'transaction123' }, 'amount'],
      ['an amount in decimals', { amount: 10.5, transactionId: 'transaction123' }, 'amount'],
      ['an amount that came through JSON as null', { amount: null, transactionId: 'transaction123' }, 'amount'],
      [
        'a negative handling cost',
        { amount: 1000, handlingCost: -500, transactionId: 'transaction123' },
        'handlingCost',
      ],
      [
        'a handling cost in decimals',
        { amount: 1000, handlingCost: 0.5, transactionId: 'transaction123' },
        'handlingCost',
      ],
      [
        'a handling cost that came through JSON as null',
        { amount: 1000, handlingCost: null, transactionId: 'transaction123' },
        'handlingCost',
      ],
      ['an empty transaction id', { amount: 1000, transactionId: '' }, 'transactionId'],
      ['no transaction id', { amount: 1000 }, 'transactionId'],
    ])('answers 400 naming the field for %s, before reading anything', async (_case, body, field) => {
      setEventBody(event, body)

      await refundCreateLambda(event)

      expect(mockResponse).toHaveBeenCalledWith(
        400,
        expect.objectContaining({ errors: [expect.objectContaining({ field })] }),
        event
      )
      expect(mockRead).not.toHaveBeenCalled()
      expectNothingStarted()
    })

    it('reads a missing handling cost as none', async () => {
      setEventBody(event, { amount: 2000, transactionId: 'transaction123' })

      await refundCreateLambda(event)

      expect(mockCreateSettledRefundTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 2000, handlingCost: 0 }),
        'event123',
        'reg456',
        expect.any(String)
      )
    })

    it('refuses an amount over the selected payment', async () => {
      setEventBody(event, { amount: 2001, transactionId: 'transaction123' })

      await refundCreateLambda(event)

      expectRefused(2000)
    })

    it('refuses a handling cost that takes the sum over the payment', async () => {
      setEventBody(event, { amount: 1600, handlingCost: 500, transactionId: 'transaction123' })

      await refundCreateLambda(event)

      expectRefused(2000)
    })

    it('has nothing to refund when the query finds no transactions', async () => {
      mockReadTransactionsByReference.mockResolvedValue(undefined)

      await refundCreateLambda(event)

      expectRefused(0)
    })

    // The browser allows it, and it is the secretary's call: 8,00 € paid, 3,00 € back, 5,00 € kept.
    it('lets a handling cost above the refund through while the sum is within the payment', async () => {
      selectPayment({ ...mockPaymentTransaction, amount: 800 })
      setEventBody(event, { amount: 300, handlingCost: 500, transactionId: 'transaction123' })

      await refundCreateLambda(event)

      expect(mockRefundPayment).toHaveBeenCalledTimes(1)
      expect(mockResponse).toHaveBeenCalledWith(200, mockRefundResult, event)
    })

    it.each([['ok'], ['pending'], ['delayed']])(
      'counts a refund that is %s, its handling cost with it',
      async (status) => {
        selectPayment(mockPaymentTransaction, [mockPaymentTransaction, refundRow(status, 1500, 200)])
        setEventBody(event, { amount: 301, transactionId: 'transaction123' })

        await refundCreateLambda(event)

        expectRefused(300)
      }
    )

    it.each([['fail'], ['new']])('leaves out a refund that is %s', async (status) => {
      selectPayment(mockPaymentTransaction, [mockPaymentTransaction, refundRow(status, 1500, 200)])
      setEventBody(event, { amount: 2000, transactionId: 'transaction123' })

      await refundCreateLambda(event)

      expect(mockRefundPayment).toHaveBeenCalledTimes(1)
    })

    // An email refund answers `ok` while it waits for the entrant's account number, not applied yet,
    // and its money has not stopped being spoken for (KOE-1529).
    it('counts an email refund still waiting for the entrant', async () => {
      const emailRefund = { ...refundRow('ok', 1500, 200), provider: 'email refund' }
      selectPayment(mockPaymentTransaction, [mockPaymentTransaction, emailRefund])
      setEventBody(event, { amount: 301, transactionId: 'transaction123' })

      await refundCreateLambda(event)

      expectRefused(300)
    })

    // A payment charged twice has its money in the transaction alone: the row's paidAmount is empty,
    // so hasRefundableBalance would turn a lawful refund away (KOE-1693).
    it('refunds a payment charged twice, which the row records no amount for', async () => {
      mockGetRegistration.mockResolvedValue({ ...mockRegistration, paymentStatus: 'DUPLICATE' })
      selectPayment({ ...mockPaymentTransaction, duplicatePaymentAt: '2026-08-01T10:00:00.000Z' })
      setEventBody(event, { amount: 2000, transactionId: 'transaction123' })

      await refundCreateLambda(event)

      expect(mockRefundPayment).toHaveBeenCalledTimes(1)
    })

    it('caps a refund by the selected payment when the registration holds more', async () => {
      const other = { ...mockPaymentTransaction, amount: 3000, transactionId: 'other' }
      selectPayment(mockPaymentTransaction, [mockPaymentTransaction, other])
      setEventBody(event, { amount: 2001, transactionId: 'transaction123' })

      await refundCreateLambda(event)

      expectRefused(2000)
    })

    it.each([
      ['a refund', { type: 'refund' }],
      ['a payment still pending', { status: 'pending' }],
      ['a failed payment', { status: 'fail' }],
    ])('has nothing to refund from %s', async (_case, overrides) => {
      const selected = { ...mockPaymentTransaction, ...overrides }
      selectPayment(selected, [mockPaymentTransaction, selected])
      setEventBody(event, { amount: 100, transactionId: 'transaction123' })

      await refundCreateLambda(event)

      expectRefused(0)
    })
  })
})
