import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()
const mockGetApiHost = jest.fn<any>()
const mockRefundPayment = jest.fn<any>()
const mockGetConfirmedEvent = jest.fn<any>()
const mockAudit = jest.fn<any>()
const mockRegistrationAuditKey = jest.fn<any>()
const mockDynamoRead = jest.fn<any>()
const mockDynamoWrite = jest.fn<any>()
const mockDynamoUpdate = jest.fn<any>()
const mockDynamoClient = jest.fn(() => ({
  read: mockDynamoRead,
  update: mockDynamoUpdate,
  write: mockDynamoWrite,
}))
const mockNanoid = jest.fn<any>()
const mockFormatMoney = jest.fn<any>()
const mockGetProviderName = jest.fn<any>()
const mockApplyRefundCreate = jest.fn<any>()
const mockLoadRefundRequestData = jest.fn<any>()
const mockWriteRefundTransaction = jest.fn<any>()

jest.unstable_mockModule('../auth/api', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../lib/json', () => ({
  parseJSONWithFallback: mockParseJSONWithFallback,
}))

jest.unstable_mockModule('../utils/proxyEvent', () => ({
  getApiHost: mockGetApiHost,
}))

jest.unstable_mockModule('../lib/paytrail', () => ({
  refundPayment: mockRefundPayment,
}))

jest.unstable_mockModule('../registration/api', () => ({
  eventReadPort: {
    getConfirmedEvent: mockGetConfirmedEvent,
  },
}))

jest.unstable_mockModule('../lib/audit', () => ({
  audit: mockAudit,
  registrationAuditKey: mockRegistrationAuditKey,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: mockDynamoClient,
}))

jest.unstable_mockModule('nanoid', () => ({
  nanoid: mockNanoid,
}))

jest.unstable_mockModule('../../lib/money', () => ({
  formatMoney: mockFormatMoney,
}))

jest.unstable_mockModule('../../lib/payment', () => ({
  getProviderName: mockGetProviderName,
}))

jest.unstable_mockModule('../registration/actions', () => ({
  applyRefundCreate: mockApplyRefundCreate,
}))

jest.unstable_mockModule('../refund/actions', () => ({
  createLoadRefundRequestData: jest.fn(() => mockLoadRefundRequestData),
}))

jest.unstable_mockModule('../payment/repository', () => ({
  paymentTransactionRepository: {
    createRefund: mockWriteRefundTransaction,
    getPaymentById: jest.fn(),
  },
}))

const { refundCreateLambda } = await import('./handler')

