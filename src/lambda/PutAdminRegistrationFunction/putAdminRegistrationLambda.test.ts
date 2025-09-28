import type { JsonRegistration } from '../../types'

import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockSendTemplatedMail = jest.fn<any>()
const mockGetRegistration = jest.fn<any>()
const mockSaveRegistration = jest.fn<any>()
const mockUpdateEventStatsForRegistration = jest.fn<any>()

const mockDynamoDB = {
  write: jest.fn<any>(),
  read: jest.fn<any>(),
  update: jest.fn<any>(),
  delete: jest.fn<any>(),
  query: jest.fn<any>(),
  readAll: jest.fn<any>(),
  batchWrite: jest.fn<any>(),
}

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => mockDynamoDB),
}))

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
}))

const libEmail = await import('../lib/email')

jest.unstable_mockModule('../lib/email', () => ({
  ...libEmail,
  sendTemplatedMail: mockSendTemplatedMail,
}))

const mockfindExistingRegistrationToEventForDog = jest.fn<
  (eventId: string, regNo: string) => Promise<JsonRegistration | undefined>
>(async () => undefined)

const libRegistration = await import('../lib/registration')

jest.unstable_mockModule('../lib/registration', () => ({
  ...libRegistration,
  getRegistration: mockGetRegistration,
  saveRegistration: mockSaveRegistration,
  findExistingRegistrationToEventForDog: mockfindExistingRegistrationToEventForDog,
}))

jest.unstable_mockModule('../lib/stats', () => ({
  updateEventStatsForRegistration: mockUpdateEventStatsForRegistration,
}))

const { default: putAdminRegistrationLambda } = await import('./handler')

