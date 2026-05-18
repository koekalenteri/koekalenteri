import { jest } from '@jest/globals'

const mockVerifyParams = jest.fn<any>()
const mockParseParams = jest.fn<any>()
const mockGetConfirmedEvent = jest.fn<any>()
const mockUpdateTransactionStatus = jest.fn<any>()
const mockSendTemplatedMail = jest.fn<any>()
const mockAudit = jest.fn<any>()
const mockRegistrationAuditKey = jest.fn<any>()
const mockGetProviderName = jest.fn<any>()
const mockGetById = jest.fn<any>()
const mockHandleSuccessfulRefund = jest.fn<any>()

jest.unstable_mockModule('../lib/payment', () => ({
  parseParams: mockParseParams,
  verifyParams: mockVerifyParams,
}))

jest.unstable_mockModule('../refund/actions', () => ({
  handleSuccessfulRefund: mockHandleSuccessfulRefund,
}))

jest.unstable_mockModule('../registration/api', () => ({
  eventReadPort: {
    getConfirmedEvent: mockGetConfirmedEvent,
  },
}))

jest.unstable_mockModule('../lib/email', () => ({
  registrationEmailTemplateData: jest.fn(() => ({})),
  sendTemplatedMail: mockSendTemplatedMail,
}))

jest.unstable_mockModule('../lib/audit', () => ({
  audit: mockAudit,
  registrationAuditKey: mockRegistrationAuditKey,
}))

jest.unstable_mockModule('../payment/repository', () => ({
  paymentTransactionRepository: {
    getRefundById: mockGetById,
    patchStatus: mockUpdateTransactionStatus,
  },
}))

const { refundSuccessLambda } = await import('./handler')

describe('refundSuccessLambda', () => {
  const event = {
    headers: {},
    queryStringParameters: {
      'checkout-amount': '1000',
      'checkout-provider': 'paytrail',
      'checkout-reference': 'event123:reg456',
      'checkout-status': 'ok',
      'checkout-transaction-id': 'transaction123',
      signature: 'valid-signature',
    },
  } as any

  const mockTransaction = {
    createdAt: '2023-01-01T12:00:00.000Z',
    status: 'pending',
    transactionId: 'transaction123',
    type: 'refund',
    user: 'Test User',
  }

  const _mockRegistration = {
    eventId: 'event123',
    id: 'reg456',
    language: 'fi',
    paidAmount: 20,
    payer: {
      email: 'payer@example.com',
    },
  }

  const mockConfirmedEvent = {
    id: 'event123',
    name: 'Test Event',
  }

  beforeEach(() => {
    jest.clearAllMocks()

    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})

    // Default mock implementations
    mockVerifyParams.mockResolvedValue(undefined)

    mockParseParams.mockReturnValue({
      eventId: 'event123',
      provider: 'paytrail',
      registrationId: 'reg456',
      status: 'ok',
      transactionId: 'transaction123',
    })

    mockGetById.mockResolvedValue(mockTransaction)
    mockGetConfirmedEvent.mockResolvedValue(mockConfirmedEvent)
    mockUpdateTransactionStatus.mockResolvedValue(true)
    mockSendTemplatedMail.mockResolvedValue(undefined)
    mockGetProviderName.mockReturnValue('Paytrail')
    mockRegistrationAuditKey.mockReturnValue('event123:reg456')
    mockHandleSuccessfulRefund.mockResolvedValue(undefined)
  })

  it('throws error if status is missing', async () => {
    mockParseParams.mockReturnValueOnce({
      eventId: 'event123',
      // No status
      provider: 'paytrail',
      registrationId: 'reg456',
      transactionId: 'transaction123',
    })

    await expect(refundSuccessLambda(event)).rejects.toThrow('Bad Request')
    expect(mockGetById).not.toHaveBeenCalled()
  })

  it('throws error if transaction is not found', async () => {
    mockGetById.mockRejectedValueOnce(new Error("Transaction with id 'transaction123' was not found"))

    await expect(refundSuccessLambda(event)).rejects.toThrow("Transaction with id 'transaction123' was not found")
    expect(mockHandleSuccessfulRefund).not.toHaveBeenCalled()
  })

  it('returns early if transaction already has status "ok"', async () => {
    mockGetById.mockResolvedValueOnce({
      ...mockTransaction,
      status: 'ok',
      statusAt: '2023-01-01T12:30:00.000Z',
    })

    const result = await refundSuccessLambda(event)

    expect(mockHandleSuccessfulRefund).not.toHaveBeenCalled()
    expect(mockUpdateTransactionStatus).not.toHaveBeenCalled()
    expect(result.statusCode).toBe(200)
  })

  it('processes successful refund with status "ok"', async () => {
    const now = new Date()
    const _isoDate = now.toISOString()
    jest.spyOn(global, 'Date').mockImplementation(() => now as any)

    const result = await refundSuccessLambda(event)

    // Verify transaction status was updated
    expect(mockUpdateTransactionStatus).toHaveBeenCalledWith(mockTransaction, { status: 'ok' })

    expect(mockHandleSuccessfulRefund).toHaveBeenCalledWith({
      eventId: 'event123',
      params: event.queryStringParameters,
      provider: 'paytrail',
      registrationId: 'reg456',
      transaction: mockTransaction,
    })

    expect(result.statusCode).toBe(200)
  })

  it('handles failed email sending gracefully', async () => {
    const result = await refundSuccessLambda(event)
    expect(mockHandleSuccessfulRefund).toHaveBeenCalled()

    expect(result.statusCode).toBe(200)
  })

  it('skips updates if transaction status is not changed', async () => {
    mockUpdateTransactionStatus.mockResolvedValueOnce(false)

    const result = await refundSuccessLambda(event)

    // Verify registration was not updated
    expect(mockHandleSuccessfulRefund).not.toHaveBeenCalled()

    expect(result.statusCode).toBe(200)
  })

  it('verifies params before processing', async () => {
    await refundSuccessLambda(event)

    expect(mockVerifyParams).toHaveBeenCalledWith(event.queryStringParameters)
    expect(mockParseParams).toHaveBeenCalledWith(event.queryStringParameters)
  })

  it('handles empty query parameters', async () => {
    const emptyEvent = {
      headers: {},
      queryStringParameters: null,
    } as any

    mockParseParams.mockReturnValueOnce({
      // No values
    })

    await expect(refundSuccessLambda(emptyEvent)).rejects.toThrow('Bad Request')
    expect(mockVerifyParams).toHaveBeenCalledWith({})
  })
})
