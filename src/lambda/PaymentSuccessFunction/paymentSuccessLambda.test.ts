import { jest } from '@jest/globals'

const mockParseParams = jest.fn<any>()
const mockVerifyParams = jest.fn<any>()
const mockUpdateTransactionStatus = jest.fn<any>()
const mockGetRegistration = jest.fn<any>()
const mockAudit = jest.fn<any>()
const mockRegistrationAuditKey = jest.fn<any>()
const mockGetById = jest.fn<any>()
const mockRead = jest.fn<any>()
const mockUpdate = jest.fn<any>()
const mockSyncEventAggregates = jest.fn<any>()
const mockGetFixedT = jest.fn<any>()
const mockSendTemplatedMail = jest.fn<any>()
const mockEmailTo = jest.fn<any>()
const mockRegistrationEmailTemplateData = jest.fn<any>()

jest.unstable_mockModule('../lib/payment', () => ({
  parseParams: mockParseParams,
  verifyParams: mockVerifyParams,
}))

jest.unstable_mockModule('../lib/registration', () => ({
  getRegistration: mockGetRegistration,
}))

jest.unstable_mockModule('../lib/audit', () => ({
  audit: mockAudit,
  registrationAuditKey: mockRegistrationAuditKey,
}))

jest.unstable_mockModule('../payment/repository', () => ({
  paymentTransactionRepository: {
    getPaymentById: mockGetById,
    patchStatus: mockUpdateTransactionStatus,
  },
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    read: mockRead,
    update: mockUpdate,
  })),
}))

jest.unstable_mockModule('../registration/api', () => ({
  eventReadPort: {
    getConfirmedEvent: jest.fn(async () => undefined),
  },
  groupChangeNotifier: {
    sendCancelledEmails: jest.fn(async () => ({ failed: [], ok: [] })),
    sendInvitedEmails: jest.fn(async () => ({ failed: [], ok: [] })),
    sendPickedEmails: jest.fn(async () => ({ failed: [], ok: [] })),
    sendReserveEmails: jest.fn(async () => ({ failed: [], ok: [] })),
    updateReserveNotified: jest.fn(async () => undefined),
  },
  registrationStatsPort: {
    recordRegistrationChange: jest.fn(async () => undefined),
  },
  syncAggregatesPort: {
    syncEventAggregates: mockSyncEventAggregates,
  },
}))

jest.unstable_mockModule('../../i18n/lambda', () => ({
  i18n: {
    getFixedT: mockGetFixedT,
  },
}))

jest.unstable_mockModule('../lib/email', () => ({
  emailTo: mockEmailTo,
  registrationEmailTemplateData: mockRegistrationEmailTemplateData,
  sendTemplatedMail: mockSendTemplatedMail,
}))

const { paymentSuccessLambda } = await import('./handler')