describe('refundCreateLambda', () => {
  const event = {
    body: JSON.stringify({
      amount: 1000,
      transactionId: 'transaction123',
    }),
    headers: {},
  } as any

  const mockPaymentTransaction = {
    items: [
      {
        stamp: 'item123',
      },
    ],
    reference: 'event123:reg456',
    transactionId: 'transaction123',
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
    jest.clearAllMocks()

    // Default mock implementations
    mockAuthorize.mockResolvedValue({
      id: 'user123',
      name: 'Test User',
    })

    mockParseJSONWithFallback.mockReturnValue({
      amount: 1000,
      transactionId: 'transaction123',
    })

    mockGetApiHost.mockReturnValue('api.example.com')

    mockLoadRefundRequestData.mockResolvedValue({
      eventId: 'event123',
      paymentTransaction: mockPaymentTransaction,
      registration: mockRegistration,
      registrationId: 'reg456',
    })

    // Organizer read only (CustomDynamoClient.read in the handler)
    mockDynamoRead.mockResolvedValue(mockOrganizer)

    mockGetConfirmedEvent.mockResolvedValue(mockConfirmedEvent)

    mockNanoid.mockReturnValue('stamp123')

    mockRefundPayment.mockResolvedValue(mockRefundResult)

    mockWriteRefundTransaction.mockResolvedValue(undefined)
    mockFormatMoney.mockReturnValue('10,00 €')
    mockGetProviderName.mockReturnValue('Paytrail')
    mockRegistrationAuditKey.mockReturnValue('event123:reg456')
    mockApplyRefundCreate.mockResolvedValue(undefined)
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    const result = await refundCreateLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(result.statusCode).toBe(401)
    expect(JSON.parse(result.body)).toBe('Unauthorized')
    expect(mockLoadRefundRequestData).not.toHaveBeenCalled()
  })

  it('throws error if amount is invalid', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      amount: 0,
      transactionId: 'transaction123',
    })

    await expect(refundCreateLambda(event)).rejects.toThrow("Invalid amount: '0'")
    expect(mockLoadRefundRequestData).not.toHaveBeenCalled()
  })

  it('throws error if transaction is not found', async () => {
    mockLoadRefundRequestData.mockRejectedValueOnce(
      Object.assign(new Error("Transaction with id 'transaction123' was not found"), { status: 404 })
    )

    await expect(refundCreateLambda(event)).rejects.toThrow("Transaction with id 'transaction123' was not found")
    expect(mockGetConfirmedEvent).not.toHaveBeenCalled()
  })

  it('throws error if organizer does not have MerchantId', async () => {
    mockDynamoRead.mockResolvedValueOnce({ id: 'org123' }) // No paytrailMerchantId

    await expect(refundCreateLambda(event)).rejects.toThrow('Organizer org123 does not have MerchantId!')
    expect(mockRefundPayment).not.toHaveBeenCalled()
  })

  it('throws error if refundPayment does not return a result', async () => {
    mockRefundPayment.mockResolvedValueOnce(null)

    await expect(refundCreateLambda(event)).rejects.toThrow(/refundPayment did not return a result/)
    expect(mockWriteRefundTransaction).not.toHaveBeenCalled()
  })

  it('creates a refund transaction with items', async () => {
    const result = await refundCreateLambda(event)

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

    // Verify transaction was written via repository
    expect(mockWriteRefundTransaction).toHaveBeenCalledWith({
      amount: 1000,
      createdAt: expect.any(String),
      items: [
        {
          amount: 1000,
          refundReference: 'reg456',
          refundStamp: 'stamp123',
          stamp: 'item123',
        },
      ],
      provider: 'paytrail',
      reference: 'event123:reg456',
      stamp: 'stamp123',
      status: 'ok',
      transactionId: 'refund123',
      type: 'refund',
      user: 'Test User',
    })

    // Verify registration refund state transition was delegated to action
    expect(mockApplyRefundCreate).toHaveBeenCalledWith({
      eventId: 'event123',
      isPending: false,
      registrationId: 'reg456',
    })

    // Verify audit was not called (since status is 'ok')
    expect(mockAudit).not.toHaveBeenCalled()

    // Verify response was returned
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual(mockRefundResult)
  })

  it('creates a refund transaction without items', async () => {
    mockLoadRefundRequestData.mockResolvedValueOnce({
      eventId: 'event123',
      paymentTransaction: {
        reference: 'event123:reg456',
        transactionId: 'transaction123',
      },
      registration: mockRegistration,
      registrationId: 'reg456',
    })

    const result = await refundCreateLambda(event)

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

    // Verify transaction was written via repository
    expect(mockWriteRefundTransaction).toHaveBeenCalledWith({
      amount: 1000,
      createdAt: expect.any(String),
      items: undefined,
      provider: 'paytrail',
      reference: 'event123:reg456',
      stamp: 'stamp123',
      status: 'ok',
      transactionId: 'refund123',
      type: 'refund',
      user: 'Test User',
    })
    expect(result.statusCode).toBe(200)
  })

  it('creates audit entry for pending refunds', async () => {
    mockRefundPayment.mockResolvedValueOnce({
      provider: 'paytrail',
      status: 'pending',
      transactionId: 'refund123',
    })

    await refundCreateLambda(event)

    // Verify audit was called
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event123:reg456',
      message: 'Palautus on kesken (Paytrail), 10,00 €',
      user: 'Test User',
    })

    expect(mockApplyRefundCreate).toHaveBeenCalledWith({
      eventId: 'event123',
      isPending: true,
      registrationId: 'reg456',
    })
  })

  it('creates audit entry for email refunds', async () => {
    mockRefundPayment.mockResolvedValueOnce({
      provider: 'email refund',
      status: 'ok',
      transactionId: 'refund123',
    })

    await refundCreateLambda(event)

    // Verify audit was called
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event123:reg456',
      message: 'Palautus on kesken (Paytrail), 10,00 €',
      user: 'Test User',
    })

    expect(mockApplyRefundCreate).toHaveBeenCalledWith({
      eventId: 'event123',
      isPending: true,
      registrationId: 'reg456',
    })
  })

  it('handles unsupported transaction with multiple items', async () => {
    mockLoadRefundRequestData.mockResolvedValueOnce({
      eventId: 'event123',
      paymentTransaction: {
        items: [{ stamp: 'item1' }, { stamp: 'item2' }],
        reference: 'event123:reg456',
        transactionId: 'transaction123',
      },
      registration: mockRegistration,
      registrationId: 'reg456',
    })

    await expect(refundCreateLambda(event)).rejects.toThrow('Unsupported transaction')
    expect(mockRefundPayment).not.toHaveBeenCalled()
  })

  it('creates a partial refund with complex cost structure', async () => {
    const partialRefundAmount = 500
    mockParseJSONWithFallback.mockReturnValue({
      amount: partialRefundAmount,
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

    expect(mockWriteRefundTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: partialRefundAmount,
      })
    )
  })
})
