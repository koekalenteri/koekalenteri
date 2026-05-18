import { jest } from '@jest/globals'

const mockParseParams = jest.fn<any>()
const mockVerifyParams = jest.fn<any>()
const mockUpdateTransactionStatus = jest.fn<any>()
const mockGetRegistration = jest.fn<any>()
const mockAudit = jest.fn<any>()
const mockRegistrationAuditKey = jest.fn<any>()
const mockFormatMoney = jest.fn<any>()
const mockGetProviderName = jest.fn<any>()
const mockGetById = jest.fn<any>()
const mockApplyPaymentCancel = jest.fn<any>()

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

jest.unstable_mockModule('../../lib/money', () => ({
  formatMoney: mockFormatMoney,
}))

jest.unstable_mockModule('../../lib/payment', () => ({
  getProviderName: mockGetProviderName,
}))

jest.unstable_mockModule('../payment/repository', () => ({
  paymentTransactionRepository: {
    getPaymentById: mockGetById,
    patchStatus: mockUpdateTransactionStatus,
  },
}))

jest.unstable_mockModule('../registration/actions', () => ({
  createApplyPaymentCancel: jest.fn(() => mockApplyPaymentCancel),
}))

jest.unstable_mockModule('../registration/repository', () => ({
  registrationRepository: {},
}))

const { paymentCancelLambda } = await import('./handler')

describe('paymentCancelLambda', () => {
  const event = {
    body: '',
    headers: {},
    queryStringParameters: {
      'checkout-provider': 'paytrail',
      'checkout-reference': 'event123:reg456',
      'checkout-status': 'fail',
      'checkout-transaction-id': 'tx123',
    },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Spy on console methods to prevent logs from being displayed
    jest.spyOn(console, 'log').mockImplementation(() => {})

    // Default mock implementations
    mockParseParams.mockReturnValue({
      eventId: 'event123',
      provider: 'paytrail',
      registrationId: 'reg456',
      status: 'fail',
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

    mockGetRegistration.mockResolvedValue({
      eventId: 'event123',
      id: 'reg456',
      paymentStatus: 'PENDING',
    })

    mockUpdateTransactionStatus.mockResolvedValue(true)

    mockApplyPaymentCancel.mockResolvedValue({})

    mockRegistrationAuditKey.mockReturnValue('event123:reg456')

    mockFormatMoney.mockReturnValue('50,00 €')

    mockGetProviderName.mockReturnValue('Paytrail')
  })

  it('processes a cancelled payment correctly', async () => {
    const result = await paymentCancelLambda(event)

    // Verify params were parsed and verified
    expect(mockParseParams).toHaveBeenCalledWith(event.queryStringParameters)
    expect(mockVerifyParams).toHaveBeenCalledWith(event.queryStringParameters)

    // Verify transaction was retrieved
    expect(mockGetById).toHaveBeenCalledWith('tx123')

    // Verify registration was retrieved
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')

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
      { provider: 'paytrail', status: 'fail' }
    )

    // Verify registration payment status was updated
    expect(mockApplyPaymentCancel).toHaveBeenCalledWith({ eventId: 'event123', registrationId: 'reg456' })

    // Verify audit entry was created
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event123:reg456',
      message: 'Maksu epäonnistui (Paytrail), 50,00 €',
      user: 'user123',
    })

    expect(result.statusCode).toBe(200)
  })

  it('does not update registration if payment status is not PENDING', async () => {
    mockGetRegistration.mockResolvedValueOnce({
      eventId: 'event123',
      id: 'reg456',
      paymentStatus: 'CANCEL', // Already cancelled
    })

    const result = await paymentCancelLambda(event)

    // Verify transaction status was updated
    expect(mockUpdateTransactionStatus).toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockApplyPaymentCancel).toHaveBeenCalled()

    // Verify audit entry was still created
    expect(mockAudit).toHaveBeenCalled()

    expect(result.statusCode).toBe(200)
  })

  it('does not update or audit if transaction status update returns false', async () => {
    mockUpdateTransactionStatus.mockResolvedValueOnce(false)

    const result = await paymentCancelLambda(event)

    // Verify transaction status was attempted to be updated
    expect(mockUpdateTransactionStatus).toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockApplyPaymentCancel).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()

    expect(result.statusCode).toBe(200)
  })

  it('throws 404 error if transaction is not found', async () => {
    mockGetById.mockRejectedValueOnce(new Error("404 Transaction with id 'tx123' was not found"))

    await expect(paymentCancelLambda(event)).rejects.toThrow("404 Transaction with id 'tx123' was not found")

    // Verify transaction was attempted to be retrieved
    expect(mockGetById).toHaveBeenCalledWith('tx123')

    // Verify registration was NOT retrieved
    expect(mockGetRegistration).not.toHaveBeenCalled()

    // Verify transaction status was NOT updated
    expect(mockUpdateTransactionStatus).not.toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockApplyPaymentCancel).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('passes through errors from verifyParams', async () => {
    const error = new Error('Verification failed')
    mockVerifyParams.mockRejectedValueOnce(error)

    await expect(paymentCancelLambda(event)).rejects.toThrow(error)

    // Verify params were parsed
    expect(mockParseParams).toHaveBeenCalledWith(event.queryStringParameters)

    // Verify params verification was attempted
    expect(mockVerifyParams).toHaveBeenCalledWith(event.queryStringParameters)

    // Verify transaction was NOT retrieved
    expect(mockGetById).not.toHaveBeenCalled()

    // Verify registration was NOT retrieved
    expect(mockGetRegistration).not.toHaveBeenCalled()

    // Verify transaction status was NOT updated
    expect(mockUpdateTransactionStatus).not.toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockApplyPaymentCancel).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('passes through errors from getRegistration', async () => {
    const error = new Error('Registration not found')
    mockGetRegistration.mockRejectedValueOnce(error)

    await expect(paymentCancelLambda(event)).rejects.toThrow(error)

    // Verify transaction was retrieved
    expect(mockGetById).toHaveBeenCalledWith('tx123')

    // Verify registration retrieval was attempted
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')

    // Verify transaction status was NOT updated
    expect(mockUpdateTransactionStatus).not.toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockApplyPaymentCancel).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('passes through errors from updateTransactionStatus', async () => {
    const error = new Error('Update failed')
    mockUpdateTransactionStatus.mockRejectedValueOnce(error)

    await expect(paymentCancelLambda(event)).rejects.toThrow(error)

    // Verify transaction was retrieved
    expect(mockGetById).toHaveBeenCalledWith('tx123')

    // Verify registration was retrieved
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')

    // Verify transaction status update was attempted
    expect(mockUpdateTransactionStatus).toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockApplyPaymentCancel).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('logs a message if transaction is already marked as failed', async () => {
    mockUpdateTransactionStatus.mockResolvedValueOnce(false)

    const result = await paymentCancelLambda(event)

    // Verify console.log was called with the expected message
    expect(console.log).toHaveBeenCalledWith("Transaction 'tx123' already marked as failed")

    expect(result.statusCode).toBe(200)
  })
})
