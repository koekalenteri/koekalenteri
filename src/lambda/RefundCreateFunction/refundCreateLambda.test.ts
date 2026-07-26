import { jest } from '@jest/globals'

const mockLambda = jest.fn((_name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockAuthorizeWithMemberOf = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()
const mockGetApiHost = jest.fn<any>()
const mockRefundPayment = jest.fn<any>()
const mockGetEvent = jest.fn<any>()
const mockGetRegistration = jest.fn<any>()
const mockAudit = jest.fn<any>()
const mockRegistrationAuditKey = jest.fn<any>()
const mockDynamoRead = jest.fn<any>()
const mockDynamoWrite = jest.fn<any>()
const mockDynamoUpdate = jest.fn<any>()
const mockDocumentTransaction = jest.fn<any>()
const mockDynamoClient = jest.fn(() => ({
  documentTransaction: mockDocumentTransaction,
  read: mockDynamoRead,
  update: mockDynamoUpdate,
  write: mockDynamoWrite,
}))
const mockNanoid = jest.fn<any>()
const mockFormatMoney = jest.fn<any>()
const mockGetProviderName = jest.fn<any>()

class MockPaytrailError extends Error {
  status: number
  error: string | undefined

  constructor(status: number, error: string | undefined) {
    super(`${status} ${error}`)
    this.status = status
    this.error = error
  }
}

jest.unstable_mockModule('../lib/lambda', () => ({
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

jest.unstable_mockModule('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))

jest.unstable_mockModule('../lib/json', () => ({
  parseJSONWithFallback: mockParseJSONWithFallback,
}))

jest.unstable_mockModule('../utils/proxyEvent', () => ({
  getApiHost: mockGetApiHost,
}))

jest.unstable_mockModule('../lib/paytrail', () => ({
  PaytrailError: MockPaytrailError,
  parsePaytrailErrorMessage: (error?: string) => {
    if (!error) return 'Tuntematon virhe'
    try {
      const details = JSON.parse(error) as { message?: unknown }
      return typeof details.message === 'string' ? details.message : error
    } catch {
      return error
    }
  },
  refundPayment: mockRefundPayment,
}))

jest.unstable_mockModule('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

jest.unstable_mockModule('../lib/registration', () => ({
  getRegistration: mockGetRegistration,
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

const { default: refundCreateLambda } = await import('./handler')

describe('refundCreateLambda', () => {
  const event = {
    body: JSON.stringify({
      amount: 1000,
      handlingCost: 500,
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
    mockAuthorizeWithMemberOf.mockResolvedValue({
      memberOf: ['org123'],
      user: { id: 'user123', name: 'Test User' },
    })

    mockParseJSONWithFallback.mockReturnValue({
      amount: 1000,
      handlingCost: 500,
      transactionId: 'transaction123',
    })

    mockGetApiHost.mockReturnValue('api.example.com')

    // Set up default behavior for DynamoDB read
    // Set up default behavior for DynamoDB read
    mockDynamoRead.mockImplementation((params: any, table: any) => {
      if (table === 'organizer' || params.id === 'org123') {
        return Promise.resolve(mockOrganizer)
      }
      if (params.transactionId === 'transaction123' || !table || table === 'transaction') {
        return Promise.resolve(mockPaymentTransaction)
      }
      return Promise.resolve(null)
    })

    mockGetEvent.mockResolvedValue(mockConfirmedEvent)
    mockGetRegistration.mockResolvedValue(mockRegistration)

    mockNanoid.mockReturnValue('stamp123')

    mockRefundPayment.mockResolvedValue(mockRefundResult)

    mockFormatMoney.mockReturnValue('10,00 €')
    mockGetProviderName.mockReturnValue('Paytrail')
    mockRegistrationAuditKey.mockReturnValue('event123:reg456')
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ res: { body: 'Unauthorized', statusCode: 401 } })

    await refundCreateLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockDynamoRead).not.toHaveBeenCalled()
  })

  it('rejects users outside the event organizer before loading registration data or refunding', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({
      memberOf: ['another-organizer'],
      user: { admin: false, id: 'user123', name: 'Test User' },
    })

    await expect(refundCreateLambda(event)).rejects.toMatchObject({ message: 'Forbidden', status: 403 })

    expect(mockGetRegistration).not.toHaveBeenCalled()
    expect(mockRefundPayment).not.toHaveBeenCalled()
    expect(mockDynamoWrite).not.toHaveBeenCalled()
  })

  it('throws error if amount is invalid', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      amount: 0,
      transactionId: 'transaction123',
    })

    await expect(refundCreateLambda(event)).rejects.toThrow("Invalid amount: '0'")
    expect(mockDynamoRead).not.toHaveBeenCalled()
  })

  it('throws error if transaction is not found', async () => {
    mockDynamoRead.mockImplementationOnce(() => Promise.resolve(null))

    await expect(refundCreateLambda(event)).rejects.toThrow("Transaction with id 'transaction123' was not found")
    expect(mockGetEvent).not.toHaveBeenCalled()
  })

  it('throws error if organizer does not have MerchantId', async () => {
    // Reset all mocks
    jest.clearAllMocks()

    // Mock transaction read
    mockDynamoRead.mockImplementation((params: any, table: any) => {
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
    jest.clearAllMocks()

    // Mock transaction read
    mockDynamoRead.mockImplementation((params: any, table: any) => {
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
    expect(mockDynamoWrite).not.toHaveBeenCalled()
  })

  it('audits and returns Paytrail refund errors', async () => {
    const paytrailMessage =
      'API refund failed and provider does not support email refunds. Provider message: Revert failed'
    const paytrailError = JSON.stringify({ message: paytrailMessage, status: 'error' })
    mockRefundPayment.mockRejectedValueOnce(new MockPaytrailError(400, paytrailError))

    await refundCreateLambda(event)

    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event123:reg456',
      message: `Maksun palautus epäonnistui Paytrailissa (400): ${paytrailMessage}`,
      user: 'Test User',
    })
    expect(mockResponse).toHaveBeenCalledWith(
      400,
      {
        error: paytrailError,
        message: `Maksun palautus epäonnistui Paytrailissa (400): ${paytrailMessage}`,
      },
      event
    )
    expect(mockDynamoWrite).not.toHaveBeenCalled()
    expect(mockDynamoUpdate).not.toHaveBeenCalled()
  })

  it('creates a refund transaction with items', async () => {
    // Reset all mocks
    jest.clearAllMocks()

    // Mock transaction read
    mockDynamoRead.mockImplementation((params: any, table: any) => {
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

    expect(mockDocumentTransaction).toHaveBeenCalledWith([
      {
        Put: expect.objectContaining({
          ConditionExpression: 'attribute_not_exists(transactionId)',
          Item: expect.objectContaining({
            amount: 1000,
            handlingCost: 500,
            status: 'ok',
            transactionId: 'refund123',
            type: 'refund',
          }),
        }),
      },
      {
        Update: expect.objectContaining({
          ConditionExpression: 'attribute_exists(id)',
          ExpressionAttributeValues: expect.objectContaining({ ':status': 'SUCCESS' }),
          Key: { eventId: 'event123', id: 'reg456' },
        }),
      },
    ])

    // Verify audit was not called (since status is 'ok')
    expect(mockAudit).not.toHaveBeenCalled()

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, mockRefundResult, event)
  })

  it('rejects a concurrent refund creation before calling Paytrail', async () => {
    const error = new Error('claim already exists')
    error.name = 'TransactionCanceledException'
    mockDocumentTransaction.mockRejectedValueOnce(error)

    await refundCreateLambda(event)

    expect(mockResponse).toHaveBeenCalledWith(409, 'Refund already in progress', event)
    expect(mockRefundPayment).not.toHaveBeenCalled()
  })

  it('creates a refund transaction without items', async () => {
    // Reset all mocks
    jest.clearAllMocks()

    // Mock a payment transaction without items
    mockDynamoRead.mockImplementation((params: any, table: any) => {
      if (table === 'organizer' || params.id === 'org123') {
        return Promise.resolve(mockOrganizer)
      }
      if (params.transactionId === 'transaction123' || !table || table === 'transaction') {
        return Promise.resolve({
          reference: 'event123:reg456',
          transactionId: 'transaction123',
        })
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

    expect(mockDocumentTransaction).toHaveBeenCalledWith(
      expect.arrayContaining([
        {
          Put: expect.objectContaining({
            Item: expect.objectContaining({ amount: 1000, items: undefined, transactionId: 'refund123' }),
          }),
        },
      ])
    )
  })

  it('creates audit entry for pending refunds', async () => {
    // Reset all mocks
    jest.clearAllMocks()

    // Mock transaction read
    mockDynamoRead.mockImplementation((params: any, table: any) => {
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
      message: 'Palautus on kesken (Paytrail), 10,00 €',
      user: 'Test User',
    })

    expect(mockDocumentTransaction).toHaveBeenCalledWith(
      expect.arrayContaining([
        {
          Update: expect.objectContaining({
            ExpressionAttributeValues: expect.objectContaining({ ':status': 'PENDING' }),
          }),
        },
      ])
    )
  })

  it('creates audit entry for email refunds', async () => {
    // Reset all mocks
    jest.clearAllMocks()

    // Mock transaction read
    mockDynamoRead.mockImplementation((params: any, table: any) => {
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
      message: 'Palautus on kesken (Paytrail), 10,00 €',
      user: 'Test User',
    })

    expect(mockDocumentTransaction).toHaveBeenCalledWith(
      expect.arrayContaining([
        {
          Update: expect.objectContaining({
            ExpressionAttributeValues: expect.objectContaining({ ':status': 'PENDING' }),
          }),
        },
      ])
    )
  })

  it('handles unsupported transaction with multiple items', async () => {
    // Reset all mocks
    jest.clearAllMocks()

    // Mock transaction with multiple items
    mockDynamoRead.mockImplementation((params: any, table: any) => {
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
    mockParseJSONWithFallback.mockReturnValue({
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

    expect(mockDocumentTransaction).toHaveBeenCalledWith(
      expect.arrayContaining([
        {
          Put: expect.objectContaining({
            Item: expect.objectContaining({ amount: partialRefundAmount, handlingCost: 500 }),
          }),
        },
      ])
    )
  })
})
