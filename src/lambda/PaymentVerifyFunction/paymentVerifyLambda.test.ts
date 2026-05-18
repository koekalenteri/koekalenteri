import { jest } from '@jest/globals'

const mockParseParams = jest.fn<any>()
const mockVerifyParams = jest.fn<any>()
const mockGetRegistration = jest.fn<any>()
const mockAudit = jest.fn<any>()
const mockRegistrationAuditKey = jest.fn<any>()
const mockFormatMoney = jest.fn<any>()
const mockGetProviderName = jest.fn<any>()
const mockGetById = jest.fn<any>()
const mockApplyPaymentCancel = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()

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
    getById: mockGetById,
  },
}))

jest.unstable_mockModule('../registration/actions', () => ({
  createApplyPaymentCancel: jest.fn(() => mockApplyPaymentCancel),
}))

jest.unstable_mockModule('../registration/repository', () => ({
  registrationRepository: {},
}))

jest.unstable_mockModule('../lib/json', () => ({
  parseJSONWithFallback: mockParseJSONWithFallback,
}))

const { paymentVerifyLambda } = await import('./handler')

describe('paymentVerifyLambda', () => {
  const event = {
    body: JSON.stringify({
      'checkout-amount': '5000',
      'checkout-provider': 'paytrail',
      'checkout-reference': 'event123:reg456',
      'checkout-status': 'ok',
      'checkout-transaction-id': 'tx123',
    }),
    headers: {},
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockParseJSONWithFallback.mockReturnValue({
      'checkout-amount': '5000',
      'checkout-provider': 'paytrail',
      'checkout-reference': 'event123:reg456',
      'checkout-status': 'ok',
      'checkout-transaction-id': 'tx123',
    })

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

    mockRegistrationAuditKey.mockReturnValue('event123:reg456')

    mockFormatMoney.mockReturnValue('50,00 €')

    mockGetProviderName.mockReturnValue('Paytrail')

    mockApplyPaymentCancel.mockResolvedValue({})
  })

  it('verifies a successful payment correctly', async () => {
    const result = await paymentVerifyLambda(event)

    // Verify body was parsed
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)

    // Verify params were parsed and verified
    expect(mockParseParams).toHaveBeenCalledWith({
      'checkout-amount': '5000',
      'checkout-provider': 'paytrail',
      'checkout-reference': 'event123:reg456',
      'checkout-status': 'ok',
      'checkout-transaction-id': 'tx123',
    })
    expect(mockVerifyParams).toHaveBeenCalledWith({
      'checkout-amount': '5000',
      'checkout-provider': 'paytrail',
      'checkout-reference': 'event123:reg456',
      'checkout-status': 'ok',
      'checkout-transaction-id': 'tx123',
    })

    // Verify transaction was retrieved
    expect(mockGetById).toHaveBeenCalledWith('tx123')

    // Verify registration was NOT retrieved for successful payment
    expect(mockGetRegistration).not.toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockApplyPaymentCancel).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()

    expect(result.statusCode).toBe(200)
  })

  it('handles a failed payment correctly', async () => {
    mockParseParams.mockReturnValueOnce({
      eventId: 'event123',
      provider: 'paytrail',
      registrationId: 'reg456',
      status: 'fail',
      transactionId: 'tx123',
    })

    const result = await paymentVerifyLambda(event)

    // Verify transaction was retrieved
    expect(mockGetById).toHaveBeenCalledWith('tx123')

    // Verify registration was retrieved for failed payment
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')

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
    mockParseParams.mockReturnValueOnce({
      eventId: 'event123',
      provider: 'paytrail',
      registrationId: 'reg456',
      status: 'fail',
      transactionId: 'tx123',
    })

    mockGetRegistration.mockResolvedValueOnce({
      eventId: 'event123',
      id: 'reg456',
      paymentStatus: 'CANCEL', // Already cancelled
    })

    const result = await paymentVerifyLambda(event)

    // Verify registration was retrieved
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')

    // Verify registration payment status was NOT updated
    expect(mockApplyPaymentCancel).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()

    expect(result.statusCode).toBe(200)
  })

  it('throws error if transaction is not found', async () => {
    mockGetById.mockResolvedValueOnce(null)
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const result = await paymentVerifyLambda(event)

    // Verify transaction was attempted to be retrieved
    expect(mockGetById).toHaveBeenCalledWith('tx123')

    // Verify error was logged
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()

    expect(result.statusCode).toBe(200)
  })

  it('handles verification errors gracefully', async () => {
    const error = new Error('Verification failed')
    mockVerifyParams.mockRejectedValueOnce(error)
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const result = await paymentVerifyLambda(event)

    // Verify error was logged
    expect(consoleSpy).toHaveBeenCalledWith(error)

    expect(result.statusCode).toBe(200)

    consoleSpy.mockRestore()
  })

  it('handles other errors gracefully', async () => {
    const error = new Error('Unexpected error')
    mockGetById.mockRejectedValueOnce(error)
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const result = await paymentVerifyLambda(event)

    // Verify error was logged
    expect(consoleSpy).toHaveBeenCalledWith(error)

    expect(result.statusCode).toBe(200)

    consoleSpy.mockRestore()
  })
})
