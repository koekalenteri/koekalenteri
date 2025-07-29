import { jest } from '@jest/globals'

const mockLambda = jest.fn((name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockParseParams = jest.fn<any>()
const mockVerifyParams = jest.fn<any>()
const mockUpdateTransactionStatus = jest.fn<any>()
const mockGetRegistration = jest.fn<any>()
const mockAudit = jest.fn<any>()
const mockRegistrationAuditKey = jest.fn<any>()
const mockRead = jest.fn<any>()
const mockUpdate = jest.fn<any>()
const mockUpdateRegistrations = jest.fn<any>()
const mockGetFixedT = jest.fn<any>()
const mockSendTemplatedMail = jest.fn<any>()
const mockEmailTo = jest.fn<any>()
const mockRegistrationEmailTemplateData = jest.fn<any>()

jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

jest.unstable_mockModule('../lib/payment', () => ({
  parseParams: mockParseParams,
  updateTransactionStatus: mockUpdateTransactionStatus,
  verifyParams: mockVerifyParams,
}))

jest.unstable_mockModule('../lib/registration', () => ({
  getRegistration: mockGetRegistration,
}))

jest.unstable_mockModule('../lib/audit', () => ({
  audit: mockAudit,
  registrationAuditKey: mockRegistrationAuditKey,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    read: mockRead,
    update: mockUpdate,
  })),
}))

jest.unstable_mockModule('../lib/event', () => ({
  updateRegistrations: mockUpdateRegistrations,
}))

jest.unstable_mockModule('../../i18n/lambda', () => ({
  i18n: {
    getFixedT: mockGetFixedT,
  },
}))

jest.unstable_mockModule('../lib/email', () => ({
  emailTo: mockEmailTo,
  sendTemplatedMail: mockSendTemplatedMail,
  registrationEmailTemplateData: mockRegistrationEmailTemplateData,
}))

const { default: paymentSuccessLambda } = await import('./handler')

