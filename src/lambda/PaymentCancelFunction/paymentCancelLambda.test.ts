import { jest } from '@jest/globals'

const mockLambda = jest.fn((name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockParseParams = jest.fn<any>()
const mockVerifyParams = jest.fn<any>()
const mockUpdateTransactionStatus = jest.fn<any>()
const mockGetRegistration = jest.fn<any>()
const mockAudit = jest.fn<any>()
const mockRegistrationAuditKey = jest.fn<any>()
const mockFormatMoney = jest.fn<any>()
const mockGetProviderName = jest.fn<any>()
const mockRead = jest.fn<any>()
const mockUpdate = jest.fn<any>()

jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
  LambdaError: class LambdaError extends Error {
    status: number
    error: string | undefined
    constructor(status: number, error: string | undefined) {
      super(`${status} ${error}`)
      this.status = status
      this.error = error
    }
  },
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

jest.unstable_mockModule('../../lib/money', () => ({
  formatMoney: mockFormatMoney,
}))

jest.unstable_mockModule('../../lib/payment', () => ({
  getProviderName: mockGetProviderName,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    read: mockRead,
    update: mockUpdate,
  })),
}))

const { default: paymentCancelLambda } = await import('./handler')

describe('paymentCancelLambda', () => {
  const event = {
    queryStringParameters: {
      'checkout-transaction-id': 'tx123',
      'checkout-reference': 'event123:reg456',
      'checkout-provider': 'paytrail',
      'checkout-status': 'fail',
    },
    headers: {},
    body: '',
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Spy on console methods to prevent logs from being displayed
    jest.spyOn(console, 'log').mockImplementation(() => {})

    // Default mock implementations
    mockParseParams.mockReturnValue({
      eventId: 'event123',
      registrationId: 'reg456',
      transactionId: 'tx123',
      provider: 'paytrail',
      status: 'fail',
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
    })

    mockUpdateTransactionStatus.mockResolvedValue(true)

    mockUpdate.mockResolvedValue({})

    mockRegistrationAuditKey.mockReturnValue('event123:reg456')

    mockFormatMoney.mockReturnValue('50,00 €')

    mockGetProviderName.mockReturnValue('Paytrail')
  })

  it('processes a cancelled payment correctly', async () => {
    await paymentCancelLambda(event)

    // Verify params were parsed and verified
    expect(mockParseParams).toHaveBeenCalledWith(event.queryStringParameters)
    expect(mockVerifyParams).toHaveBeenCalledWith(event.queryStringParameters)

    // Verify transaction was retrieved
    expect(mockRead).toHaveBeenCalledWith({ transactionId: 'tx123' })

    // Verify registration was retrieved
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')

    // Verify transaction status was updated
    expect(mockUpdateTransactionStatus).toHaveBeenCalledWith(
      {
        transactionId: 'tx123',
        reference: 'event123:reg456',
        amount: 5000,
        status: 'pending',
        user: 'user123',
      },
      'fail',
      'paytrail'
    )

    // Verify registration payment status was updated
    expect(mockUpdate).toHaveBeenCalledWith(
      { eventId: 'event123', id: 'reg456' },
      {
        set: {
          paymentStatus: 'CANCEL',
        },
      },
      expect.any(String) // registrationTable
    )

    // Verify audit entry was created
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event123:reg456',
      message: 'Maksu epäonnistui (Paytrail), 50,00 €',
      user: 'user123',
    })

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('does not update registration if payment status is not PENDING', async () => {
    mockGetRegistration.mockResolvedValueOnce({
      eventId: 'event123',
      id: 'reg456',
      paymentStatus: 'CANCEL', // Already cancelled
    })

    await paymentCancelLambda(event)

    // Verify transaction status was updated
    expect(mockUpdateTransactionStatus).toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockUpdate).not.toHaveBeenCalled()

    // Verify audit entry was still created
    expect(mockAudit).toHaveBeenCalled()

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('does not update or audit if transaction status update returns false', async () => {
    mockUpdateTransactionStatus.mockResolvedValueOnce(false)

    await paymentCancelLambda(event)

    // Verify transaction status was attempted to be updated
    expect(mockUpdateTransactionStatus).toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockUpdate).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('throws 404 error if transaction is not found', async () => {
    mockRead.mockResolvedValueOnce(null)

    await expect(paymentCancelLambda(event)).rejects.toThrow("404 Transaction with id 'tx123' was not found")

    // Verify transaction was attempted to be retrieved
    expect(mockRead).toHaveBeenCalledWith({ transactionId: 'tx123' })

    // Verify registration was NOT retrieved
    expect(mockGetRegistration).not.toHaveBeenCalled()

    // Verify transaction status was NOT updated
    expect(mockUpdateTransactionStatus).not.toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockUpdate).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()

    // Verify response was NOT returned
    expect(mockResponse).not.toHaveBeenCalled()
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
    expect(mockRead).not.toHaveBeenCalled()

    // Verify registration was NOT retrieved
    expect(mockGetRegistration).not.toHaveBeenCalled()

    // Verify transaction status was NOT updated
    expect(mockUpdateTransactionStatus).not.toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockUpdate).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()

    // Verify response was NOT returned
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('passes through errors from getRegistration', async () => {
    const error = new Error('Registration not found')
    mockGetRegistration.mockRejectedValueOnce(error)

    await expect(paymentCancelLambda(event)).rejects.toThrow(error)

    // Verify transaction was retrieved
    expect(mockRead).toHaveBeenCalledWith({ transactionId: 'tx123' })

    // Verify registration retrieval was attempted
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')

    // Verify transaction status was NOT updated
    expect(mockUpdateTransactionStatus).not.toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockUpdate).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()

    // Verify response was NOT returned
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('passes through errors from updateTransactionStatus', async () => {
    const error = new Error('Update failed')
    mockUpdateTransactionStatus.mockRejectedValueOnce(error)

    await expect(paymentCancelLambda(event)).rejects.toThrow(error)

    // Verify transaction was retrieved
    expect(mockRead).toHaveBeenCalledWith({ transactionId: 'tx123' })

    // Verify registration was retrieved
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')

    // Verify transaction status update was attempted
    expect(mockUpdateTransactionStatus).toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockUpdate).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()

    // Verify response was NOT returned
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('logs a message if transaction is already marked as failed', async () => {
    mockUpdateTransactionStatus.mockResolvedValueOnce(false)

    await paymentCancelLambda(event)

    // Verify console.log was called with the expected message
    expect(console.log).toHaveBeenCalledWith("Transaction 'tx123' already marked as failed")

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })
})
