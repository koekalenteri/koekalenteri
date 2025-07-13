import { jest } from '@jest/globals'

const mockLambda = jest.fn((name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockAuthorize = jest.fn<any>()
const mockGetEvent = jest.fn<any>()
const mockGetRegistration = jest.fn<any>()
const mockPaymentDescription = jest.fn<any>()
const mockCreatePayment = jest.fn<any>()
const mockSplitName = jest.fn<any>()
const mockGetApiHost = jest.fn<any>()
const mockGetOrigin = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()
const mockRead = jest.fn<any>()
const mockWrite = jest.fn<any>()
const mockUpdate = jest.fn<any>()

jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

jest.unstable_mockModule('../lib/registration', () => ({
  getRegistration: mockGetRegistration,
}))

jest.unstable_mockModule('../lib/payment', () => ({
  paymentDescription: mockPaymentDescription,
}))

jest.unstable_mockModule('../lib/paytrail', () => ({
  createPayment: mockCreatePayment,
}))

jest.unstable_mockModule('../lib/string', () => ({
  splitName: mockSplitName,
}))

jest.unstable_mockModule('../utils/proxyEvent', () => ({
  getApiHost: mockGetApiHost,
}))

jest.unstable_mockModule('../lib/api-gw', () => ({
  getOrigin: mockGetOrigin,
}))

jest.unstable_mockModule('../lib/json', () => ({
  parseJSONWithFallback: mockParseJSONWithFallback,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    read: mockRead,
    write: mockWrite,
    update: mockUpdate,
  })),
}))

const { default: paymentCreateLambda } = await import('./handler')