describe('paymentSuccessLambda', () => {
  const event = {
    body: '',
    headers: {},
    queryStringParameters: {
      'checkout-amount': '5000',
      'checkout-provider': 'paytrail',
      'checkout-reference': 'event123:reg456',
      'checkout-status': 'ok',
      'checkout-transaction-id': 'tx123',
    },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockParseParams.mockReturnValue({
      eventId: 'event123',
      provider: 'paytrail',
      registrationId: 'reg456',
      status: 'ok',
      transactionId: 'tx123',
    })

    mockVerifyParams.mockResolvedValue(undefined)

    mockGetById.mockResolvedValue({
      amount: 5000,
      paymentResponse: { transactionId: 'tx123' },
      reference: 'event123:reg456',
      status: 'pending',
      transactionId: 'tx123',
      user: 'user123',
    })

    // mockRead is used by registration/repository via CustomDynamoClient for registration table lookups
    mockRead.mockResolvedValue({
      eventId: 'event123',
      id: 'reg456',
      language: 'fi',
      paidAmount: 0,
      payer: {
        email: 'test@example.com',
      },
      paymentStatus: 'PENDING',
    })

    mockGetRegistration.mockResolvedValue({
      eventId: 'event123',
      id: 'reg456',
      language: 'fi',
      paidAmount: 0,
      payer: {
        email: 'test@example.com',
      },
      paymentStatus: 'PENDING',
    })

    mockUpdateTransactionStatus.mockResolvedValue(true)

    mockUpdate.mockResolvedValue({})

    mockRegistrationAuditKey.mockReturnValue('event123:reg456')

    mockSyncEventAggregates.mockResolvedValue({
      changed: true,
      event: {
        cost: 50,
        id: 'event123',
        name: 'Test Event',
        paymentTime: 'before',
      },
    })

    mockGetFixedT.mockReturnValue((key: string, _options?: Record<string, any>) => {
      if (key === 'dateFormat.long') return '1.1.2025'
      return key
    })

    mockRegistrationEmailTemplateData.mockReturnValue({
      eventName: 'Test Event',
      registrationId: 'reg456',
    })

    mockEmailTo.mockReturnValue(['test@example.com'])

    mockSendTemplatedMail.mockResolvedValue(undefined)
  })

  it('processes a successful payment correctly', async () => {
    const result = await paymentSuccessLambda(event)

    // Verify params were parsed and verified
    expect(mockParseParams).toHaveBeenCalledWith(event.queryStringParameters)
    expect(mockVerifyParams).toHaveBeenCalledWith(event.queryStringParameters)

    // Verify transaction was retrieved
    expect(mockGetById).toHaveBeenCalledWith('tx123')

    // Verify transaction status was updated
    expect(mockUpdateTransactionStatus).toHaveBeenCalledWith(
      {
        amount: 5000,
        paymentResponse: { transactionId: 'tx123' },
        reference: 'event123:reg456',
        status: 'pending',
        transactionId: 'tx123',
        user: 'user123',
      },
      { provider: 'paytrail', status: 'ok' }
    )

    // Registration loading is handled inside applyPaymentSuccess action
    expect(mockGetRegistration).not.toHaveBeenCalled()

    // Verify registration payment status was updated
    expect(mockUpdate).toHaveBeenCalledWith(
      { eventId: 'event123', id: 'reg456' },
      {
        set: {
          paidAmount: 50, // 5000 / 100
          paidAt: expect.any(String),
          paymentStatus: 'SUCCESS',
          state: 'ready',
        },
      },
      expect.any(String) // registrationTable
    )

    // Verify event registrations were updated
    expect(mockSyncEventAggregates).toHaveBeenCalledWith('event123')

    // Verify receipt email was sent
    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'receipt',
      expect.any(String), // language
      expect.any(String), // emailFrom
      expect.any(Array), // receiptTo
      expect.objectContaining({
        amount: '50,00\u00a0€',
        createdAt: '1.1.2025',
        eventName: 'Test Event',
        registrationId: 'reg456',
      })
    )

    // Verify confirmation email was sent
    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'registration',
      expect.any(String), // language
      expect.any(String), // emailFrom
      expect.any(Array), // to
      expect.objectContaining({
        eventName: 'Test Event',
        registrationId: 'reg456',
      })
    )

    // Verify audit entry was created
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event123:reg456',
      message: 'Maksu (Paytrail), 50,00\u00a0€',
      user: 'user123',
    })

    expect(result.statusCode).toBe(200)
  })

  it('does not process payment if transaction status update returns false', async () => {
    mockUpdateTransactionStatus.mockResolvedValueOnce(false)

    const result = await paymentSuccessLambda(event)

    // Verify transaction status was attempted to be updated
    expect(mockUpdateTransactionStatus).toHaveBeenCalled()

    // Verify registration was NOT retrieved
    expect(mockGetRegistration).not.toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockUpdate).not.toHaveBeenCalled()

    // Verify event registrations were NOT updated
    expect(mockSyncEventAggregates).not.toHaveBeenCalled()

    // Verify receipt email was NOT sent
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()

    expect(result.statusCode).toBe(200)
  })

  it('does not process payment if status is not ok', async () => {
    mockParseParams.mockReturnValueOnce({
      eventId: 'event123',
      provider: 'paytrail',
      registrationId: 'reg456',
      status: 'fail',
      transactionId: 'tx123',
    })

    const result = await paymentSuccessLambda(event)

    // Verify transaction status was updated
    expect(mockUpdateTransactionStatus).toHaveBeenCalled()

    // Verify registration was NOT retrieved
    expect(mockGetRegistration).not.toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockUpdate).not.toHaveBeenCalled()

    // Verify event registrations were NOT updated
    expect(mockSyncEventAggregates).not.toHaveBeenCalled()

    // Verify receipt email was NOT sent
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()

    expect(result.statusCode).toBe(200)
  })

  it('throws error if transaction is not found', async () => {
    mockGetById.mockRejectedValueOnce(new Error("Transaction with id 'tx123' was not found"))

    await expect(paymentSuccessLambda(event)).rejects.toThrow("Transaction with id 'tx123' was not found")

    // Verify transaction was attempted to be retrieved
    expect(mockGetById).toHaveBeenCalledWith('tx123')

    // Verify transaction status was NOT updated
    expect(mockUpdateTransactionStatus).not.toHaveBeenCalled()

    // Verify registration was NOT retrieved
    expect(mockGetRegistration).not.toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockUpdate).not.toHaveBeenCalled()

    // Verify event registrations were NOT updated
    expect(mockSyncEventAggregates).not.toHaveBeenCalled()

    // Verify receipt email was NOT sent
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('passes through errors from verifyParams', async () => {
    const error = new Error('Verification failed')
    mockVerifyParams.mockRejectedValueOnce(error)

    await expect(paymentSuccessLambda(event)).rejects.toThrow(error)

    // Verify params were parsed
    expect(mockParseParams).toHaveBeenCalledWith(event.queryStringParameters)

    // Verify params verification was attempted
    expect(mockVerifyParams).toHaveBeenCalledWith(event.queryStringParameters)

    // Verify transaction was NOT retrieved
    expect(mockGetById).not.toHaveBeenCalled()

    // Verify transaction status was NOT updated
    expect(mockUpdateTransactionStatus).not.toHaveBeenCalled()

    // Verify registration was NOT retrieved
    expect(mockGetRegistration).not.toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockUpdate).not.toHaveBeenCalled()

    // Verify event registrations were NOT updated
    expect(mockSyncEventAggregates).not.toHaveBeenCalled()

    // Verify receipt email was NOT sent
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('handles receipt email sending failure gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const emailError = new Error('Failed to send email')
    mockSendTemplatedMail.mockRejectedValueOnce(emailError)

    const result = await paymentSuccessLambda(event)

    // Verify console.error was called with the expected message
    expect(consoleSpy).toHaveBeenCalledWith('failed to send receipt', emailError)

    // Verify confirmation email was still sent
    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'registration',
      expect.any(String), // language
      expect.any(String), // emailFrom
      expect.any(Array), // to
      expect.any(Object) // data
    )

    expect(result.statusCode).toBe(200)

    consoleSpy.mockRestore()
  })

  it('adds amount to existing paidAmount if present', async () => {
    await paymentSuccessLambda(event)

    // Verify registration payment status was updated with correct paidAmount
    expect(mockUpdate).toHaveBeenCalledWith(
      { eventId: 'event123', id: 'reg456' },
      {
        set: {
          paidAmount: 50,
          paidAt: expect.any(String),
          paymentStatus: 'SUCCESS',
          state: 'ready',
        },
      },
      expect.any(String) // registrationTable
    )
  })
})
