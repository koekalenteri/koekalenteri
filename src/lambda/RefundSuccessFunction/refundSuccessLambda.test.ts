import { jest } from '@jest/globals'

const mockLambda = jest.fn((name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockVerifyParams = jest.fn<any>()
const mockParseParams = jest.fn<any>()
const mockGetRegistration = jest.fn<any>()
const mockGetEvent = jest.fn<any>()
const mockUpdateTransactionStatus = jest.fn<any>()
const mockSendTemplatedMail = jest.fn<any>()
const mockAudit = jest.fn<any>()
const mockRegistrationAuditKey = jest.fn<any>()
const mockGetProviderName = jest.fn<any>()
const mockDynamoRead = jest.fn<any>()
const mockDynamoUpdate = jest.fn<any>()
const mockDynamoClient = jest.fn(() => ({
  read: mockDynamoRead,
  update: mockDynamoUpdate,
}))

jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
  LambdaError: class LambdaError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

jest.unstable_mockModule('../lib/payment', () => ({
  verifyParams: mockVerifyParams,
  parseParams: mockParseParams,
  updateTransactionStatus: mockUpdateTransactionStatus,
  getProviderName: mockGetProviderName,
}))

jest.unstable_mockModule('../lib/registration', () => ({
  getRegistration: mockGetRegistration,
}))

jest.unstable_mockModule('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

jest.unstable_mockModule('../lib/email', () => ({
  sendTemplatedMail: mockSendTemplatedMail,
  registrationEmailTemplateData: jest.fn(() => ({})),
}))

jest.unstable_mockModule('../lib/audit', () => ({
  audit: mockAudit,
  registrationAuditKey: mockRegistrationAuditKey,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: mockDynamoClient,
}))

const { default: refundSuccessLambda } = await import('./handler')

describe('refundSuccessLambda', () => {
  const event = {
    queryStringParameters: {
      'checkout-transaction-id': 'transaction123',
      'checkout-reference': 'event123:reg456',
      'checkout-status': 'ok',
      'checkout-provider': 'paytrail',
      'checkout-amount': '1000',
      signature: 'valid-signature',
    },
  } as any

  const mockTransaction = {
    transactionId: 'transaction123',
    status: 'pending',
    type: 'refund',
    user: 'Test User',
    createdAt: '2023-01-01T12:00:00.000Z',
  }

  const mockRegistration = {
    eventId: 'event123',
    id: 'reg456',
    language: 'fi',
    payer: {
      email: 'payer@example.com',
    },
    paidAmount: 20,
  }

  const mockConfirmedEvent = {
    id: 'event123',
    name: 'Test Event',
  }

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockVerifyParams.mockResolvedValue(undefined)

    mockParseParams.mockReturnValue({
      eventId: 'event123',
      registrationId: 'reg456',
      transactionId: 'transaction123',
      status: 'ok',
      provider: 'paytrail',
    })

    mockDynamoRead.mockResolvedValue(mockTransaction)
    mockGetRegistration.mockResolvedValue(mockRegistration)
    mockGetEvent.mockResolvedValue(mockConfirmedEvent)
    mockUpdateTransactionStatus.mockResolvedValue(true)
    mockSendTemplatedMail.mockResolvedValue(undefined)
    mockGetProviderName.mockReturnValue('Paytrail')
    mockRegistrationAuditKey.mockReturnValue('event123:reg456')
  })

  it('throws error if status is missing', async () => {
    mockParseParams.mockReturnValueOnce({
      eventId: 'event123',
      registrationId: 'reg456',
      transactionId: 'transaction123',
      // No status
      provider: 'paytrail',
    })

    await expect(refundSuccessLambda(event)).rejects.toThrow('Bad Request')
    expect(mockDynamoRead).not.toHaveBeenCalled()
  })

  it('throws error if transaction is not found', async () => {
    mockDynamoRead.mockResolvedValueOnce(null)

    await expect(refundSuccessLambda(event)).rejects.toThrow("Transaction with id 'transaction123' was not found")
    expect(mockGetRegistration).not.toHaveBeenCalled()
  })

  it('returns early if transaction already has status "ok"', async () => {
    mockDynamoRead.mockResolvedValueOnce({
      ...mockTransaction,
      status: 'ok',
      statusAt: '2023-01-01T12:30:00.000Z',
    })

    await refundSuccessLambda(event)

    expect(mockGetRegistration).not.toHaveBeenCalled()
    expect(mockUpdateTransactionStatus).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('processes successful refund with status "ok"', async () => {
    const now = new Date()
    const isoDate = now.toISOString()
    jest.spyOn(global, 'Date').mockImplementation(() => now as any)

    await refundSuccessLambda(event)

    // Verify transaction status was updated
    expect(mockUpdateTransactionStatus).toHaveBeenCalledWith(mockTransaction, 'ok')

    // Verify registration was updated
    expect(mockDynamoUpdate).toHaveBeenCalledWith(
      { eventId: 'event123', id: 'reg456' },
      {
        set: {
          refundAmount: 10,
          refundAt: isoDate,
          refundStatus: 'SUCCESS',
        },
      },
      expect.any(String)
    )

    // Verify email was sent
    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'refund',
      'fi',
      expect.any(String),
      ['payer@example.com'],
      expect.objectContaining({
        transactionId: 'transaction123',
        status: 'pending',
        type: 'refund',
        user: 'Test User',
        refundAmount: 10,
        refundStatus: 'SUCCESS',
        paidAmount: '20,00\u00A0€',
        amount: '10,00\u00A0€',
        handlingCost: '10,00\u00A0€',
        providerName: 'Paytrail',
      })
    )

    // Verify audit entry was created
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event123:reg456',
      message: 'Palautus (Paytrail), 10,00\u00A0€',
      user: 'Test User',
    })

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('handles failed email sending gracefully', async () => {
    mockSendTemplatedMail.mockRejectedValueOnce(new Error('Email sending failed'))
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await refundSuccessLambda(event)

    // Verify error was logged
    expect(consoleSpy).toHaveBeenCalledWith('failed to send refund email', expect.any(Error))

    // Verify audit entry was still created
    expect(mockAudit).toHaveBeenCalled()

    // Verify response was still returned
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)

    consoleSpy.mockRestore()
  })

  it('skips updates if transaction status is not changed', async () => {
    mockUpdateTransactionStatus.mockResolvedValueOnce(false)

    await refundSuccessLambda(event)

    // Verify registration was not updated
    expect(mockDynamoUpdate).not.toHaveBeenCalled()

    // Verify email was not sent
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()

    // Verify audit entry was not created
    expect(mockAudit).not.toHaveBeenCalled()

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('verifies params before processing', async () => {
    await refundSuccessLambda(event)

    expect(mockVerifyParams).toHaveBeenCalledWith(event.queryStringParameters)
    expect(mockParseParams).toHaveBeenCalledWith(event.queryStringParameters)
  })

  it('handles empty query parameters', async () => {
    const emptyEvent = {
      queryStringParameters: null,
    } as any

    mockParseParams.mockReturnValueOnce({
      // No values
    })

    await expect(refundSuccessLambda(emptyEvent)).rejects.toThrow('Bad Request')
    expect(mockVerifyParams).toHaveBeenCalledWith({})
  })
})
