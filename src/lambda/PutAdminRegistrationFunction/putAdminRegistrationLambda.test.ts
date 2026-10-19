import type { JsonRegistration, PatchOperation } from '../../types'
import { vi } from 'vitest'
import { ADMIN_PROTECTED_REGISTRATION_FIELDS, REGISTRATION_MONEY_FIELDS } from '../../lib/registration'
import { httpError, LambdaError } from '../lib/lambda'
import { constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockAuthorizeWithMemberOf = vi.fn()
const mockGetEvent = vi.fn()
const mockSendTemplatedMail = vi.fn()
const mockGetRegistration = vi.fn()
const mockSaveRegistration = vi.fn()
const mockPatchRegistration = vi.fn<
  (
    eventId: JsonRegistration['eventId'],
    id: JsonRegistration['id'],
    existing: JsonRegistration,
    next: JsonRegistration
  ) => Promise<JsonRegistration>
>(async (_eventId, _id, _existing, next) => next)
const mockAssertRegistrationEmailsNotSuppressed = vi.fn()
const mockGetReadyRegistrationsByEventId = vi.fn(async () => [])
const mockFixRegistrationGroups = vi.fn(async (regs: JsonRegistration[]) => regs)
const mockLockRegistrationGroups = vi.fn().mockResolvedValue(async () => undefined)
const mockLockRegistrationPayments = vi.fn().mockResolvedValue(async () => undefined)
const mockRepairReadyRegistrationGroups = vi.fn().mockResolvedValue([])
const mockUpdateRegistrations = vi.fn(async () => ({
  classes: [{ class: 'ALO', entries: 10 }],
  cost: 40,
  endDate: '2024-01-02',
  id: 'event123',
  name: 'Test Event',
  organizer: { id: 'org-1' },
  startDate: '2024-01-01',
}))
const mockApplyNewRegistrationStatsOnce = vi.fn()
const mockUpdateEventStatsForRegistration = vi.fn()
const mockPublishRegistrationPatches = vi.fn()
const mockClaimNewRegistrationPostProcessing = vi.fn().mockResolvedValue({
  registration: { eventId: 'event123', id: 'reg456', state: 'ready' },
  release: async () => undefined,
  token: 'test-token',
})
const mockMarkNewRegistrationPhase = vi.fn()

const mockDynamoDB = {
  batchWrite: vi.fn(),
  delete: vi.fn(),
  query: vi.fn(),
  read: vi.fn(),
  readAll: vi.fn(),
  update: vi.fn(),
  write: vi.fn(),
}

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return mockDynamoDB
  }),
}))