describe('paymentSuccessLambda', () => {
  const event = {
    queryStringParameters: {
      'checkout-transaction-id': 'tx123',
      'checkout-reference': 'event123:reg456',
      'checkout-provider': 'paytrail',
      'checkout-status': 'ok',
      'checkout-amount': '5000',
    },
    headers: {},
    body: '',
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockParseParams.mockReturnValue({
      eventId: 'event123',
      registrationId: 'reg456',
      transactionId: 'tx123',
      provider: 'paytrail',
      status: 'ok',
    })

    mockVerifyParams.mockResolvedValue(undefined)

    mockRead.mockResolvedValue({
      transactionId: 'tx123',
      reference: 'event123:reg456',
      amount: 5000,
      status: 'pending',
      user: 'user123',
    })

    mockGetRegistration.mockResolvedValue({
      eventId: 'event123',
      id: 'reg456',
      paymentStatus: 'PENDING',
      language: 'fi',
      paidAmount: 0,
      payer: {
        email: 'test@example.com',
      },
    })

    mockUpdateTransactionStatus.mockResolvedValue(true)

    mockUpdate.mockResolvedValue({})

    mockRegistrationAuditKey.mockReturnValue('event123:reg456')

    mockUpdateRegistrations.mockResolvedValue({
      id: 'event123',
      name: 'Test Event',
      cost: 50,
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
    await paymentSuccessLambda(event)

    // Verify params were parsed and verified
    expect(mockParseParams).toHaveBeenCalledWith(event.queryStringParameters)
    expect(mockVerifyParams).toHaveBeenCalledWith(event.queryStringParameters)

    // Verify transaction was retrieved
    expect(mockRead).toHaveBeenCalledWith({ transactionId: 'tx123' })

    // Verify transaction status was updated
    expect(mockUpdateTransactionStatus).toHaveBeenCalledWith(
      {
        transactionId: 'tx123',
        reference: 'event123:reg456',
        amount: 5000,
        status: 'pending',
        user: 'user123',
      },
      'ok',
      'paytrail'
    )

    // Verify registration was retrieved
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')

    // Verify registration payment status was updated
    expect(mockUpdate).toHaveBeenCalledWith(
      { eventId: 'event123', id: 'reg456' },
      {
        set: {
          paidAmount: 50, // 5000 / 100
          paidAt: expect.any(String),
          paymentStatus: 'SUCCESS',
          state: 'ready',
          confirmed: false,
        },
      },
      expect.any(String) // registrationTable
    )

    // Verify event registrations were updated
    expect(mockUpdateRegistrations).toHaveBeenCalledWith('event123')

    // Verify receipt email was sent
    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'receipt',
      'fi',
      expect.any(String), // emailFrom
      ['test@example.com'], // receiptTo
      expect.objectContaining({
        eventName: 'Test Event',
        registrationId: 'reg456',
        amount: '50,00\u00a0€',
        createdAt: '1.1.2025',
      })
    )

    // Verify confirmation email was sent
    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'registration',
      'fi',
      expect.any(String), // emailFrom
      ['test@example.com'], // to
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

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('does not process payment if transaction status update returns false', async () => {
    mockUpdateTransactionStatus.mockResolvedValueOnce(false)

    await paymentSuccessLambda(event)

    // Verify transaction status was attempted to be updated
    expect(mockUpdateTransactionStatus).toHaveBeenCalled()

    // Verify registration was NOT retrieved
    expect(mockGetRegistration).not.toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockUpdate).not.toHaveBeenCalled()

    // Verify event registrations were NOT updated
    expect(mockUpdateRegistrations).not.toHaveBeenCalled()

    // Verify receipt email was NOT sent
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('does not process payment if status is not ok', async () => {
    mockParseParams.mockReturnValueOnce({
      eventId: 'event123',
      registrationId: 'reg456',
      transactionId: 'tx123',
      provider: 'paytrail',
      status: 'fail',
    })

    await paymentSuccessLambda(event)

    // Verify transaction status was updated
    expect(mockUpdateTransactionStatus).toHaveBeenCalled()

    // Verify registration was NOT retrieved
    expect(mockGetRegistration).not.toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockUpdate).not.toHaveBeenCalled()

    // Verify event registrations were NOT updated
    expect(mockUpdateRegistrations).not.toHaveBeenCalled()

    // Verify receipt email was NOT sent
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('throws error if transaction is not found', async () => {
    mockRead.mockResolvedValueOnce(null)

    await expect(paymentSuccessLambda(event)).rejects.toThrow("Transaction with id 'tx123' was not found")

    // Verify transaction was attempted to be retrieved
    expect(mockRead).toHaveBeenCalledWith({ transactionId: 'tx123' })

    // Verify transaction status was NOT updated
    expect(mockUpdateTransactionStatus).not.toHaveBeenCalled()

    // Verify registration was NOT retrieved
    expect(mockGetRegistration).not.toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockUpdate).not.toHaveBeenCalled()

    // Verify event registrations were NOT updated
    expect(mockUpdateRegistrations).not.toHaveBeenCalled()

    // Verify receipt email was NOT sent
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()

    // Verify response was NOT returned
    expect(mockResponse).not.toHaveBeenCalled()
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
    expect(mockRead).not.toHaveBeenCalled()

    // Verify transaction status was NOT updated
    expect(mockUpdateTransactionStatus).not.toHaveBeenCalled()

    // Verify registration was NOT retrieved
    expect(mockGetRegistration).not.toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockUpdate).not.toHaveBeenCalled()

    // Verify event registrations were NOT updated
    expect(mockUpdateRegistrations).not.toHaveBeenCalled()

    // Verify receipt email was NOT sent
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()

    // Verify response was NOT returned
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('handles receipt email sending failure gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const emailError = new Error('Failed to send email')
    mockSendTemplatedMail.mockRejectedValueOnce(emailError)

    await paymentSuccessLambda(event)

    // Verify console.error was called with the expected message
    expect(consoleSpy).toHaveBeenCalledWith('failed to send receipt', emailError)

    // Verify confirmation email was still sent
    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'registration',
      'fi',
      expect.any(String), // emailFrom
      expect.any(Array), // to
      expect.any(Object) // data
    )

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)

    consoleSpy.mockRestore()
  })

  it('adds amount to existing paidAmount if present', async () => {
    mockGetRegistration.mockResolvedValueOnce({
      eventId: 'event123',
      id: 'reg456',
      paymentStatus: 'PENDING',
      language: 'fi',
      paidAmount: 20, // Already paid 20 EUR
      payer: {
        email: 'test@example.com',
      },
    })

    await paymentSuccessLambda(event)

    // Verify registration payment status was updated with correct paidAmount
    expect(mockUpdate).toHaveBeenCalledWith(
      { eventId: 'event123', id: 'reg456' },
      {
        set: {
          paidAmount: 70, // 20 + (5000 / 100)
          paidAt: expect.any(String),
          paymentStatus: 'SUCCESS',
          state: 'ready',
          confirmed: false,
        },
      },
      expect.any(String) // registrationTable
    )
  })
})
