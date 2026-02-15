import type { CreatePaymentResponse, JsonConfirmedEvent, JsonRegistration, Organizer } from '../../types'
import { jest } from '@jest/globals'
import { constructAPIGwEvent } from '../test-utils/helpers'

// --- Mock setup ---
const mockAuthorize = jest.fn<() => Promise<{ id: string; name: string } | null>>()
const mockGetEvent = jest.fn<() => Promise<JsonConfirmedEvent | undefined>>()
const mockCreatePayment = jest.fn<() => Promise<CreatePaymentResponse | null>>()
const mockGetTransactionsByReference = jest.fn<() => Promise<any[] | undefined>>()
const mockUpdateTransactionStatus = jest.fn<() => Promise<boolean>>()
const mockRead = jest.fn<() => Promise<JsonRegistration | Organizer | undefined>>()
const mockWrite = jest.fn()
const mockUpdate = jest.fn()

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

jest.unstable_mockModule('../lib/paytrail', () => ({
  calculateHmac: jest.fn(),
  createPayment: mockCreatePayment,
  HMAC_KEY_PREFIX: 'checkout-',
}))

jest.unstable_mockModule('../lib/payment', () => ({
  getTransactionsByReference: mockGetTransactionsByReference,
  paymentDescription: jest.fn(() => 'Test Type 1.–2.1. Test Location Test Event'),
  updateTransactionStatus: mockUpdateTransactionStatus,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    read: mockRead,
    update: mockUpdate,
    write: mockWrite,
  })),
}))

const { default: paymentCreateLambda } = await import('./handler')

// --- Test Data Factories ---

const createMockConfirmedEvent = (overrides: Partial<JsonConfirmedEvent> = {}): JsonConfirmedEvent => ({
  classes: [],
  contactInfo: {},
  cost: 50,
  costMember: 40,
  createdAt: '2025-01-01T00:00:00.000Z',
  createdBy: 'test-user',
  description: '',
  endDate: '2025-01-02',
  entries: 0,
  entryEndDate: '2025-01-01',
  entryStartDate: '2025-01-01',
  eventType: 'Test Type',
  id: 'event123',
  judges: [],
  location: 'Test Location',
  modifiedAt: '2025-01-01T00:00:00.000Z',
  modifiedBy: 'test-user',
  name: 'Test Event',
  official: { email: 'official@example.com', name: 'official' },
  organizer: { id: 'org789', name: 'Test Organizer' },
  places: 10,
  secretary: { email: 'secretary@example.com', name: 'secretary' },
  startDate: '2025-01-01',
  state: 'confirmed',
  ...overrides,
})

const createMockRegistration = (overrides: Partial<JsonRegistration> = {}): JsonRegistration => ({
  agreeToTerms: true,
  breeder: { name: 'Test Breeder' },
  cancelled: false,
  class: 'AVO',
  createdAt: '2025-01-01T00:00:00.000Z',
  createdBy: 'test-user',
  dates: [],
  dog: {} as any,
  eventId: 'event123',
  eventType: 'Test Type',
  handler: { email: 'handler@exmaple.com', membership: true, name: 'Test Handler' },
  id: 'reg456',
  language: 'fi',
  modifiedAt: '2025-01-01T00:00:00.000Z',
  modifiedBy: 'test-user',
  notes: '',
  owner: { email: 'owner@example.com', membership: false, name: 'Test Owner' },
  paidAmount: 0,
  payer: {
    email: 'test@example.com',
    name: 'Test Payer',
    phone: '1234567890',
  },
  paymentStatus: 'PENDING',
  qualifyingResults: [],
  reserve: '',
  state: 'ready',
  ...overrides,
})

const createMockOrganizer = (overrides: Partial<Organizer> = {}): Organizer => ({
  id: 'org789',
  name: 'Test Organizer',
  paytrailMerchantId: 'merchant123',
  ...overrides,
})

const createMockPaymentResponse = (overrides: Partial<CreatePaymentResponse> = {}): CreatePaymentResponse => ({
  customProviders: {},
  groups: [],
  href: 'https://payment.example.com/tx123',
  providers: [],
  reference: 'ref123',
  terms: 'terms',
  transactionId: 'tx123',
  ...overrides,
})

// --- Test Suite ---