vi.doMock('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))

const libEmail = await import('../lib/email')

vi.doMock('../lib/email', () => ({
  ...libEmail,
  sendTemplatedMail: mockSendTemplatedMail,
}))

vi.doMock('../lib/emailSuppression', () => ({
  assertRegistrationEmailsNotSuppressed: mockAssertRegistrationEmailsNotSuppressed,
  cloneRegistrationPeople: (registration: JsonRegistration) => ({
    ...registration,
    ...(registration.handler ? { handler: { ...registration.handler } } : {}),
    ...(registration.owner ? { owner: { ...registration.owner } } : {}),
    ...(registration.owners ? { owners: registration.owners.map((owner) => ({ ...owner })) } : {}),
    ...(registration.payer ? { payer: { ...registration.payer } } : {}),
  }),
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

const mockfindExistingRegistrationToEventForDog = vi.fn<
  (eventId: string, regNo: string) => Promise<JsonRegistration | undefined>
>(async () => undefined)

const libRegistration = await import('../lib/registration')

vi.doMock('../lib/registration', () => ({
  ...libRegistration,
  claimNewRegistrationPostProcessing: mockClaimNewRegistrationPostProcessing,
  findExistingRegistrationToEventForDog: mockfindExistingRegistrationToEventForDog,
  getReadyRegistrationsByEventId: mockGetReadyRegistrationsByEventId,
  getRegistration: mockGetRegistration,
  markNewRegistrationPhase: mockMarkNewRegistrationPhase,
  patchRegistration: mockPatchRegistration,
  saveRegistration: mockSaveRegistration,
}))

vi.doMock('../lib/event', () => ({
  fixRegistrationGroups: mockFixRegistrationGroups,
  getEvent: mockGetEvent,
  lockRegistrationGroups: mockLockRegistrationGroups,
  lockRegistrationPayments: mockLockRegistrationPayments,
  repairReadyRegistrationGroups: mockRepairReadyRegistrationGroups,
  updateRegistrations: mockUpdateRegistrations,
}))

vi.doMock('../lib/stats', () => ({
  applyNewRegistrationStatsOnce: mockApplyNewRegistrationStatsOnce,
  updateEventStatsForRegistration: mockUpdateEventStatsForRegistration,
}))

const mockPublishEventCounts = vi.fn()
const mockPublishParticipantRegistrationPatches = vi.fn()
vi.doMock('../lib/ws/actions', () => ({
  publishEventCounts: mockPublishEventCounts,
  publishParticipantRegistrationPatches: mockPublishParticipantRegistrationPatches,
  publishRegistrationPatches: mockPublishRegistrationPatches,
  publishRegistrationPatchesStrict: mockPublishRegistrationPatches,
}))

const { default: putAdminRegistrationLambda } = await import('./handler')

/** What the secretary's views keep of a stored registration and a participant's answer leaves out (KOE-1515). */
const secretaryGroup = { date: '2024-01-01', key: 'ap', number: 2, time: 'ap' as const }
const secretaryOnlyFields = {
  eventResult: { result: 'ALO1', updatedAt: '2024-01-01T12:00:00.000Z', updatedBy: 'Secretary' },
  group: secretaryGroup,
  internalNotes: 'call the owner',
  startGroup: { ...secretaryGroup, number: 7 },
}

describe('putAdminRegistrationLambda', () => {
  const _errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const event = constructPartialAPIGwEvent({
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
  })

  /** The new registration the form sends: the same body without an id. */
  const { id: _id, ...newRegistrationBody } = JSON.parse(event.body ?? '')

  /** A secretary's edit of the stored registration reg456, as the admin form sends it. */
  const edit = (operations: PatchOperation[], modifiedAt?: string) => ({
    ...event,
    body: JSON.stringify({ eventId: 'event123', id: 'reg456', modifiedAt, operations }),
    httpMethod: 'PATCH',
  })
  const notesOperation: PatchOperation = { path: ['notes'], type: 'CREATE', value: 'updated notes' }
  const notesEdit = edit([notesOperation])

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementations
    mockAuthorizeWithMemberOf.mockResolvedValue({
      memberOf: ['org-1'],
      user: { admin: false, id: 'user123', name: 'Test User' },
    })
    mockGetEvent.mockResolvedValue({ cost: 40, organizer: { id: 'org-1' } })
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

    vi.spyOn(console, 'debug').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    mockGetReadyRegistrationsByEventId.mockResolvedValue([])
    mockFixRegistrationGroups.mockImplementation(async (regs: JsonRegistration[]) => regs)
    mockUpdateRegistrations.mockResolvedValue({
      classes: [{ class: 'ALO', entries: 10 }],
      cost: 40,
      endDate: '2024-01-02',
      id: 'event123',
      name: 'Test Event',
      organizer: { id: 'org-1' },
      startDate: '2024-01-01',
    })
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorizeWithMemberOf.mockRejectedValueOnce(httpError(401, 'Unauthorized'))
    const malformedPatchEvent = { ...event, body: '{}', httpMethod: 'PATCH' }

    const result = await putAdminRegistrationLambda(malformedPatchEvent)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(malformedPatchEvent)
    expect(result.statusCode).toBe(401)
    expect(mockGetEvent).not.toHaveBeenCalled()
    expect(mockSaveRegistration).not.toHaveBeenCalled()
  })

  describe('an existing registration changes only through operations (KOE-1575)', () => {
    /** A copy of the registration read before a payment set it ready and confirmed. */
    const staleCopy = { ...JSON.parse(event.body ?? ''), confirmed: false, state: 'creating' }

    it.each([
      [
        'a full save with its id',
        'POST',
        staleCopy,
        'Bad request: an existing registration is changed only with patch operations',
      ],
      ['a PATCH without operations', 'PATCH', staleCopy, 'Bad request: PATCH requires patch operations'],
      [
        'a PATCH without operations or an id',
        'PATCH',
        { notes: 'patched' },
        'Bad request: PATCH requires patch operations',
      ],
    ])('refuses %s before reading or writing anything', async (_name, httpMethod, body, message) => {
      const result = await putAdminRegistrationLambda({ ...event, body: JSON.stringify(body), httpMethod })

      expect(result.statusCode).toBe(400)
      expect(JSON.parse(result.body)).toEqual({ message })
      expect(mockGetEvent).not.toHaveBeenCalled()
      expect(mockGetRegistration).not.toHaveBeenCalled()
      expect(mockSaveRegistration).not.toHaveBeenCalled()
      expect(mockPatchRegistration).not.toHaveBeenCalled()
    })
  })

  it('rejects users outside the event organizer before reading or writing registration data', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({
      memberOf: ['org-1'],
      user: { admin: false, id: 'user123', name: 'Test User' },
    })
    mockGetEvent.mockResolvedValueOnce({ cost: 40, organizer: { id: 'org-2' } })

    const result = await putAdminRegistrationLambda(notesEdit)

    expect(result.statusCode).toBe(403)
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
    mockGetEvent.mockResolvedValueOnce({ cost: 40, organizer: { id: 'org-2' } })

    const result = await putAdminRegistrationLambda(notesEdit)

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
    // The secretary's entry is named by its key in the trail (KOE-1442).
    expect(mockDynamoDB.write).toHaveBeenCalledWith(
      expect.objectContaining({
        messageKey: 'audit.messages.registrationAdded',
        user: 'Test User',
      }),
      expect.any(String)
    )

    expect(result.statusCode).toBe(200)
  })

  it('rejects a concurrent create that wins after the initial duplicate check', async () => {
    const request = JSON.parse(event.body ?? '')
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
    const request = JSON.parse(event.body ?? '')
    delete request.id
    delete request.creationIdempotencyKey
    const winner = { ...request, id: 'unrelated-registration', state: 'ready' }
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce(undefined).mockResolvedValueOnce(winner)

    const result = await putAdminRegistrationLambda({ ...event, body: JSON.stringify(request) })

    expect(result.statusCode).toBe(409)
    expect(mockSaveRegistration).not.toHaveBeenCalled()
  })

  it('resumes a same-key create that wins while waiting for the lock', async () => {
    const request = JSON.parse(event.body ?? '')
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
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
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
    // A rejected request is the request's fault and logs at info, not as an error of ours (KOE-1342).
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('rejects an updated registration with suppressed email address', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
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
    const updateEvent = edit([
      { path: ['handler', 'email'], type: 'CHANGE', value: ' Handler@Example.com ' },
      notesOperation,
    ])

    const result = await putAdminRegistrationLambda(updateEvent)

    expect(mockAssertRegistrationEmailsNotSuppressed).toHaveBeenCalledWith(
      expect.objectContaining({
        handler: expect.objectContaining({ email: 'handler@example.com' }),
        notes: 'updated notes',
      }),
      expect.objectContaining({ id: 'reg456' })
    )
    expect(result.statusCode).toBe(409)
    expect(JSON.parse(result.body)).toEqual({
      email: 'handler@example.com',
      error: 'emailSuppressed',
      reason: 'smtp; 550 user unknown',
    })
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    // A rejected request is the request's fault and logs at info, not as an error of ours (KOE-1342).
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('updates an existing registration', async () => {
    const result = await putAdminRegistrationLambda(notesEdit)

    // Verify existing registration was retrieved
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')

    // Verify existing registration was patched with the operations applied.
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
        notes: 'updated notes',
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
    // The entrant's open page hears the secretary's edit too (KOE-1553).
    expect(mockPublishParticipantRegistrationPatches).toHaveBeenCalledWith('event123', ['reg456'], expect.any(Function))

    expect(result.statusCode).toBe(200)
  })

  it('does not allow an update to replace the creation idempotency key', async () => {
    mockGetRegistration.mockResolvedValueOnce({
      creationIdempotencyKey: 'stored-create-key',
      eventId: 'event123',
      id: 'reg456',
      state: 'draft',
    })

    const result = await putAdminRegistrationLambda(
      edit([{ path: ['creationIdempotencyKey'], type: 'CHANGE', value: 'attacker-controlled-key' }])
    )

    expect(result.statusCode).toBe(400)
    expect(JSON.parse(result.body).message).toContain('protected registration field: creationIdempotencyKey')
    expect(mockPatchRegistration).not.toHaveBeenCalled()
  })

  describe('what only the results endpoints write (KOE-1140)', () => {
    const storedResult = { result: 'ALO1', updatedAt: '2026-09-26T09:00:00.000Z', updatedBy: 'Sihteeri' }
    const storedKc = { at: '2026-09-26T10:00:00.000Z', by: 'Sihteeri', payloadHash: 'h', status: 'sent' as const }
    const stored = {
      class: 'ALO',
      dates: [],
      dog: { breedCode: '111', regNo: 'DOG123' },
      eventId: 'event123',
      eventResult: storedResult,
      handler: { email: 'handler@example.com' },
      id: 'reg456',
      kcResult: storedKc,
      language: 'fi',
      owner: { email: 'owner@example.com' },
      qualifyingResults: [],
      reserve: 'ANY',
      state: 'draft',
    }

    /** A well-formed operations request: only the field it names decides whether it is accepted. */
    const operation = (field: string, value: unknown) =>
      putAdminRegistrationLambda(edit([{ path: [field], type: 'CHANGE', value }]))

    it('accepts the same operation on a field a registration form may change', async () => {
      mockGetRegistration.mockResolvedValueOnce(stored)

      const result = await operation('class', 'AVO')

      expect(result.statusCode).toBe(200)
      expect(mockPatchRegistration).toHaveBeenCalledWith(
        'event123',
        'reg456',
        expect.anything(),
        expect.objectContaining({ class: 'AVO', eventResult: storedResult, kcResult: storedKc })
      )
    })
  })

  describe('what only the payment and refund transactions write (KOE-1531)', () => {
    const storedMoney = {
      openPayments: ['tx-open'],
      paidAmount: 50,
      paidAt: '2026-10-19T09:00:00.000Z',
      paymentStatus: 'SUCCESS' as const,
      refundAmount: 10,
      refundAt: '2026-10-19T10:00:00.000Z',
      refundHandlingCost: 2.5,
      refundStatus: 'SUCCESS' as const,
    }
    /** The copy a secretary loaded before the payment and the refund were applied. */
    const staleMoney = {
      openRefunds: ['tx-stale'],
      paidAmount: 0,
      paymentCreationAt: '2026-10-18T11:00:00.000Z',
      paymentStatus: 'PENDING',
      refundAmount: 0,
    }

    it('starts a new registration without the money its body carries', async () => {
      const result = await putAdminRegistrationLambda({
        ...event,
        body: JSON.stringify({ ...newRegistrationBody, ...storedMoney, ...staleMoney }),
      })

      expect(result.statusCode).toBe(200)
      expect(mockSaveRegistration).toHaveBeenCalledTimes(1)
      for (const field of REGISTRATION_MONEY_FIELDS) {
        expect(mockSaveRegistration).toHaveBeenCalledWith(expect.not.objectContaining({ [field]: expect.anything() }))
      }
    })
  })

  // Results (KOE-1140), money (KOE-1531) and the row's own bookkeeping are other writers' to move,
  // and an operation on one of them is refused before anything is read from it (KOE-1574).
  it.each(ADMIN_PROTECTED_REGISTRATION_FIELDS)('refuses an operation on %s and names it', async (field) => {
    const result = await putAdminRegistrationLambda(edit([{ path: [field], type: 'CHANGE', value: 0 }]))

    expect(result.statusCode).toBe(400)
    expect(JSON.parse(result.body).message).toContain(`protected registration field: ${field}`)
    expect(mockPatchRegistration).not.toHaveBeenCalled()
  })

  it('publishes the change an operation made to a nested field', async () => {
    const result = await putAdminRegistrationLambda(
      edit([{ path: ['dog', 'name'], type: 'CREATE', value: 'Patched dog name' }, notesOperation])
    )

    expect(mockPatchRegistration).toHaveBeenCalledWith(
      'event123',
      'reg456',
      expect.objectContaining({ dog: { breedCode: '111', regNo: 'DOG123' }, eventId: 'event123', id: 'reg456' }),
      expect.objectContaining({
        dog: { breedCode: '111', name: 'Patched dog name', regNo: 'DOG123' },
        notes: 'updated notes',
      })
    )
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
      'event123',
      [
        expect.objectContaining({
          dog: { name: 'Patched dog name' },
          id: 'reg456',
          notes: 'updated notes',
        }),
      ],
      'org-1'
    )
    expect(result.statusCode).toBe(200)
  })

  describe('answers with the fields only the secretary sees (KOE-1515)', () => {
    it('on an update', async () => {
      mockGetRegistration.mockResolvedValueOnce({
        ...JSON.parse(event.body ?? ''),
        state: 'ready',
        ...secretaryOnlyFields,
      })

      const result = await putAdminRegistrationLambda(notesEdit)

      expect(result.statusCode).toBe(200)
      expect(JSON.parse(result.body)).toMatchObject(secretaryOnlyFields)
    })

    it('on a new registration', async () => {
      mockClaimNewRegistrationPostProcessing.mockResolvedValueOnce({
        registration: { eventId: 'event123', id: 'reg456', state: 'ready', ...secretaryOnlyFields },
        release: async () => undefined,
        token: 'test-token',
      })
      const request = JSON.parse(event.body ?? '')
      delete request.id

      const result = await putAdminRegistrationLambda({ ...event, body: JSON.stringify(request) })

      expect(result.statusCode).toBe(200)
      expect(JSON.parse(result.body)).toMatchObject(secretaryOnlyFields)
    })

    it('on a repeated create that finds the stored registration first', async () => {
      const request = JSON.parse(event.body ?? '')
      delete request.id
      request.creationIdempotencyKey = 'same-key'
      const winner = { ...request, ...secretaryOnlyFields, id: 'winning-registration', state: 'ready' }
      mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce(winner)
      mockClaimNewRegistrationPostProcessing.mockResolvedValueOnce(undefined)

      const result = await putAdminRegistrationLambda({ ...event, body: JSON.stringify(request) })

      expect(result.statusCode).toBe(200)
      expect(JSON.parse(result.body)).toMatchObject({ id: 'winning-registration', ...secretaryOnlyFields })
    })
  })

  it('clears email delivery status from response after sending update email', async () => {
    mockGetRegistration.mockResolvedValueOnce({
      ...JSON.parse(event.body ?? ''),
      emailDeliveryStatus: {
        at: '2026-05-27T10:00:00.000Z',
        email: 'handler@example.com',
        status: 'bounce',
      },
      state: 'draft',
    })

    const result = await putAdminRegistrationLambda(notesEdit)

    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).not.toHaveProperty('emailDeliveryStatus')
  })

  it('does not send email if handler or owner email is missing', async () => {
    const eventWithoutEmail = edit([{ path: ['handler', 'email'], type: 'REMOVE' }])

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
      ...JSON.parse(event.body ?? ''),
      emailDeliveryStatus: {
        at: '2026-05-27T10:00:00.000Z',
        email: 'handler@example.com',
        status: 'bounce',
      },
      state: 'draft',
    })
    const eventWithoutHandlerEmail = edit([{ path: ['handler', 'email'], type: 'REMOVE' }])

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

  it('returns 400 for patch operations without eventId and id', async () => {
    const result = await putAdminRegistrationLambda({
      ...event,
      body: JSON.stringify({ eventId: '', id: '', operations: [notesOperation] }),
      httpMethod: 'PATCH',
    })

    expect(result.statusCode).toBe(400)
    expect(JSON.parse(result.body)).toEqual({ message: 'Bad request: PATCH requires eventId and id' })
    expect(mockGetRegistration).not.toHaveBeenCalled()
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(mockPatchRegistration).not.toHaveBeenCalled()
  })

  it('applies dates and qualifying result patch operations as arrays', async () => {
    const result = await putAdminRegistrationLambda({
      ...event,
      body: JSON.stringify({
        eventId: 'event123',
        id: 'reg456',
        operations: [
          { path: ['dates', 0], type: 'CREATE', value: { date: '2026-08-16', time: 'ap' } },
          {
            path: ['qualifyingResults', 0],
            type: 'CREATE',
            value: { date: '2026-08-01', official: true, result: 'ALO1' },
          },
        ],
      }),
      httpMethod: 'PATCH',
    })

    expect(mockPatchRegistration).toHaveBeenCalledWith(
      'event123',
      'reg456',
      expect.objectContaining({ dates: [], qualifyingResults: [] }),
      expect.objectContaining({
        dates: [{ date: '2026-08-16', time: 'ap' }],
        qualifyingResults: [{ date: '2026-08-01', official: true, result: 'ALO1' }],
      })
    )
    expect(Array.isArray(mockPatchRegistration.mock.calls[0]?.[3].dates)).toBe(true)
    expect(Array.isArray(mockPatchRegistration.mock.calls[0]?.[3].qualifyingResults)).toBe(true)
    expect(result.statusCode).toBe(200)
  })

  it.each([{ dates: {} }, { dog: { results: {} } }, { optionalCosts: {} }, { qualifyingResults: {} }, { results: {} }])(
    'rejects a new registration with object-shaped array fields: %p',
    async (fields) => {
      const result = await putAdminRegistrationLambda({
        ...event,
        body: JSON.stringify({ ...newRegistrationBody, ...fields }),
      })

      expect(result.statusCode).toBe(400)
      expect(JSON.parse(result.body)).toEqual({ message: 'Bad request: registration array fields must be arrays' })
      expect(mockGetEvent).not.toHaveBeenCalled()
      expect(mockSaveRegistration).not.toHaveBeenCalled()
    }
  )

  it('rejects an operation that changes an array field into an object', async () => {
    const result = await putAdminRegistrationLambda(edit([{ path: ['dates'], type: 'CHANGE', value: {} }]))

    expect(result.statusCode).toBe(400)
    expect(mockPatchRegistration).not.toHaveBeenCalled()
  })

  it('rejects an update based on stale modification data', async () => {
    mockGetRegistration.mockResolvedValueOnce({
      ...JSON.parse(event.body ?? ''),
      modifiedAt: '2025-03-22T09:00:00.000Z',
    })

    const result = await putAdminRegistrationLambda(edit([notesOperation], '2025-03-22T08:00:00.000Z'))

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
    const request = JSON.parse(event.body ?? '')
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
    const eventWithoutOwnerEmail = edit([{ path: ['owner', 'email'], type: 'REMOVE' }])

    const result = await putAdminRegistrationLambda(eventWithoutOwnerEmail)

    // Verify email was not sent
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()

    // Verify registration was still patched.
    expect(mockPatchRegistration).toHaveBeenCalled()
    expect(mockSaveRegistration).not.toHaveBeenCalled()

    expect(result.statusCode).toBe(200)
  })
})
