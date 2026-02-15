import { jest } from '@jest/globals'

const mockLambda = jest.fn((_name, fn) => fn)
const mockResponse = jest.fn<any>().mockImplementation((statusCode: number, body: any) => ({
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json' },
  statusCode,
}))
const mockParseParams = jest.fn<any>()
const mockVerifyParams = jest.fn<any>()
const mockGetRegistration = jest.fn<any>()
const mockAudit = jest.fn<any>()
const mockRegistrationAuditKey = jest.fn<any>()
const mockFormatMoney = jest.fn<any>()
const mockGetProviderName = jest.fn<any>()
const mockRead = jest.fn<any>()
const mockUpdate = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()

jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

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

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    read: mockRead,
    update: mockUpdate,
  })),
}))

jest.unstable_mockModule('../lib/json', () => ({
  parseJSONWithFallback: mockParseJSONWithFallback,
}))

const { default: paymentVerifyLambda } = await import('./handler')

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

    mockRead.mockResolvedValue({
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

    mockUpdate.mockResolvedValue({})
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
    expect(mockRead).toHaveBeenCalledWith({ transactionId: 'tx123' })

    // Verify registration was NOT retrieved for successful payment
    expect(mockGetRegistration).not.toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockUpdate).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        eventId: 'event123',
        paymentStatus: 'ok',
        registrationId: 'reg456',
        status: 'ok',
      },
      event
    )

    // Verify the result
    expect(result).toEqual(
      expect.objectContaining({
        body: expect.any(String),
        statusCode: 200,
      })
    )
  })

  it('handles a failed payment correctly', async () => {
    mockParseParams.mockReturnValueOnce({
      eventId: 'event123',
      provider: 'paytrail',
      registrationId: 'reg456',
      status: 'fail',
      transactionId: 'tx123',
    })

    await paymentVerifyLambda(event)

    // Verify transaction was retrieved
    expect(mockRead).toHaveBeenCalledWith({ transactionId: 'tx123' })

    // Verify registration was retrieved for failed payment
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')

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
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        eventId: 'event123',
        paymentStatus: 'fail',
        registrationId: 'reg456',
        status: 'error',
      },
      event
    )
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

    await paymentVerifyLambda(event)

    // Verify registration was retrieved
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')

    // Verify registration payment status was NOT updated
    expect(mockUpdate).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        eventId: 'event123',
        paymentStatus: 'fail',
        registrationId: 'reg456',
        status: 'error',
      },
      event
    )
  })

  it('throws error if transaction is not found', async () => {
    mockRead.mockResolvedValueOnce(null)
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await paymentVerifyLambda(event)

    // Verify transaction was attempted to be retrieved
    expect(mockRead).toHaveBeenCalledWith({ transactionId: 'tx123' })

    // Verify error was logged
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()

    // Verify response was returned with error status
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        eventId: 'event123',
        paymentStatus: 'ok',
        registrationId: 'reg456',
        status: 'error',
      },
      event
    )
  })

  it('handles verification errors gracefully', async () => {
    const error = new Error('Verification failed')
    mockVerifyParams.mockRejectedValueOnce(error)
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await paymentVerifyLambda(event)

    // Verify error was logged
    expect(consoleSpy).toHaveBeenCalledWith(error)

    // Verify response was returned with error status
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        eventId: 'event123',
        paymentStatus: 'ok',
        registrationId: 'reg456',
        status: 'error',
      },
      event
    )

    consoleSpy.mockRestore()
  })

  it('handles other errors gracefully', async () => {
    const error = new Error('Unexpected error')
    mockRead.mockRejectedValueOnce(error)
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await paymentVerifyLambda(event)

    // Verify error was logged
    expect(consoleSpy).toHaveBeenCalledWith(error)

    // Verify response was returned with error status
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        eventId: 'event123',
        paymentStatus: 'ok',
        registrationId: 'reg456',
        status: 'error',
      },
      event
    )

    consoleSpy.mockRestore()
  })
})
