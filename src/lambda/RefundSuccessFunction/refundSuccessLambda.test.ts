import { vi } from 'vitest'

const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockVerifyParams = vi.fn()
const mockParseParams = vi.fn()
const mockGetRegistration = vi.fn()
const mockGetEvent = vi.fn()
const mockUpdateTransactionStatus = vi.fn()
const mockApplySuccessfulRefund = vi.fn()
const mockClearRegistrationEmailDeliveryStatus = vi.fn()
const mockSendTemplatedMail = vi.fn()
const mockRegistrationEmailTags = vi.fn()
const mockAudit = vi.fn()
const mockRegistrationAuditKey = vi.fn()
const mockDynamoRead = vi.fn()
const mockDynamoUpdate = vi.fn()
const mockPublishRegistrationPatches = vi.fn()
const mockDynamoClient = vi.fn(function MockCustomDynamoClient() {
  return {
    read: mockDynamoRead,
    update: mockDynamoUpdate,
  }
})

vi.doMock('../lib/lambda', () => ({
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

vi.doMock('../lib/payment', () => ({
  applySuccessfulRefund: mockApplySuccessfulRefund,
  parseParams: mockParseParams,
  updateTransactionStatus: mockUpdateTransactionStatus,
  verifyParams: mockVerifyParams,
}))

vi.doMock('../lib/registration', () => ({
  clearRegistrationEmailDeliveryStatus: mockClearRegistrationEmailDeliveryStatus,
  getRegistration: mockGetRegistration,
  getRegistrationEditToken: vi.fn(() => 'test-edit-token'),
}))

vi.doMock('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

vi.doMock('../lib/email', () => ({
  registrationEmailTags: mockRegistrationEmailTags,
  registrationEmailTemplateData: vi.fn(() => ({})),
  sendTemplatedMail: mockSendTemplatedMail,
}))

vi.doMock('../lib/audit', () => ({
  audit: mockAudit,
  registrationAuditKey: mockRegistrationAuditKey,
}))

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: mockDynamoClient,
}))

vi.doMock('../lib/ws/actions', () => ({
  publishRegistrationPatches: mockPublishRegistrationPatches,
}))

const { default: refundSuccessLambda } = await import('./handler')

describe('refundSuccessLambda', () => {
  const event = {
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
    amount: 1000,
    createdAt: '2023-01-01T12:00:00.000Z',
    handlingCost: 500,
    reference: 'event123:reg456',
    status: 'pending',
    transactionId: 'transaction123',
    type: 'refund',
    user: 'Test User',
  }

  const mockRegistration = {
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
    organizer: { id: 'org-1' },
  }

  beforeEach(() => {
    vi.clearAllMocks()

    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // Default mock implementations
    mockVerifyParams.mockResolvedValue(undefined)

    mockParseParams.mockReturnValue({
      eventId: 'event123',
      provider: 'paytrail',
      registrationId: 'reg456',
      status: 'ok',
      transactionId: 'transaction123',
    })

    mockDynamoRead.mockResolvedValue(mockTransaction)
    mockGetRegistration.mockImplementation(() => Promise.resolve(structuredClone(mockRegistration)))
    mockGetEvent.mockResolvedValue(mockConfirmedEvent)
    mockUpdateTransactionStatus.mockResolvedValue(true)
    mockApplySuccessfulRefund.mockResolvedValue({ applied: true, appliedAt: '2023-01-01T12:30:00.000Z' })
    mockClearRegistrationEmailDeliveryStatus.mockResolvedValue(undefined)
    mockSendTemplatedMail.mockResolvedValue(undefined)
    mockRegistrationEmailTags.mockImplementation((registration: any, template: any) => [
      { Name: 'eventId', Value: registration.eventId },
      { Name: 'registrationId', Value: registration.id },
      { Name: 'template', Value: template },
    ])
    mockRegistrationAuditKey.mockReturnValue('event123:reg456')
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
    expect(mockDynamoRead).not.toHaveBeenCalled()
  })

  it('reconstructs a missing transaction from a verified success callback', async () => {
    mockDynamoRead.mockResolvedValueOnce(null)

    await refundSuccessLambda(event)

    expect(mockApplySuccessfulRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1000,
        reference: 'event123:reg456',
        status: 'new',
        transactionId: 'transaction123',
        type: 'refund',
      }),
      'event123',
      'reg456',
      false
    )
  })

  it('returns early if transaction already has status "ok"', async () => {
    mockDynamoRead.mockResolvedValueOnce({
      ...mockTransaction,
      registrationAppliedAt: '2023-01-01T12:30:00.000Z',
      status: 'ok',
      statusAt: '2023-01-01T12:30:00.000Z',
    })

    await refundSuccessLambda(event)

    expect(mockGetRegistration).not.toHaveBeenCalled()
    expect(mockUpdateTransactionStatus).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('processes successful refund with status "ok"', async () => {
    await refundSuccessLambda(event)

    expect(mockApplySuccessfulRefund).toHaveBeenCalledWith(mockTransaction, 'event123', 'reg456', true)
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
      'event123',
      [
        expect.objectContaining({
          emailDeliveryStatus: null,
          eventId: 'event123',
          id: 'reg456',
          refundStatus: 'SUCCESS',
          updatedAt: expect.any(String),
        }),
      ],
      'org-1'
    )

    expect(mockDynamoUpdate).not.toHaveBeenCalled()

    // Verify email was sent
    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'refund',
      'fi',
      expect.any(String),
      ['payer@example.com'],
      expect.objectContaining({
        amount: '10,00\u00A0€',
        handlingCost: '10,00\u00A0€',
        paidAmount: '20,00\u00A0€',
        providerName: 'Paytrail',
        refundAmount: 10,
        refundStatus: 'SUCCESS',
        status: 'pending',
        transactionId: 'transaction123',
        type: 'refund',
        user: 'Test User',
      }),
      expect.arrayContaining([
        { Name: 'eventId', Value: 'event123' },
        { Name: 'registrationId', Value: 'reg456' },
        { Name: 'template', Value: 'refund' },
      ])
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

    await refundSuccessLambda(event)

    // Verify error was logged
    expect(console.error).toHaveBeenCalledWith('failed to send refund email', expect.any(Error))

    // Verify audit entry was still created
    expect(mockAudit).toHaveBeenCalled()

    // Verify response was still returned
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('skips updates if the refund was already applied', async () => {
    mockApplySuccessfulRefund.mockResolvedValueOnce({ applied: false, appliedAt: '2023-01-01T12:30:00.000Z' })

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
