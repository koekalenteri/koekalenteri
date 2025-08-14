import type { CreatePaymentResponse, JsonConfirmedEvent, JsonRegistration, Organizer } from '../../types'

import { jest } from '@jest/globals'

import { constructAPIGwEvent } from '../test-utils/helpers'

// --- Mock setup ---
const mockAuthorize = jest.fn<() => Promise<{ id: string; name: string } | null>>()
const mockGetEvent = jest.fn<() => Promise<JsonConfirmedEvent | undefined>>()
const mockCreatePayment = jest.fn<() => Promise<CreatePaymentResponse | null>>()
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
  createPayment: mockCreatePayment,
  HMAC_KEY_PREFIX: 'checkout-',
  calculateHmac: jest.fn(),
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    read: mockRead,
    write: mockWrite,
    update: mockUpdate,
  })),
}))

const { default: paymentCreateLambda } = await import('./handler')

// --- Test Data Factories ---

const createMockConfirmedEvent = (overrides: Partial<JsonConfirmedEvent> = {}): JsonConfirmedEvent => ({
  id: 'event123',
  organizer: { id: 'org789', name: 'Test Organizer' },
  cost: 50,
  costMember: 40,
  name: 'Test Event',
  location: 'Test Location',
  startDate: '2025-01-01',
  endDate: '2025-01-02',
  entryEndDate: '2025-01-01',
  entryStartDate: '2025-01-01',
  eventType: 'Test Type',
  classes: [],
  contactInfo: {},
  entries: 0,
  state: 'confirmed',
  createdAt: '2025-01-01T00:00:00.000Z',
  createdBy: 'test-user',
  judges: [],
  official: { name: 'official', email: 'official@example.com' },
  secretary: { name: 'secretary', email: 'secretary@example.com' },
  modifiedAt: '2025-01-01T00:00:00.000Z',
  modifiedBy: 'test-user',
  description: '',
  places: 10,
  ...overrides,
})

const createMockRegistration = (overrides: Partial<JsonRegistration> = {}): JsonRegistration => ({
  eventId: 'event123',
  id: 'reg456',
  payer: {
    name: 'Test Payer',
    email: 'test@example.com',
    phone: '1234567890',
  },
  handler: { name: 'Test Handler', email: 'handler@exmaple.com', membership: true },
  owner: { name: 'Test Owner', email: 'owner@example.com', membership: false },
  cancelled: false,
  paidAmount: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  createdBy: 'test-user',
  modifiedAt: '2025-01-01T00:00:00.000Z',
  modifiedBy: 'test-user',
  agreeToTerms: true,
  class: 'AVO',
  dog: {} as any,
  language: 'fi',
  notes: '',
  paymentStatus: 'PENDING',
  qualifyingResults: [],
  state: 'ready',
  breeder: { name: 'Test Breeder' },
  dates: [],
  eventType: 'Test Type',
  reserve: '',
  ...overrides,
})

const createMockOrganizer = (overrides: Partial<Organizer> = {}): Organizer => ({
  id: 'org789',
  name: 'Test Organizer',
  paytrailMerchantId: 'merchant123',
  ...overrides,
})

const createMockPaymentResponse = (overrides: Partial<CreatePaymentResponse> = {}): CreatePaymentResponse => ({
  transactionId: 'tx123',
  href: 'https://payment.example.com/tx123',
  reference: 'ref123',
  terms: 'terms',
  groups: [],
  providers: [],
  customProviders: {},
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
        origin: 'https://example.com',
        Host: 'api.example.com',
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
  })

  it('creates a payment successfully for a member', async () => {
    const result = await paymentCreateLambda(event)

    expect(mockGetEvent).toHaveBeenCalledWith('event123')
    expect(mockRead).toHaveBeenCalledWith({ eventId: 'event123', id: 'reg456' }, expect.any(String))
    expect(mockRead).toHaveBeenCalledWith({ id: 'org789' }, expect.any(String))

    const expectedAmount = 4000 // 40 EUR * 100

    expect(mockCreatePayment).toHaveBeenCalledWith(
      'api.example.com/',
      'https://example.com',
      expectedAmount,
      'event123:reg456',
      expect.any(String), // stamp
      [
        expect.objectContaining({
          unitPrice: expectedAmount,
          productCode: 'event123',
          description: 'Test Type 1.–2.1. Test Location Test Event',
          reference: 'reg456',
          merchant: 'merchant123',
        }),
      ],
      {
        email: 'test@example.com.local',
        firstName: 'Test',
        lastName: 'Payer',
        phone: '1234567890',
      },
      'FI'
    )

    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: 'tx123',
        status: 'new',
        amount: expectedAmount,
        reference: 'event123:reg456',
        bankReference: 'ref123',
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
        createMockRegistration({ handler: { name: 'Test Handler', email: 'handler@exmaple.com', membership: false } })
      )
      .mockResolvedValueOnce(createMockOrganizer())

    await paymentCreateLambda(event)

    expect(mockCreatePayment).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      5000, // 50 EUR * 100
      expect.any(String),
      expect.any(String),
      expect.any(Array),
      expect.any(Object),
      'FI'
    )
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
        cost: { normal: 50, earlyBird: { days: 1, cost: 30 } },
        costMember: { normal: 40, earlyBird: { days: 1, cost: 25 } },
      })
    )
    mockRead
      .mockResolvedValueOnce(createMockRegistration({ paidAmount: 20, createdAt: '2024-12-31T00:00:00.000Z' })) // member, earlybird
      .mockResolvedValueOnce(createMockOrganizer())

    await paymentCreateLambda(event)

    expect(mockCreatePayment).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      500, // (25 EUR - 20 EUR) * 100
      expect.any(String),
      expect.any(String),
      expect.any(Array),
      expect.any(Object),
      'FI'
    )
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
        cost: { normal: 50, custom: { cost: 60, description: { fi: 'custom', en: 'custom' } } },
        costMember: { normal: 40, custom: { cost: 60, description: { fi: 'custom', en: 'custom' } } },
      })
    )
    mockRead.mockReset()
    mockRead
      .mockResolvedValueOnce(createMockRegistration({ selectedCost: 'custom' }))
      .mockResolvedValueOnce(createMockOrganizer())

    await paymentCreateLambda(event)

    expect(mockCreatePayment).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      6000, // 60 EUR * 100
      expect.any(String),
      expect.any(String),
      expect.any(Array),
      expect.any(Object),
      'FI'
    )
  })

  it('should handle undefined paidAmount', async () => {
    mockRead.mockReset()
    mockRead
      .mockResolvedValueOnce(createMockRegistration({ paidAmount: undefined }))
      .mockResolvedValueOnce(createMockOrganizer())

    await paymentCreateLambda(event)

    expect(mockCreatePayment).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      4000, // 40 EUR * 100
      expect.any(String),
      expect.any(String),
      expect.any(Array),
      expect.any(Object),
      'FI'
    )
  })

  it('should respect registration language', async () => {
    mockRead.mockReset()
    mockRead
      .mockResolvedValueOnce(createMockRegistration({ language: 'en' }))
      .mockResolvedValueOnce(createMockOrganizer())

    await paymentCreateLambda(event)

    expect(mockCreatePayment).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      4000, // 40 EUR * 100
      expect.any(String),
      expect.any(String),
      expect.any(Array),
      expect.any(Object),
      'EN'
    )
  })
})