describe('putAdminRegistrationLambda', () => {
  const event = {
    body: JSON.stringify({
      eventId: 'event123',
      id: 'reg456',
      handler: {
        email: 'handler@example.com',
      },
      owner: {
        email: 'owner@example.com',
      },
      language: 'fi',
      class: 'ALO',
      dog: {
        regNo: 'DOG123',
        breedCode: '111',
      },
      dates: [],
      qualifyingResults: [],
      reserve: 'ANY',
    }),
    headers: {},
    requestContext: {
      requestId: 'test-request-id',
    },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockAuthorize.mockResolvedValue({
      id: 'user123',
      name: 'Test User',
    })

    mockGetRegistration.mockResolvedValue({
      eventId: 'event123',
      id: 'reg456',
      state: 'draft',
    })

    mockSaveRegistration.mockResolvedValue({})

    mockUpdateEventStatsForRegistration.mockResolvedValue({})

    mockSendTemplatedMail.mockResolvedValue(undefined)

    // Mock DynamoDB responses
    mockDynamoDB.read.mockResolvedValue({
      id: 'event123',
      name: 'Test Event',
      classes: [{ class: 'ALO', entries: 10 }],
      startDate: '2024-01-01',
      endDate: '2024-01-02',
    })

    jest.spyOn(console, 'debug').mockImplementation(() => {})
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    const result = await putAdminRegistrationLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(result.statusCode).toBe(401)
    expect(mockSaveRegistration).not.toHaveBeenCalled()
  })

  it('creates a new registration when id is not provided', async () => {
    const newEvent = {
      ...event,
      body: JSON.stringify({
        eventId: 'event123',
        handler: {
          email: 'handler@example.com',
        },
        owner: {
          email: 'owner@example.com',
        },
        language: 'fi',
        class: 'ALO',
        dog: {
          regNo: 'DOG123',
          breedCode: '111',
        },
        dates: [],
        qualifyingResults: [],
        reserve: 'ANY',
      }),
    }

    const result = await putAdminRegistrationLambda(newEvent)

    // Verify registration was saved with new ID and state 'ready'
    expect(mockSaveRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'event123',
        id: expect.any(String), // nanoid generated
        createdAt: expect.any(String),
        createdBy: 'Test User',
        modifiedAt: expect.any(String),
        modifiedBy: 'Test User',
        state: 'ready',
      })
    )

    expect(result.statusCode).toBe(200)
  })

  it('updates an existing registration', async () => {
    const result = await putAdminRegistrationLambda(event)

    // Verify existing registration was retrieved
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')

    // Verify registration was saved with updated data
    expect(mockSaveRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'event123',
        id: 'reg456',
        modifiedAt: expect.any(String),
        modifiedBy: 'Test User',
        state: 'draft', // Preserved from existing
        handler: {
          email: 'handler@example.com',
        },
        owner: {
          email: 'owner@example.com',
        },
        language: 'fi',
        class: 'ALO',
      })
    )

    expect(result.statusCode).toBe(200)
  })

  it('does not send email if handler or owner email is missing', async () => {
    const eventWithoutEmail = {
      ...event,
      body: JSON.stringify({
        eventId: 'event123',
        id: 'reg456',
        handler: {}, // No email
        owner: {
          email: 'owner@example.com',
        },
        language: 'fi',
        class: 'ALO',
        dog: {
          regNo: 'DOG123',
          breedCode: '111',
        },
        dates: [],
        qualifyingResults: [],
        reserve: 'ANY',
      }),
    }

    const result = await putAdminRegistrationLambda(eventWithoutEmail)

    // Verify email was not sent
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()

    // Verify registration was still saved
    expect(mockSaveRegistration).toHaveBeenCalled()

    expect(result.statusCode).toBe(200)
  })

  it('handles missing dog regNo gracefully', async () => {
    const eventWithoutRegNo = {
      ...event,
      body: JSON.stringify({
        eventId: 'event123',
        handler: {
          email: 'handler@example.com',
        },
        owner: {
          email: 'owner@example.com',
        },
        language: 'fi',
        class: 'ALO',
        dog: {
          breedCode: '111',
        }, // No regNo
        dates: [],
        qualifyingResults: [],
        reserve: 'ANY',
      }),
    }

    const result = await putAdminRegistrationLambda(eventWithoutRegNo)

    // Should still work, just won't check for existing registrations
    expect(result.statusCode).toBe(200)
  })

  it('should return 409 if dog is already registered to the event', async () => {
    const newEventWithExistingDog = {
      ...event,
      body: JSON.stringify({
        eventId: 'event123',
        handler: {
          email: 'handler@example.com',
        },
        owner: {
          email: 'owner@example.com',
        },
        language: 'fi',
        class: 'ALO',
        dog: {
          regNo: 'DOG123',
          breedCode: '111',
        },
        dates: [],
        qualifyingResults: [],
        reserve: 'ANY',
        // No id - this triggers the new registration path
      }),
    }

    // Mock that the dog is already registered
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce({
      eventId: 'event123',
      id: 'existing-reg-id',
      handler: {
        email: 'existing@example.com',
        membership: false,
        name: '',
      },
      owner: {
        email: 'existing@example.com',
        membership: false,
        name: '',
      },
      language: 'fi',
      class: 'ALO',
      dog: {
        regNo: 'DOG123',
        breedCode: '111',
      },
      dates: [],
      qualifyingResults: [],
      reserve: 'ANY',
      agreeToTerms: true,
      breeder: { name: 'Test Breeder' },
      eventType: 'test',
      state: 'ready',
      createdAt: '2024-01-01T00:00:00.000Z',
      createdBy: 'test',
      modifiedAt: '2024-01-01T00:00:00.000Z',
      modifiedBy: 'test',
      notes: '',
    })

    const result = await putAdminRegistrationLambda(newEventWithExistingDog)

    expect(result.statusCode).toBe(409)
    expect(mockSaveRegistration).not.toHaveBeenCalled()
  })

  it('should return 409 with cancelled flag when dog is already registered with cancelled registration', async () => {
    const newEventWithCancelledDog = {
      ...event,
      body: JSON.stringify({
        eventId: 'event123',
        handler: {
          email: 'handler@example.com',
        },
        owner: {
          email: 'owner@example.com',
        },
        language: 'fi',
        class: 'ALO',
        dog: {
          regNo: 'DOG123',
          breedCode: '111',
        },
        dates: [],
        qualifyingResults: [],
        reserve: 'ANY',
      }),
    }

    // Mock that the dog is already registered but cancelled
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce({
      eventId: 'event123',
      id: 'existing-reg-id',
      handler: { email: 'existing@example.com', membership: false, name: '' },
      owner: { email: 'existing@example.com', membership: false, name: '' },
      language: 'fi',
      class: 'ALO',
      dog: { regNo: 'DOG123', breedCode: '111' },
      dates: [],
      qualifyingResults: [],
      reserve: 'ANY',
      agreeToTerms: true,
      breeder: { name: 'Test Breeder' },
      eventType: 'test',
      state: 'ready',
      createdAt: '2024-01-01T00:00:00.000Z',
      createdBy: 'test',
      modifiedAt: '2024-01-01T00:00:00.000Z',
      modifiedBy: 'test',
      notes: '',
      cancelled: true, // This registration is cancelled
    })

    const result = await putAdminRegistrationLambda(newEventWithCancelledDog)

    expect(result.statusCode).toBe(409)
    expect(JSON.parse(result.body)).toEqual({
      message: 'Conflict: Dog already registered to this event',
      cancelled: true,
    })
    expect(mockSaveRegistration).not.toHaveBeenCalled()
  })

  it('does not send email if owner email is missing', async () => {
    const eventWithoutOwnerEmail = {
      ...event,
      body: JSON.stringify({
        eventId: 'event123',
        id: 'reg456',
        handler: {
          email: 'handler@example.com',
        },
        owner: {}, // No email
        language: 'fi',
        class: 'ALO',
        dog: {
          regNo: 'DOG123',
          breedCode: '111',
        },
        dates: [],
        qualifyingResults: [],
        reserve: 'ANY',
      }),
    }

    const result = await putAdminRegistrationLambda(eventWithoutOwnerEmail)

    // Verify email was not sent
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()

    // Verify registration was still saved
    expect(mockSaveRegistration).toHaveBeenCalled()

    expect(result.statusCode).toBe(200)
  })
})