describe('paymentCreateLambda', () => {
  const event = {
    body: JSON.stringify({
      eventId: 'event123',
      registrationId: 'reg456',
    }),
    headers: {},
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockParseJSONWithFallback.mockReturnValue({
      eventId: 'event123',
      registrationId: 'reg456',
    })

    mockGetEvent.mockResolvedValue({
      id: 'event123',
      organizer: { id: 'org789', name: 'Test Organizer' },
      cost: 50,
      costMember: 40,
      name: 'Test Event',
      location: 'Test Location',
      startDate: '2025-01-01',
      endDate: '2025-01-02',
      eventType: 'Test Type',
    })

    mockGetRegistration.mockResolvedValue({
      eventId: 'event123',
      id: 'reg456',
      payer: {
        name: 'Test Payer',
        email: 'test@example.com',
        phone: '1234567890',
      },
      handler: { membership: true },
      owner: { membership: false },
      cancelled: false,
      paidAmount: 0,
    })

    mockRead.mockResolvedValue({
      id: 'org789',
      name: 'Test Organizer',
      paytrailMerchantId: 'merchant123',
    })

    mockSplitName.mockReturnValue({
      firstName: 'Test',
      lastName: 'Payer',
    })

    mockPaymentDescription.mockReturnValue('Test Type 1.1.-2.1. Test Location Test Event')

    mockGetApiHost.mockReturnValue('api.example.com')

    mockGetOrigin.mockReturnValue('https://example.com')

    mockCreatePayment.mockResolvedValue({
      transactionId: 'tx123',
      href: 'https://payment.example.com/tx123',
      reference: 'ref123',
      terms: 'terms',
      groups: [],
      providers: [],
    })

    mockAuthorize.mockResolvedValue({
      id: 'user123',
      name: 'Test User',
    })

    mockWrite.mockResolvedValue({})

    mockUpdate.mockResolvedValue({})
  })

  it('creates a payment successfully for a member with discount', async () => {
    await paymentCreateLambda(event)

    // Verify event and registration were retrieved
    expect(mockGetEvent).toHaveBeenCalledWith('event123')
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')

    // Verify organizer was retrieved
    expect(mockRead).toHaveBeenCalledWith({ id: 'org789' }, expect.any(String))

    // Verify payment was created with correct parameters
    expect(mockCreatePayment).toHaveBeenCalledWith(
      'api.example.com',
      'https://example.com',
      4000, // 40 EUR * 100 (member price)
      'event123:reg456',
      expect.any(String),
      [
        {
          unitPrice: 4000,
          units: 1,
          vatPercentage: 0,
          productCode: 'event123',
          description: 'Test Type 1.1.-2.1. Test Location Test Event',
          stamp: expect.any(String),
          reference: 'reg456',
          merchant: 'merchant123',
        },
      ],
      {
        email: 'test@example.com.local',
        firstName: 'Test',
        lastName: 'Payer',
        phone: '1234567890',
      }
    )

    // Verify transaction was written to database
    expect(mockWrite).toHaveBeenCalledWith({
      transactionId: 'tx123',
      status: 'new',
      amount: 4000,
      reference: 'event123:reg456',
      bankReference: 'ref123',
      type: 'payment',
      stamp: expect.any(String),
      items: expect.any(Array),
      createdAt: expect.any(String),
      user: 'Test User',
    })

    // Verify registration was updated
    expect(mockUpdate).toHaveBeenCalledWith(
      { eventId: 'event123', id: 'reg456' },
      {
        set: {
          paymentStatus: 'PENDING',
        },
      },
      expect.any(String)
    )

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        transactionId: 'tx123',
        href: 'https://payment.example.com/tx123',
        reference: 'ref123',
        terms: 'terms',
        groups: [],
        providers: [],
      },
      event
    )
  })

  it('creates a payment with regular price for non-member', async () => {
    mockGetRegistration.mockResolvedValueOnce({
      eventId: 'event123',
      id: 'reg456',
      payer: {
        name: 'Test Payer',
        email: 'test@example.com',
        phone: '1234567890',
      },
      handler: { membership: false },
      owner: { membership: false },
      cancelled: false,
      paidAmount: 0,
    })

    await paymentCreateLambda(event)

    // Verify payment was created with correct amount (regular price)
    expect(mockCreatePayment).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      5000, // 50 EUR * 100 (regular price)
      expect.any(String),
      expect.any(String),
      expect.any(Array),
      expect.any(Object)
    )
  })

  it('returns 404 if registration is cancelled', async () => {
    mockGetRegistration.mockResolvedValueOnce({
      eventId: 'event123',
      id: 'reg456',
      cancelled: true,
    })

    await paymentCreateLambda(event)

    // Verify response was returned with 404
    expect(mockResponse).toHaveBeenCalledWith(404, 'Registration not found', event)

    // Verify payment was not created
    expect(mockCreatePayment).not.toHaveBeenCalled()
  })

  it('returns 412 if organizer does not have MerchantId', async () => {
    mockRead.mockResolvedValueOnce({
      id: 'org789',
      name: 'Test Organizer',
      // No paytrailMerchantId
    })

    await paymentCreateLambda(event)

    // Verify response was returned with 412
    expect(mockResponse).toHaveBeenCalledWith(412, 'Organizer org789 does not have MerchantId!', event)

    // Verify payment was not created
    expect(mockCreatePayment).not.toHaveBeenCalled()
  })

  it('returns 204 if registration is already paid', async () => {
    mockGetRegistration.mockResolvedValueOnce({
      eventId: 'event123',
      id: 'reg456',
      payer: {
        name: 'Test Payer',
        email: 'test@example.com',
        phone: '1234567890',
      },
      handler: { membership: true },
      owner: { membership: false },
      cancelled: false,
      paidAmount: 50, // Already paid full amount
    })

    await paymentCreateLambda(event)

    // Verify response was returned with 204
    expect(mockResponse).toHaveBeenCalledWith(204, 'Already paid', event)

    // Verify payment was not created
    expect(mockCreatePayment).not.toHaveBeenCalled()
  })

  it('returns 500 if payment creation fails', async () => {
    mockCreatePayment.mockResolvedValueOnce(null)

    await paymentCreateLambda(event)

    // Verify response was returned with 500
    expect(mockResponse).toHaveBeenCalledWith(500, undefined, event)

    // Verify transaction was not written
    expect(mockWrite).not.toHaveBeenCalled()

    // Verify registration was not updated
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('calculates partial payment correctly if some amount is already paid', async () => {
    mockGetRegistration.mockResolvedValueOnce({
      eventId: 'event123',
      id: 'reg456',
      payer: {
        name: 'Test Payer',
        email: 'test@example.com',
        phone: '1234567890',
      },
      handler: { membership: true },
      owner: { membership: false },
      cancelled: false,
      paidAmount: 20, // Already paid 20 EUR
    })

    await paymentCreateLambda(event)

    // Verify payment was created with correct amount (member price - already paid)
    expect(mockCreatePayment).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      2000, // (40 EUR - 20 EUR) * 100
      expect.any(String),
      expect.any(String),
      expect.any(Array),
      expect.any(Object)
    )
  })

  it('uses anonymous user if authorization fails', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    await paymentCreateLambda(event)

    // Verify transaction was written with payer name instead of user name
    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'Test Payer', // Payer name instead of user name
      })
    )
  })

  it('calculates the correct amount for a complex cost structure', async () => {
    mockGetEvent.mockResolvedValueOnce({
      id: 'event123',
      organizer: { id: 'org789', name: 'Test Organizer' },
      cost: {
        normal: 50,
        earlyBird: { cost: 40, days: 5 },
        breed: { '110': 45 },
        custom: { cost: 30, description: { fi: 'Custom' } },
        optionalAdditionalCosts: [
          { cost: 5, description: { fi: 'Option 1' } },
          { cost: 10, description: { fi: 'Option 2' } },
        ],
      },
      costMember: 40,
      name: 'Test Event',
      location: 'Test Location',
      startDate: '2025-01-01',
      endDate: '2025-01-02',
      eventType: 'Test Type',
      entryStartDate: new Date().toISOString(),
    })

    mockGetRegistration.mockResolvedValueOnce({
      eventId: 'event123',
      id: 'reg456',
      payer: {
        name: 'Test Payer',
        email: 'test@example.com',
        phone: '1234567890',
      },
      handler: { membership: false },
      owner: { membership: false },
      cancelled: false,
      paidAmount: 0,
      dog: { breedCode: '110' },
      selectedCost: 'custom',
      optionalCosts: [0, 1],
      createdAt: new Date().toISOString(),
    })

    await paymentCreateLambda(event)

    expect(mockCreatePayment).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      4500, // 30 (custom) + 5 + 10 = 45 * 100
      expect.any(String),
      expect.any(String),
      expect.any(Array),
      expect.any(Object)
    )
  })
})
