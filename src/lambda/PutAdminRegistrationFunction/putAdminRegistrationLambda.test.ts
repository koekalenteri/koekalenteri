import type { JsonRegistration } from '../../types'
import { jest } from '@jest/globals'
import { LambdaError } from '../lib/lambda'

const mockAuthorizeWithMemberOf = jest.fn<any>()
const mockGetEvent = jest.fn<any>()
const mockSendTemplatedMail = jest.fn<any>()
const mockGetRegistration = jest.fn<any>()
const mockSaveRegistration = jest.fn<any>()
const mockPatchRegistration = jest.fn<
  (
    eventId: JsonRegistration['eventId'],
    id: JsonRegistration['id'],
    existing: JsonRegistration,
    next: JsonRegistration
  ) => Promise<JsonRegistration>
>(async (_eventId, _id, _existing, next) => next)
const mockAssertRegistrationEmailsNotSuppressed = jest.fn<any>()
const mockGetReadyRegistrationsByEventId = jest.fn<any>(async () => [])
const mockFixRegistrationGroups = jest.fn<any>(async (regs: JsonRegistration[]) => regs)
const mockLockRegistrationGroups = jest.fn<any>().mockResolvedValue(async () => undefined)
const mockLockRegistrationPayments = jest.fn<any>().mockResolvedValue(async () => undefined)
const mockRepairReadyRegistrationGroups = jest.fn<any>().mockResolvedValue([])
const mockUpdateRegistrations = jest.fn<any>(async () => ({
  classes: [{ class: 'ALO', entries: 10 }],
  endDate: '2024-01-02',
  id: 'event123',
  name: 'Test Event',
  organizer: { id: 'org-1' },
  startDate: '2024-01-01',
}))
const mockApplyNewRegistrationStatsOnce = jest.fn<any>()
const mockUpdateEventStatsForRegistration = jest.fn<any>()
const mockPublishRegistrationPatches = jest.fn<any>()
const mockClaimNewRegistrationPostProcessing = jest.fn<any>().mockResolvedValue({
  registration: { eventId: 'event123', id: 'reg456', state: 'ready' },
  release: async () => undefined,
  token: 'test-token',
})
const mockMarkNewRegistrationPhase = jest.fn<any>()

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
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
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
  patchRegistration: mockPatchRegistration,
  saveRegistration: mockSaveRegistration,
}))

jest.unstable_mockModule('../lib/event', () => ({
  fixRegistrationGroups: mockFixRegistrationGroups,
  getEvent: mockGetEvent,
  lockRegistrationGroups: mockLockRegistrationGroups,
  lockRegistrationPayments: mockLockRegistrationPayments,
  repairReadyRegistrationGroups: mockRepairReadyRegistrationGroups,
  updateRegistrations: mockUpdateRegistrations,
}))

jest.unstable_mockModule('../lib/stats', () => ({
  applyNewRegistrationStatsOnce: mockApplyNewRegistrationStatsOnce,
  updateEventStatsForRegistration: mockUpdateEventStatsForRegistration,
}))

jest.unstable_mockModule('../lib/ws/actions', () => ({
  publishRegistrationPatches: mockPublishRegistrationPatches,
  publishRegistrationPatchesStrict: mockPublishRegistrationPatches,
}))

jest.unstable_mockModule('../lib/registrationPostProcessing', () => ({
  claimNewRegistrationPostProcessing: mockClaimNewRegistrationPostProcessing,
  markNewRegistrationPhase: mockMarkNewRegistrationPhase,
}))

const { default: putAdminRegistrationLambda } = await import('./handler')

