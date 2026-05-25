import type { JsonRegistration } from '../../types'
import { jest } from '@jest/globals'
import { LambdaError } from '../lib/lambda'

const mockAuthorize = jest.fn<any>()
const mockSendTemplatedMail = jest.fn<any>()
const mockGetRegistration = jest.fn<any>()
const mockSaveRegistration = jest.fn<any>()
const mockAssertRegistrationEmailsNotSuppressed = jest.fn<any>()
const mockGetReadyRegistrationsByEventId = jest.fn<any>(async () => [])
const mockFixRegistrationGroups = jest.fn<any>(async (regs: JsonRegistration[]) => regs)
const mockUpdateRegistrations = jest.fn<any>(async () => ({
  classes: [{ class: 'ALO', entries: 10 }],
  endDate: '2024-01-02',
  id: 'event123',
  name: 'Test Event',
  organizer: { id: 'org-1' },
  startDate: '2024-01-01',
}))
const mockUpdateEventStatsForRegistration = jest.fn<any>()
const mockPublishRegistrationPatches = jest.fn<any>()

const mockDynamoDB = {
  batchWrite: jest.fn<any>(),
  delete: jest.fn<any>(),
  query: jest.fn<any>(),
  read: jest.fn<any>(),
  readAll: jest.fn<any>(),
  update: jest.fn<any>(),
  write: jest.fn<any>(),
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

jest.unstable_mockModule('../lib/emailSuppression', () => ({
  assertRegistrationEmailsNotSuppressed: mockAssertRegistrationEmailsNotSuppressed,
  normalizeRegistrationEmails: (registration: JsonRegistration) => {
    if (registration.owner?.email) registration.owner.email = registration.owner.email.trim().toLowerCase()
    if (registration.handler?.email) registration.handler.email = registration.handler.email.trim().toLowerCase()
    if (registration.payer?.email) registration.payer.email = registration.payer.email.trim().toLowerCase()
    return registration
  },
  shouldClearRegistrationEmailDeliveryStatus: (
    existing: JsonRegistration | undefined,
    registration: JsonRegistration
  ) => {
    const failedEmail = existing?.emailDeliveryStatus?.email?.trim().toLowerCase()
    if (!failedEmail) return false

    return ![registration.owner?.email, registration.handler?.email, registration.payer?.email]
      .filter(Boolean)
      .map((email) => email?.trim().toLowerCase())
      .includes(failedEmail)
  },
}))

const mockfindExistingRegistrationToEventForDog = jest.fn<
  (eventId: string, regNo: string) => Promise<JsonRegistration | undefined>
>(async () => undefined)

const libRegistration = await import('../lib/registration')

jest.unstable_mockModule('../lib/registration', () => ({
  ...libRegistration,
  findExistingRegistrationToEventForDog: mockfindExistingRegistrationToEventForDog,
  getReadyRegistrationsByEventId: mockGetReadyRegistrationsByEventId,
  getRegistration: mockGetRegistration,
  saveRegistration: mockSaveRegistration,
}))

jest.unstable_mockModule('../lib/event', () => ({
  fixRegistrationGroups: mockFixRegistrationGroups,
  updateRegistrations: mockUpdateRegistrations,
}))

jest.unstable_mockModule('../lib/stats', () => ({
  updateEventStatsForRegistration: mockUpdateEventStatsForRegistration,
}))

jest.unstable_mockModule('../lib/ws/actions', () => ({
  publishRegistrationPatches: mockPublishRegistrationPatches,
}))

const { default: putAdminRegistrationLambda } = await import('./handler')

describe('putAdminRegistrationLambda', () => {
  const event = {
    body: JSON.stringify({
      class: 'ALO',
      dates: [],
      dog: {
        breedCode: '111',
        regNo: 'DOG123',
      },
      eventId: 'event123',
      handler: {
        email: 'handler@example.com',
      },
      id: 'reg456',
      language: 'fi',
      owner: {
        email: 'owner@example.com',
      },
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
    mockAssertRegistrationEmailsNotSuppressed.mockResolvedValue(undefined)

    mockGetRegistration.mockResolvedValue({
      class: 'ALO',
      dates: [],
      dog: {
        breedCode: '111',
        regNo: 'DOG123',
      },
      eventId: 'event123',
      handler: {
        email: 'handler@example.com',
      },
      id: 'reg456',
      language: 'fi',
      owner: {
        email: 'owner@example.com',
      },
      qualifyingResults: [],
      reserve: 'ANY',
      state: 'draft',
    })

    mockSaveRegistration.mockResolvedValue({})

    mockUpdateEventStatsForRegistration.mockResolvedValue({})

    mockSendTemplatedMail.mockResolvedValue(undefined)

    // Mock DynamoDB responses
    mockDynamoDB.read.mockResolvedValue({
      classes: [{ class: 'ALO', entries: 10 }],
      endDate: '2024-01-02',
      id: 'event123',
      name: 'Test Event',
      startDate: '2024-01-01',
    })

    jest.spyOn(console, 'debug').mockImplementation(() => {})
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    mockGetReadyRegistrationsByEventId.mockResolvedValue([])
    mockFixRegistrationGroups.mockImplementation(async (regs: JsonRegistration[]) => regs)
    mockUpdateRegistrations.mockResolvedValue({
      classes: [{ class: 'ALO', entries: 10 }],
      endDate: '2024-01-02',
      id: 'event123',
      name: 'Test Event',
      organizer: { id: 'org-1' },
      startDate: '2024-01-01',
    })
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
        class: 'ALO',
        dates: [],
        dog: {
          breedCode: '111',
          regNo: 'DOG123',
        },
        eventId: 'event123',
        handler: {
          email: ' Handler@Example.com ',
        },
        language: 'fi',
        owner: {
          email: ' Owner@Example.com ',
        },
        payer: {
          email: ' Payer@Example.com ',
        },
        qualifyingResults: [],
        reserve: 'ANY',
      }),
    }

    const result = await putAdminRegistrationLambda(newEvent)

    // Verify registration was saved with new ID and state 'ready'
    expect(mockSaveRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAt: expect.any(String),
        createdBy: 'Test User',
        eventId: 'event123',
        handler: expect.objectContaining({ email: 'handler@example.com' }),
        id: expect.any(String), // nanoid generated
        modifiedAt: expect.any(String),
        modifiedBy: 'Test User',
        owner: expect.objectContaining({ email: 'owner@example.com' }),
        payer: expect.objectContaining({ email: 'payer@example.com' }),
        state: 'ready',
      })
    )
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
      'event123',
      [expect.objectContaining({ eventId: 'event123', state: 'ready' })],
      'org-1'
    )

    expect(result.statusCode).toBe(200)
  })

  it('rejects a new registration with suppressed email address', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    mockAssertRegistrationEmailsNotSuppressed.mockRejectedValueOnce(
      new LambdaError(
        409,
        JSON.stringify({
          email: 'owner@example.com',
          error: 'emailSuppressed',
          reason: 'smtp; 550 user unknown',
        })
      )
    )
    const newEvent = {
      ...event,
      body: JSON.stringify({
        class: 'ALO',
        dates: [],
        dog: {
          breedCode: '111',
          regNo: 'DOG123',
        },
        eventId: 'event123',
        handler: {
          email: 'handler@example.com',
        },
        language: 'fi',
        owner: {
          email: 'owner@example.com',
        },
        qualifyingResults: [],
        reserve: 'ANY',
      }),
    }

    const result = await putAdminRegistrationLambda(newEvent)

    expect(result.statusCode).toBe(409)
    expect(JSON.parse(result.body)).toEqual({
      email: 'owner@example.com',
      error: 'emailSuppressed',
      reason: 'smtp; 550 user unknown',
    })
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalled()
  })

  it('rejects an updated registration with suppressed email address', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    mockAssertRegistrationEmailsNotSuppressed.mockRejectedValueOnce(
      new LambdaError(
        409,
        JSON.stringify({
          email: 'handler@example.com',
          error: 'emailSuppressed',
          reason: 'smtp; 550 user unknown',
        })
      )
    )
    const updateEvent = {
      ...event,
      body: JSON.stringify({
        class: 'ALO',
        dates: [],
        dog: {
          breedCode: '111',
          regNo: 'DOG123',
        },
        eventId: 'event123',
        handler: {
          email: ' Handler@Example.com ',
        },
        id: 'reg456',
        language: 'fi',
        notes: 'updated notes',
        owner: {
          email: 'owner@example.com',
        },
        qualifyingResults: [],
        reserve: 'ANY',
      }),
    }

    const result = await putAdminRegistrationLambda(updateEvent)

    expect(mockAssertRegistrationEmailsNotSuppressed).toHaveBeenCalledWith(
      expect.objectContaining({
        handler: expect.objectContaining({ email: 'handler@example.com' }),
        notes: 'updated notes',
      })
    )
    expect(result.statusCode).toBe(409)
    expect(JSON.parse(result.body)).toEqual({
      email: 'handler@example.com',
      error: 'emailSuppressed',
      reason: 'smtp; 550 user unknown',
    })
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalled()
  })

  it('updates an existing registration', async () => {
    const result = await putAdminRegistrationLambda(event)

    // Verify existing registration was retrieved
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')

    // Verify registration was saved with updated data
    expect(mockSaveRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        class: 'ALO',
        eventId: 'event123',
        handler: {
          email: 'handler@example.com',
        },
        id: 'reg456',
        language: 'fi',
        modifiedAt: expect.any(String),
        modifiedBy: 'Test User',
        owner: {
          email: 'owner@example.com',
        },
        state: 'draft', // Preserved from existing
      })
    )
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
      'event123',
      [expect.objectContaining({ eventId: 'event123', id: 'reg456', modifiedBy: 'Test User' })],
      'org-1'
    )
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
      'event123',
      expect.not.arrayContaining([expect.objectContaining({ dog: expect.anything() })]),
      'org-1'
    )

    expect(result.statusCode).toBe(200)
  })

  it('clears email delivery status from response after sending update email', async () => {
    mockGetRegistration.mockResolvedValueOnce({
      emailDeliveryStatus: {
        at: '2026-05-27T10:00:00.000Z',
        email: 'handler@example.com',
        status: 'bounce',
      },
      eventId: 'event123',
      id: 'reg456',
      state: 'draft',
    })

    const result = await putAdminRegistrationLambda(event)

    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).not.toHaveProperty('emailDeliveryStatus')
  })

  it('does not send email if handler or owner email is missing', async () => {
    const eventWithoutEmail = {
      ...event,
      body: JSON.stringify({
        class: 'ALO',
        dates: [],
        dog: {
          breedCode: '111',
          regNo: 'DOG123',
        },
        eventId: 'event123',
        handler: {}, // No email
        id: 'reg456',
        language: 'fi',
        owner: {
          email: 'owner@example.com',
        },
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

  it('clears email delivery status when email changes even if email is not sent', async () => {
    mockGetRegistration.mockResolvedValueOnce({
      emailDeliveryStatus: {
        at: '2026-05-27T10:00:00.000Z',
        email: 'handler@example.com',
        status: 'bounce',
      },
      eventId: 'event123',
      handler: { email: 'handler@example.com' },
      id: 'reg456',
      state: 'draft',
    })
    const eventWithoutHandlerEmail = {
      ...event,
      body: JSON.stringify({
        class: 'ALO',
        dates: [],
        dog: {
          breedCode: '111',
          regNo: 'DOG123',
        },
        eventId: 'event123',
        handler: {},
        id: 'reg456',
        language: 'fi',
        owner: {
          email: 'owner@example.com',
        },
        qualifyingResults: [],
        reserve: 'ANY',
      }),
    }

    const result = await putAdminRegistrationLambda(eventWithoutHandlerEmail)

    expect(mockSendTemplatedMail).not.toHaveBeenCalled()
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).not.toHaveProperty('emailDeliveryStatus')
  })

  it('handles missing dog regNo gracefully', async () => {
    const eventWithoutRegNo = {
      ...event,
      body: JSON.stringify({
        class: 'ALO',
        dates: [],
        dog: {
          breedCode: '111',
        }, // No regNo
        eventId: 'event123',
        handler: {
          email: 'handler@example.com',
        },
        language: 'fi',
        owner: {
          email: 'owner@example.com',
        },
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
        class: 'ALO',
        dates: [],
        dog: {
          breedCode: '111',
          regNo: 'DOG123',
        },
        eventId: 'event123',
        handler: {
          email: 'handler@example.com',
        },
        language: 'fi',
        owner: {
          email: 'owner@example.com',
        },
        qualifyingResults: [],
        reserve: 'ANY',
        // No id - this triggers the new registration path
      }),
    }

    // Mock that the dog is already registered
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce({
      agreeToTerms: true,
      breeder: { name: 'Test Breeder' },
      class: 'ALO',
      createdAt: '2024-01-01T00:00:00.000Z',
      createdBy: 'test',
      dates: [],
      dog: {
        breedCode: '111',
        regNo: 'DOG123',
      },
      eventId: 'event123',
      eventType: 'test',
      handler: {
        email: 'existing@example.com',
        membership: false,
        name: '',
      },
      id: 'existing-reg-id',
      language: 'fi',
      modifiedAt: '2024-01-01T00:00:00.000Z',
      modifiedBy: 'test',
      notes: '',
      owner: {
        email: 'existing@example.com',
        membership: false,
        name: '',
      },
      qualifyingResults: [],
      reserve: 'ANY',
      state: 'ready',
    })

    const result = await putAdminRegistrationLambda(newEventWithExistingDog)

    expect(result.statusCode).toBe(409)
    expect(mockSaveRegistration).not.toHaveBeenCalled()
  })

  it('should return 409 with cancelled flag when dog is already registered with cancelled registration', async () => {
    const newEventWithCancelledDog = {
      ...event,
      body: JSON.stringify({
        class: 'ALO',
        dates: [],
        dog: {
          breedCode: '111',
          regNo: 'DOG123',
        },
        eventId: 'event123',
        handler: {
          email: 'handler@example.com',
        },
        language: 'fi',
        owner: {
          email: 'owner@example.com',
        },
        qualifyingResults: [],
        reserve: 'ANY',
      }),
    }

    // Mock that the dog is already registered but cancelled
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce({
      agreeToTerms: true,
      breeder: { name: 'Test Breeder' },
      cancelled: true, // This registration is cancelled
      class: 'ALO',
      createdAt: '2024-01-01T00:00:00.000Z',
      createdBy: 'test',
      dates: [],
      dog: { breedCode: '111', regNo: 'DOG123' },
      eventId: 'event123',
      eventType: 'test',
      handler: { email: 'existing@example.com', membership: false, name: '' },
      id: 'existing-reg-id',
      language: 'fi',
      modifiedAt: '2024-01-01T00:00:00.000Z',
      modifiedBy: 'test',
      notes: '',
      owner: { email: 'existing@example.com', membership: false, name: '' },
      qualifyingResults: [],
      reserve: 'ANY',
      state: 'ready',
    })

    const result = await putAdminRegistrationLambda(newEventWithCancelledDog)

    expect(result.statusCode).toBe(409)
    expect(JSON.parse(result.body)).toEqual({
      cancelled: true,
      message: 'Conflict: Dog already registered to this event',
    })
    expect(mockSaveRegistration).not.toHaveBeenCalled()
  })

  it('does not send email if owner email is missing', async () => {
    const eventWithoutOwnerEmail = {
      ...event,
      body: JSON.stringify({
        class: 'ALO',
        dates: [],
        dog: {
          breedCode: '111',
          regNo: 'DOG123',
        },
        eventId: 'event123',
        handler: {
          email: 'handler@example.com',
        },
        id: 'reg456',
        language: 'fi',
        owner: {}, // No email
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