describe('paymentCreateLambda', () => {
  const event = constructAPIGwEvent(
    {
      eventId: 'event123',
      registrationId: 'reg456',
    },
    {
      headers: {
        Host: 'api.example.com',
        origin: 'https://example.com',
      },
    }
  )

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'debug').mockImplementation(() => {})

    // Default mock implementations
    mockGetEvent.mockResolvedValue(createMockConfirmedEvent())
    mockRead
      .mockResolvedValueOnce(createMockRegistration()) // for getRegistration
      .mockResolvedValueOnce(createMockOrganizer()) // for organizer
    mockCreatePayment.mockResolvedValue(createMockPaymentResponse())
    mockAuthorize.mockResolvedValue({ id: 'user123', name: 'Test User' })
    mockGetTransactionsByReference.mockResolvedValue([])
    mockUpdateTransactionStatus.mockResolvedValue(true)
  })

  it('creates a payment successfully for a member', async () => {
    const result = await paymentCreateLambda(event)

    expect(mockGetEvent).toHaveBeenCalledWith('event123')
    expect(mockRead).toHaveBeenCalledWith({ eventId: 'event123', id: 'reg456' }, expect.any(String))
    expect(mockRead).toHaveBeenCalledWith({ id: 'org789' }, expect.any(String))

    const expectedAmount = 4000 // 40 EUR * 100

    expect(mockCreatePayment).toHaveBeenCalledWith({
      amount: 4000,
      apiHost: 'api.example.com/',
      customer: { email: 'test@example.com.local', firstName: 'Test', lastName: 'Payer', phone: '1234567890' },
      items: [
        {
          description: 'Test Type 1.–2.1. Test Location Test Event',
          merchant: 'merchant123',
          productCode: 'event123',
          reference: 'reg456',
          stamp: expect.any(String),
          unitPrice: 4000,
          units: 1,
          vatPercentage: 0,
        },
      ],
      language: 'FI',
      origin: 'https://example.com',
      reference: 'event123:reg456',
      stamp: expect.any(String),
    })

    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: expectedAmount,
        bankReference: 'ref123',
        reference: 'event123:reg456',
        status: 'new',
        transactionId: 'tx123',
        user: 'Test User',
      })
    )

    expect(mockUpdate).toHaveBeenCalledWith(
      { eventId: 'event123', id: 'reg456' },
      { set: { paymentStatus: 'PENDING' } }
    )

    expect(result.statusCode).toEqual(200)
    expect(JSON.parse(result.body)).toEqual(createMockPaymentResponse())
  })

  it('creates a payment with regular price for non-member', async () => {
    mockRead.mockReset()
    mockRead
      .mockResolvedValueOnce(
        createMockRegistration({ handler: { email: 'handler@exmaple.com', membership: false, name: 'Test Handler' } })
      )
      .mockResolvedValueOnce(createMockOrganizer())

    await paymentCreateLambda(event)

    expect(mockCreatePayment).toHaveBeenCalledWith({
      amount: 5000,
      apiHost: 'api.example.com/',
      customer: { email: 'test@example.com.local', firstName: 'Test', lastName: 'Payer', phone: '1234567890' },
      items: [
        {
          description: 'Test Type 1.–2.1. Test Location Test Event',
          merchant: 'merchant123',
          productCode: 'event123',
          reference: 'reg456',
          stamp: expect.any(String),
          unitPrice: 5000,
          units: 1,
          vatPercentage: 0,
        },
      ],
      language: 'FI',
      origin: 'https://example.com',
      reference: 'event123:reg456',
      stamp: expect.any(String),
    })
  })

  it('returns 404 if registration is cancelled', async () => {
    mockRead.mockReset()
    mockRead.mockResolvedValueOnce(createMockRegistration({ cancelled: true }))

    const result = await paymentCreateLambda(event)

    expect(result.statusCode).toEqual(404)
    expect(JSON.parse(result.body)).toEqual('Registration not found')
    expect(mockCreatePayment).not.toHaveBeenCalled()
  })

  it('returns 412 if organizer does not have MerchantId', async () => {
    mockRead.mockReset()
    mockRead
      .mockResolvedValueOnce(createMockRegistration())
      .mockResolvedValueOnce(createMockOrganizer({ paytrailMerchantId: undefined }))

    const result = await paymentCreateLambda(event)

    expect(result.statusCode).toEqual(412)
    expect(JSON.parse(result.body)).toEqual('Organizer org789 does not have MerchantId!')
    expect(mockCreatePayment).not.toHaveBeenCalled()
  })

  it('returns 204 if registration is already paid', async () => {
    mockRead.mockReset()
    mockRead
      .mockResolvedValueOnce(createMockRegistration({ paidAmount: 40 })) // cost is 40 for member
      .mockResolvedValueOnce(createMockOrganizer())

    const result = await paymentCreateLambda(event)

    expect(result.statusCode).toEqual(204)
    expect(JSON.parse(result.body)).toEqual('Already paid')
    expect(mockCreatePayment).not.toHaveBeenCalled()
  })

  it('returns 500 if payment creation fails', async () => {
    mockCreatePayment.mockResolvedValue(null)

    const result = await paymentCreateLambda(event)

    expect(result.statusCode).toEqual(500)
    expect(result.body).toBeUndefined()
    expect(mockWrite).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('calculates partial payment correctly if some amount is already paid', async () => {
    mockRead.mockReset()
    mockGetEvent.mockResolvedValue(
      createMockConfirmedEvent({
        cost: { earlyBird: { cost: 30, days: 1 }, normal: 50 },
        costMember: { earlyBird: { cost: 25, days: 1 }, normal: 40 },
      })
    )
    mockRead
      .mockResolvedValueOnce(createMockRegistration({ createdAt: '2024-12-31T00:00:00.000Z', paidAmount: 20 })) // member, earlybird
      .mockResolvedValueOnce(createMockOrganizer())

    await paymentCreateLambda(event)

    expect(mockCreatePayment).toHaveBeenCalledWith({
      amount: 500, // (25 EUR - 20 EUR) * 100
      apiHost: expect.any(String),
      customer: expect.any(Object),
      items: expect.any(Array),
      language: 'FI',
      origin: expect.any(String),
      reference: expect.any(String),
      stamp: expect.any(String),
    })
  })

  it('uses payer name for transaction if authorization fails', async () => {
    mockAuthorize.mockResolvedValue(null)

    await paymentCreateLambda(event)

    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'Test Payer',
      })
    )
  })

  it('creates a payment with custom cost', async () => {
    mockGetEvent.mockResolvedValue(
      createMockConfirmedEvent({
        cost: { custom: { cost: 60, description: { en: 'custom', fi: 'custom' } }, normal: 50 },
        costMember: { custom: { cost: 60, description: { en: 'custom', fi: 'custom' } }, normal: 40 },
      })
    )
    mockRead.mockReset()
    mockRead
      .mockResolvedValueOnce(createMockRegistration({ selectedCost: 'custom' }))
      .mockResolvedValueOnce(createMockOrganizer())

    await paymentCreateLambda(event)

    expect(mockCreatePayment).toHaveBeenCalledWith({
      amount: 6000,
      apiHost: 'api.example.com/',
      customer: {
        email: 'test@example.com.local',
        firstName: 'Test',
        lastName: 'Payer',
        phone: '1234567890',
      },
      items: [
        {
          description: 'Test Type 1.–2.1. Test Location Test Event',
          merchant: 'merchant123',
          productCode: 'event123',
          reference: 'reg456',
          stamp: expect.any(String),
          unitPrice: 6000,
          units: 1,
          vatPercentage: 0,
        },
      ],
      language: 'FI',
      origin: 'https://example.com',
      reference: 'event123:reg456',
      stamp: expect.any(String),
    })
  })

  it('should handle undefined paidAmount', async () => {
    mockRead.mockReset()
    mockRead
      .mockResolvedValueOnce(createMockRegistration({ paidAmount: undefined }))
      .mockResolvedValueOnce(createMockOrganizer())

    await paymentCreateLambda(event)

    expect(mockCreatePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 4000, // 40 EUR * 100
        language: 'FI',
      })
    )
  })

  it('should respect registration language', async () => {
    mockRead.mockReset()
    mockRead
      .mockResolvedValueOnce(createMockRegistration({ language: 'en' }))
      .mockResolvedValueOnce(createMockOrganizer())

    await paymentCreateLambda(event)

    expect(mockCreatePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 4000, // 40 EUR * 100
        language: 'EN',
      })
    )
  })

  it('should cancel existing new transactions for the same reference', async () => {
    const existingTransaction = { reference: 'event123:reg456', status: 'new', transactionId: 'oldTx' }
    mockGetTransactionsByReference.mockResolvedValue([existingTransaction])

    await paymentCreateLambda(event)

    expect(mockGetTransactionsByReference).toHaveBeenCalledWith('event123:reg456')
    expect(mockUpdateTransactionStatus).toHaveBeenCalledWith(existingTransaction, 'fail')
  })

  it('returns 403 if payment is after confirmation but registration is not confirmed', async () => {
    mockGetEvent.mockResolvedValue(createMockConfirmedEvent({ paymentTime: 'confirmation' }))
    mockRead.mockReset()
    mockRead.mockResolvedValueOnce(createMockRegistration({ confirmed: false }))

    const result = await paymentCreateLambda(event)

    expect(result.statusCode).toEqual(403)
    expect(JSON.parse(result.body)).toEqual('Payment not allowed - registration must be confirmed first')
    expect(mockCreatePayment).not.toHaveBeenCalled()
  })

  it('allows payment if payment is after confirmation and registration is confirmed', async () => {
    mockGetEvent.mockResolvedValue(createMockConfirmedEvent({ paymentTime: 'confirmation' }))
    mockRead.mockReset()
    mockRead
      .mockResolvedValueOnce(createMockRegistration({ confirmed: true }))
      .mockResolvedValueOnce(createMockOrganizer())

    const result = await paymentCreateLambda(event)

    expect(result.statusCode).toEqual(200)
    expect(mockCreatePayment).toHaveBeenCalled()
  })

  it('allows payment if payment is at registration time regardless of confirmation state', async () => {
    mockGetEvent.mockResolvedValue(createMockConfirmedEvent({ paymentTime: 'registration' }))
    mockRead.mockReset()
    mockRead
      .mockResolvedValueOnce(createMockRegistration({ confirmed: false }))
      .mockResolvedValueOnce(createMockOrganizer())

    const result = await paymentCreateLambda(event)

    expect(result.statusCode).toEqual(200)
    expect(mockCreatePayment).toHaveBeenCalled()
  })
})