describe('putAdminRegistrationLambda', () => {
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
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
    mockAuthorizeWithMemberOf.mockResolvedValue({
      memberOf: ['org-1'],
      user: { admin: false, id: 'user123', name: 'Test User' },
    })
    mockGetEvent.mockResolvedValue({ organizer: { id: 'org-1' } })
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
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({
      res: { body: 'Unauthorized', statusCode: 401 },
    })
    const malformedPatchEvent = { ...event, body: '{}', httpMethod: 'PATCH' }

    const result = await putAdminRegistrationLambda(malformedPatchEvent)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(malformedPatchEvent)
    expect(result.statusCode).toBe(401)
    expect(mockGetEvent).not.toHaveBeenCalled()
    expect(mockSaveRegistration).not.toHaveBeenCalled()
  })

  it('rejects users outside the event organizer before reading or writing registration data', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({
      memberOf: ['org-1'],
      user: { admin: false, id: 'user123', name: 'Test User' },
    })
    mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org-2' } })

    const result = await putAdminRegistrationLambda(event)

    expect(result.statusCode).toBe(403)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Forbidden', message: '403 Forbidden', status: 403 })
    )
    expect(mockGetEvent).toHaveBeenCalledWith('event123')
    expect(mockGetRegistration).not.toHaveBeenCalled()
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(mockPatchRegistration).not.toHaveBeenCalled()
  })

  it('allows admins to modify registrations for any organizer', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({
      memberOf: [],
      user: { admin: true, id: 'admin1', name: 'Admin User' },
    })
    mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org-2' } })

    const result = await putAdminRegistrationLambda(event)

    expect(result.statusCode).toBe(200)
    expect(mockPatchRegistration).toHaveBeenCalled()
  })

  it('creates a new registration when id is not provided', async () => {
    mockGetReadyRegistrationsByEventId.mockResolvedValueOnce([])
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
    expect(mockFixRegistrationGroups).toHaveBeenCalledTimes(1)
    expect(mockApplyNewRegistrationStatsOnce).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'event123', id: 'reg456' }),
      expect.objectContaining({ id: 'event123' }),
      'test-token'
    )
    expect(mockUpdateEventStatsForRegistration).not.toHaveBeenCalled()

    expect(result.statusCode).toBe(200)
  })

  it('rejects a concurrent create that wins after the initial duplicate check', async () => {
    const request = JSON.parse(event.body)
    delete request.id
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      ...request,
      creationIdempotencyKey: 'other-create-key',
      id: 'other-registration',
      state: 'ready',
    })

    const result = await putAdminRegistrationLambda({ ...event, body: JSON.stringify(request) })

    expect(result.statusCode).toBe(409)
    expect(mockLockRegistrationPayments).toHaveBeenCalledWith('event123')
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(mockfindExistingRegistrationToEventForDog).toHaveBeenNthCalledWith(
      2,
      'event123',
      request.dog.regNo,
      request.creationIdempotencyKey,
      true
    )
  })

  it('does not adopt a concurrent keyless registration', async () => {
    const request = JSON.parse(event.body)
    delete request.id
    delete request.creationIdempotencyKey
    const winner = { ...request, id: 'unrelated-registration', state: 'ready' }
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce(undefined).mockResolvedValueOnce(winner)

    const result = await putAdminRegistrationLambda({ ...event, body: JSON.stringify(request) })

    expect(result.statusCode).toBe(409)
    expect(mockSaveRegistration).not.toHaveBeenCalled()
  })

  it('resumes a same-key create that wins while waiting for the lock', async () => {
    const request = JSON.parse(event.body)
    delete request.id
    request.creationIdempotencyKey = 'same-key'
    const winner = { ...request, id: 'winning-registration', state: 'ready' }
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce(undefined).mockResolvedValueOnce(winner)
    mockClaimNewRegistrationPostProcessing.mockResolvedValueOnce(undefined)

    const result = await putAdminRegistrationLambda({ ...event, body: JSON.stringify(request) })

    expect(result.statusCode).toBe(200)
    expect(mockSaveRegistration).not.toHaveBeenCalled()
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

    // Verify existing registration was patched with merged updated data.
    expect(mockPatchRegistration).toHaveBeenCalledWith(
      'event123',
      'reg456',
      expect.objectContaining({ eventId: 'event123', id: 'reg456', state: 'draft' }),
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
    expect(mockSaveRegistration).not.toHaveBeenCalled()
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

  it('does not allow an update to replace the creation idempotency key', async () => {
    mockGetRegistration.mockResolvedValueOnce({
      creationIdempotencyKey: 'stored-create-key',
      eventId: 'event123',
      id: 'reg456',
      state: 'draft',
    })

    const result = await putAdminRegistrationLambda({
      ...event,
      body: JSON.stringify({
        ...JSON.parse(event.body),
        creationIdempotencyKey: 'attacker-controlled-key',
      }),
    })

    expect(mockPatchRegistration).toHaveBeenCalledWith(
      'event123',
      'reg456',
      expect.objectContaining({ creationIdempotencyKey: 'stored-create-key' }),
      expect.objectContaining({ creationIdempotencyKey: 'stored-create-key' })
    )
    expect(result.statusCode).toBe(200)
  })

  it('merges partial patch payloads before saving existing registrations', async () => {
    const result = await putAdminRegistrationLambda({
      ...event,
      body: JSON.stringify({
        dog: { name: 'Patched dog name' },
        eventId: 'event123',
        id: 'reg456',
        notes: 'patched notes',
      }),
      httpMethod: 'PATCH',
    })

    expect(mockPatchRegistration).toHaveBeenCalledWith(
      'event123',
      'reg456',
      expect.objectContaining({ dog: { breedCode: '111', regNo: 'DOG123' }, eventId: 'event123', id: 'reg456' }),
      expect.objectContaining({
        dog: { breedCode: '111', name: 'Patched dog name', regNo: 'DOG123' },
        notes: 'patched notes',
      })
    )
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
      'event123',
      [
        expect.objectContaining({
          dog: { name: 'Patched dog name' },
          id: 'reg456',
          notes: 'patched notes',
        }),
      ],
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

    // Verify registration was still patched.
    expect(mockPatchRegistration).toHaveBeenCalled()
    expect(mockSaveRegistration).not.toHaveBeenCalled()

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

  it('returns 400 for patch registration without eventId and id', async () => {
    const result = await putAdminRegistrationLambda({
      ...event,
      body: JSON.stringify({ notes: 'patched' }),
      httpMethod: 'PATCH',
    })

    expect(result.statusCode).toBe(400)
    expect(JSON.parse(result.body)).toEqual({ message: 'Bad request: PATCH requires eventId and id' })
    expect(mockGetRegistration).not.toHaveBeenCalled()
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(mockPatchRegistration).not.toHaveBeenCalled()
  })

  it('rejects an update based on stale modification data', async () => {
    mockGetRegistration.mockResolvedValueOnce({
      ...JSON.parse(event.body),
      modifiedAt: '2025-03-22T09:00:00.000Z',
    })

    const result = await putAdminRegistrationLambda({
      ...event,
      body: JSON.stringify({
        ...JSON.parse(event.body),
        modifiedAt: '2025-03-22T08:00:00.000Z',
      }),
    })

    expect(result.statusCode).toBe(409)
    expect(JSON.parse(result.body)).toEqual({
      error: 'staleData',
      message: 'Registration has been modified since it was loaded',
    })
    expect(mockPatchRegistration).not.toHaveBeenCalled()
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

  it('returns a concurrent idempotent retry while the original request holds the workflow lease', async () => {
    const request = JSON.parse(event.body)
    delete request.id
    request.creationIdempotencyKey = 'secret-create-key'
    const existingRegistration = {
      ...request,
      agreeToTerms: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      createdBy: 'Test User',
      creationIdempotencyKey: 'secret-create-key',
      id: 'existing-reg-id',
      modifiedAt: '2024-01-01T00:00:00.000Z',
      modifiedBy: 'Test User',
      state: 'ready',
    } as JsonRegistration
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce(existingRegistration)
    mockClaimNewRegistrationPostProcessing.mockResolvedValueOnce(undefined)

    const result = await putAdminRegistrationLambda({ ...event, body: JSON.stringify(request) })

    expect(result.statusCode).toBe(200)
    expect(mockApplyNewRegistrationStatsOnce).not.toHaveBeenCalled()
    expect(mockMarkNewRegistrationPhase).not.toHaveBeenCalled()
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

    // Verify registration was still patched.
    expect(mockPatchRegistration).toHaveBeenCalled()
    expect(mockSaveRegistration).not.toHaveBeenCalled()

    expect(result.statusCode).toBe(200)
  })
})
