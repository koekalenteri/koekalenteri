import type { JsonDogEvent, JsonRegistration, Registration } from '../../types'
import { addDays, addMinutes } from 'date-fns'
import { vi } from 'vitest'
import { eventWithStaticDates } from '../../__mockData__/events'
import { registrationWithStaticDates } from '../../__mockData__/registrations'
import { GROUP_KEY_RESERVE } from '../../lib/registration'
import { CONFIG } from '../config'
import { LambdaError } from '../lib/lambda'
import { ISO8601DateTimeRE } from '../test-utils/constants'
import { constructAPIGwEvent } from '../test-utils/helpers'

const mockSES = {
  send: vi.fn(),
}
vi.doMock('@aws-sdk/client-ses', () => ({
  SESClient: vi.fn(function MockSESClient() {
    return mockSES
  }),
  SendTemplatedEmailCommand: vi.fn(function MockSendTemplatedEmailCommand(p) {
    return p
  }),
}))

const mockGetEvent = vi.fn<(eventId: string) => Promise<JsonDogEvent>>()
const mockApplyNewRegistrationStatsOnce = vi.fn()
const mockUpdateEventStatsForRegistration = vi.fn()
const mockUpdateRegistrations = vi.fn()
const mockPublishRegistrationPatches = vi.fn()
const mockDynamoDBQuery = vi.fn().mockResolvedValue([])
const mockDynamoDBWrite = vi.fn()
const mockDynamoDBUpdate = vi.fn()
const mockFixRegistrationGroups = vi.fn(async (registrations: JsonRegistration[]) => registrations)
const mockLockRegistrationGroups = vi.fn().mockResolvedValue(async () => undefined)
const mockLockRegistrationPayments = vi.fn().mockResolvedValue(async () => undefined)
const mockGetReadyRegistrationsByEventId = vi.fn().mockResolvedValue([])
const mockRepairReadyRegistrationGroups = vi.fn().mockResolvedValue([])
const mockClaimNewRegistrationPostProcessing = vi.fn().mockResolvedValue({
  registration: registrationWithStaticDates,
  release: async () => undefined,
  token: 'test-token',
})
const mockMarkNewRegistrationPhase = vi.fn()

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

vi.doMock('../lib/ws/actions', () => ({
  publishRegistrationPatches: mockPublishRegistrationPatches,
  publishRegistrationPatchesStrict: mockPublishRegistrationPatches,
}))

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      query: mockDynamoDBQuery,
      update: mockDynamoDBUpdate,
      write: mockDynamoDBWrite,
    }
  }),
}))

const mockGetRegistration = vi.fn<(eventId: string, registrationId: string) => Promise<JsonRegistration>>()
const mockSaveRegistration = vi.fn()
const mockPatchRegistration = vi.fn<
  (
    eventId: JsonRegistration['eventId'],
    id: JsonRegistration['id'],
    existing: JsonRegistration,
    next: JsonRegistration
  ) => Promise<JsonRegistration>
>(async (_eventId, _id, _existing, next) => next)
const mockAssertRegistrationEmailsNotSuppressed = vi.fn<() => Promise<void>>()
const mockfindExistingRegistrationToEventForDog = vi.fn<
  (eventId: string, regNo: string) => Promise<JsonRegistration | undefined>
>(async () => undefined)

const libRegistration = await import('../lib/registration')
const mockAuthorizeRegistrationEdit = vi.fn(() => 'test-edit-token')

vi.doMock('../lib/registration', () => ({
  ...libRegistration,
  authorizeRegistrationEdit: mockAuthorizeRegistrationEdit,
  claimNewRegistrationPostProcessing: mockClaimNewRegistrationPostProcessing,
  findExistingRegistrationToEventForDog: mockfindExistingRegistrationToEventForDog,
  getReadyRegistrationsByEventId: mockGetReadyRegistrationsByEventId,
  getRegistration: mockGetRegistration,
  markNewRegistrationPhase: mockMarkNewRegistrationPhase,
  patchRegistration: mockPatchRegistration,
  saveRegistration: mockSaveRegistration,
}))

vi.doMock('../lib/emailSuppression', () => ({
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

const { default: putRegistrationLabmda } = await import('./handler')

describe('putRegistrationLabmda', () => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)

  beforeAll(() => {
    vi.useFakeTimers()
  })
  beforeEach(() => {
    vi.setSystemTime(eventWithStaticDates.entryStartDate)
    mockUpdateRegistrations.mockResolvedValue({ organizer: { id: 'org-1' } })
  })
  afterEach(() => {
    vi.clearAllMocks()
    mockAssertRegistrationEmailsNotSuppressed.mockResolvedValue(undefined)
    mockUpdateRegistrations.mockResolvedValue({ ...eventWithStaticDates, organizer: { id: 'org-1' } })
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  it('should do happy path for new registration', async () => {
    vi.setSystemTime(eventWithStaticDates.entryStartDate)
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    const { id: _1, paidAmount: _2, paidAt: _3, paymentStatus: _4, ...registration } = registrationWithStaticDates
    const res = await putRegistrationLabmda(
      constructAPIGwEvent({
        ...registration,
        handler: { ...registration.handler, email: ' Handler@Example.com ' },
        owner: { ...registration.owner, email: ' Owner@Example.com ' },
        payer: { ...registration.payer, email: ' Payer@Example.com ' },
        state: 'ready',
      })
    )

    expect(mockSaveRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        ...JSON.parse(JSON.stringify(registration)),
        createdAt: expect.stringMatching(ISO8601DateTimeRE),
        createdBy: 'anonymous',
        handler: expect.objectContaining({ email: 'handler@example.com' }),
        id: expect.stringMatching(/^[A-Za-z0-9_-]{10}$/),
        modifiedAt: expect.stringMatching(ISO8601DateTimeRE),
        modifiedBy: 'anonymous',
        owner: expect.objectContaining({ email: 'owner@example.com' }),
        payer: expect.objectContaining({ email: 'payer@example.com' }),
        updatedAt: expect.stringMatching(ISO8601DateTimeRE),
      })
    )
    expect(mockSaveRegistration).toHaveBeenCalledWith(expect.objectContaining({ state: 'creating' }))
    expect(mockSaveRegistration).toHaveBeenCalledTimes(1)
    expect(mockApplyNewRegistrationStatsOnce).toHaveBeenCalledWith(
      registrationWithStaticDates,
      expect.objectContaining({ id: eventWithStaticDates.id }),
      'test-token'
    )
    expect(mockUpdateEventStatsForRegistration).not.toHaveBeenCalled()

    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({ auditKey: expect.any(String), message: 'Ilmoittautui', user: 'anonymous' }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledTimes(1)

    expect(mockSES.send).not.toHaveBeenCalled()
    // Pending-payment registrations are intentionally absent from the admin
    // registration collection until the payment callback makes them ready.
    expect(mockUpdateRegistrations).not.toHaveBeenCalled()
    expect(mockPublishRegistrationPatches).not.toHaveBeenCalled()

    expect(res.statusCode).toEqual(200)
    const responseRegistration = JSON.parse(res.body)
    expect(responseRegistration.editToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(responseRegistration.editTokenVersion).toBeUndefined()
  })

  it('rejects an update when edit-token authorization fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(JSON.parse(JSON.stringify(registrationWithStaticDates)))
    mockAuthorizeRegistrationEdit.mockImplementationOnce(() => {
      throw new LambdaError(404, 'not found')
    })

    const res = await putRegistrationLabmda(
      constructAPIGwEvent({
        eventId: registrationWithStaticDates.eventId,
        id: registrationWithStaticDates.id,
        notes: 'x',
      })
    )

    expect(res.statusCode).toBe(404)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(mockPatchRegistration).not.toHaveBeenCalled()
  })

  it('should send email for new registration when paymentTime is confirmation', async () => {
    vi.setSystemTime(eventWithStaticDates.entryStartDate)
    const eventWithConfirmationPayment = { ...eventWithStaticDates, paymentTime: 'confirmation' }
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithConfirmationPayment)))
    mockClaimNewRegistrationPostProcessing.mockResolvedValueOnce({
      registration: { ...registrationWithStaticDates, state: 'ready' },
      release: async () => undefined,
      token: 'test-token',
    })
    const res = await putRegistrationLabmda(
      constructAPIGwEvent(
        { ...registrationWithStaticDates, id: undefined },
        { headers: { origin: 'https://attacker.example' } }
      )
    )

    expect(mockSaveRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'ready',
      })
    )

    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['handler@example.com', 'owner@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Tags: expect.any(Array),
      Template: 'registration-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisen vahvistus"'),
    })
    expect(mockSES.send).toHaveBeenCalledWith(
      expect.objectContaining({
        TemplateData: expect.stringContaining(`"link":"${CONFIG.frontendURL}/r/`),
      })
    )
    expect(mockSES.send).toHaveBeenCalledWith(
      expect.objectContaining({
        TemplateData: expect.stringContaining(`"paymentLink":"${CONFIG.frontendURL}/p/`),
      })
    )
    expect(mockSES.send).not.toHaveBeenCalledWith(
      expect.objectContaining({
        TemplateData: expect.stringContaining('https://attacker.example'),
      })
    )
    expect(mockSES.send).toHaveBeenCalledTimes(1)
    expect(mockFixRegistrationGroups).toHaveBeenCalledTimes(1)
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
      eventWithConfirmationPayment.id,
      [expect.objectContaining({ id: registrationWithStaticDates.id })],
      'org-1'
    )

    expect(res.statusCode).toEqual(200)
  })

  it('uses the local frontend for registration email links in the dev stage', async () => {
    const originalStageName = CONFIG.stageName
    CONFIG.stageName = 'dev'
    mockGetEvent.mockResolvedValueOnce(
      JSON.parse(JSON.stringify({ ...eventWithStaticDates, paymentTime: 'confirmation' }))
    )
    mockClaimNewRegistrationPostProcessing.mockResolvedValueOnce({
      registration: { ...registrationWithStaticDates, state: 'ready' },
      release: async () => undefined,
      token: 'test-token',
    })

    try {
      await putRegistrationLabmda(
        constructAPIGwEvent(
          { ...registrationWithStaticDates, id: undefined },
          { headers: { origin: 'http://localhost:3000' } }
        )
      )

      expect(mockSES.send).toHaveBeenCalledWith(
        expect.objectContaining({
          TemplateData: expect.stringContaining('"link":"http://localhost:3000/r/'),
        })
      )
      expect(mockSES.send).toHaveBeenCalledWith(
        expect.objectContaining({
          TemplateData: expect.stringContaining('"paymentLink":"http://localhost:3000/p/'),
        })
      )
    } finally {
      CONFIG.stageName = originalStageName
    }
  })

  it('rejects a concurrent confirmation-time create that wins after the initial duplicate check', async () => {
    const eventWithConfirmationPayment = { ...eventWithStaticDates, paymentTime: 'confirmation' as const }
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithConfirmationPayment)))
    mockfindExistingRegistrationToEventForDog
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ ...JSON.parse(JSON.stringify(registrationWithStaticDates)), state: 'ready' })

    const res = await putRegistrationLabmda(
      constructAPIGwEvent({ ...registrationWithStaticDates, creationIdempotencyKey: 'new-key', id: undefined })
    )

    expect(res.statusCode).toBe(409)
    expect(mockLockRegistrationPayments).toHaveBeenCalledWith(eventWithStaticDates.id)
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(mockfindExistingRegistrationToEventForDog).toHaveBeenNthCalledWith(
      2,
      eventWithStaticDates.id,
      registrationWithStaticDates.dog.regNo,
      'new-key',
      true
    )
  })

  it('does not adopt a concurrent keyless registration', async () => {
    const eventWithConfirmationPayment = { ...eventWithStaticDates, paymentTime: 'confirmation' as const }
    const request = { ...registrationWithStaticDates, creationIdempotencyKey: undefined, id: undefined }
    const winner = {
      ...JSON.parse(JSON.stringify(request)),
      creationIdempotencyKey: undefined,
      id: 'unrelated-registration',
      state: 'ready',
    }
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithConfirmationPayment)))
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce(undefined).mockResolvedValueOnce(winner)

    const res = await putRegistrationLabmda(constructAPIGwEvent(request))

    expect(res.statusCode).toBe(409)
    expect(mockSaveRegistration).not.toHaveBeenCalled()
  })

  it('resumes a same-key confirmation-time create that wins while waiting for the lock', async () => {
    const eventWithConfirmationPayment = { ...eventWithStaticDates, paymentTime: 'confirmation' as const }
    const request = { ...registrationWithStaticDates, creationIdempotencyKey: 'same-key', id: undefined }
    const winner = { ...JSON.parse(JSON.stringify(request)), id: 'winning-registration', state: 'ready' }
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithConfirmationPayment)))
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce(undefined).mockResolvedValueOnce(winner)
    mockClaimNewRegistrationPostProcessing.mockResolvedValueOnce(undefined)

    const res = await putRegistrationLabmda(constructAPIGwEvent(request))

    expect(res.statusCode).toBe(200)
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    const body = JSON.parse(res.body)
    expect(body.id).toBe(winner.id)
    expect(body.editToken).toBe(await libRegistration.getRegistrationEditToken(winner))
  })

  it('should reject new registration with suppressed email address', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.setSystemTime(eventWithStaticDates.entryStartDate)
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
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

    const res = await putRegistrationLabmda(
      constructAPIGwEvent({ ...registrationWithStaticDates, id: undefined, state: 'ready' })
    )

    expect(mockAssertRegistrationEmailsNotSuppressed).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: expect.objectContaining({ email: 'owner@example.com' }),
      })
    )
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(res.statusCode).toEqual(409)
    expect(JSON.parse(res.body)).toEqual({
      email: 'owner@example.com',
      error: 'emailSuppressed',
      reason: 'smtp; 550 user unknown',
    })
    expect(errorSpy).toHaveBeenCalled()
  })

  it('should reject updated registration with suppressed email address', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const existingJson = JSON.parse(JSON.stringify(registrationWithStaticDates))
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)
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

    const res = await putRegistrationLabmda(
      constructAPIGwEvent({
        ...registrationWithStaticDates,
        handler: { ...registrationWithStaticDates.handler, email: ' Handler@Example.com ' },
        notes: 'updated notes',
      })
    )

    expect(mockAssertRegistrationEmailsNotSuppressed).toHaveBeenCalledWith(
      expect.objectContaining({
        handler: expect.objectContaining({ email: 'handler@example.com' }),
        notes: 'updated notes',
      })
    )
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(res.statusCode).toEqual(409)
    expect(JSON.parse(res.body)).toEqual({
      email: 'handler@example.com',
      error: 'emailSuppressed',
      reason: 'smtp; 550 user unknown',
    })
    expect(errorSpy).toHaveBeenCalled()
  })

  it('should clear email delivery status from response after sending update email', async () => {
    const existingJson = {
      ...JSON.parse(JSON.stringify(registrationWithStaticDates)),
      emailDeliveryStatus: {
        at: '2026-05-27T10:00:00.000Z',
        email: 'handler@example.com',
        status: 'bounce',
      },
    }
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)

    const res = await putRegistrationLabmda(
      constructAPIGwEvent({
        ...registrationWithStaticDates,
        notes: 'updated notes',
      })
    )

    expect(res.statusCode).toEqual(200)
    expect(JSON.parse(res.body)).not.toHaveProperty('emailDeliveryStatus')
  })

  it('should clear email delivery status when email changes even if email is not sent', async () => {
    const existingJson = {
      ...JSON.parse(JSON.stringify(registrationWithStaticDates)),
      emailDeliveryStatus: {
        at: '2026-05-27T10:00:00.000Z',
        email: 'handler@example.com',
        status: 'bounce',
      },
    }
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)

    const res = await putRegistrationLabmda(
      constructAPIGwEvent(
        {
          ...registrationWithStaticDates,
          handler: null,
          notes: 'updated notes',
        },
        { method: 'PATCH' }
      )
    )

    expect(mockSES.send).not.toHaveBeenCalled()
    expect(res.statusCode).toEqual(200)
    expect(JSON.parse(res.body)).not.toHaveProperty('emailDeliveryStatus')
  })

  it.each([
    [undefined, 'Ilmoittautuminen peruttiin, syy: (ei täytetty)'],
    ['dog-heat', 'Ilmoittautuminen peruttiin, syy: Koiran juoksut'],
    ['handler-sick', 'Ilmoittautuminen peruttiin, syy: Ohjaajan sairastuminen'],
    ['dog-sick', 'Ilmoittautuminen peruttiin, syy: Koiran sairastuminen'],
    ['gdpr', 'Ilmoittautuminen peruttiin, syy: En halua kertoa'],
    ['custom reason', 'Ilmoittautuminen peruttiin, syy: custom reason'],
  ])('should do happy path for cancelled registration', async (cancelReason, auditMessage) => {
    const existingJson = JSON.parse(JSON.stringify(registrationWithStaticDates))
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)
    const res = await putRegistrationLabmda(
      constructAPIGwEvent({ ...registrationWithStaticDates, cancelled: true, cancelReason })
    )

    expect(mockPatchRegistration).toHaveBeenCalledWith(
      eventWithStaticDates.id,
      registrationWithStaticDates.id,
      existingJson,
      {
        ...existingJson,
        cancelled: true,
        ...(cancelReason ? { cancelReason } : {}),
        modifiedAt: new Date().toISOString(),
        modifiedBy: 'anonymous',
        updatedAt: new Date().toISOString(),
      }
    )
    expect(mockPatchRegistration).toHaveBeenCalledTimes(1)
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(1)

    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        message: auditMessage,
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        message: 'Email: Ilmoittautumisesi on peruttu, to: handler@example.com, owner@example.com',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledTimes(2)

    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['handler@example.com', 'owner@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Tags: expect.any(Array),
      Template: 'registration-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisesi on peruttu"'),
    })
    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['secretary@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Template: 'cancel-early-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisesi on peruttu"'),
    })

    expect(mockSES.send).toHaveBeenCalledTimes(2)

    expect(mockUpdateRegistrations).toHaveBeenCalledTimes(1)
    expect(mockUpdateRegistrations).toHaveBeenCalledWith(eventWithStaticDates.id)
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
      eventWithStaticDates.id,
      [
        expect.objectContaining({
          cancelled: true,
          eventId: eventWithStaticDates.id,
          id: registrationWithStaticDates.id,
        }),
      ],
      'org-1'
    )

    expect(res.statusCode).toEqual(200)
  })

  it('should notify secretary when cancelling from reserve and it was notified', async () => {
    vi.setSystemTime(addMinutes(eventWithStaticDates.entryStartDate, 1))

    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { key: GROUP_KEY_RESERVE, number: 2 },
    }
    const existingJson: JsonRegistration = JSON.parse(JSON.stringify({ ...registration, reserveNotified: 2 }))

    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)

    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registration, cancelled: true }))

    expect(mockPatchRegistration).toHaveBeenCalledWith(
      eventWithStaticDates.id,
      registrationWithStaticDates.id,
      existingJson,
      {
        ...existingJson,
        cancelled: true,
        modifiedAt: new Date().toISOString(),
        modifiedBy: 'anonymous',
        updatedAt: new Date().toISOString(),
      }
    )
    expect(mockPatchRegistration).toHaveBeenCalledTimes(1)
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(1)

    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        message: 'Ilmoittautuminen peruttiin, syy: (ei täytetty)',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        message: 'Email: Ilmoittautumisesi on peruttu, to: handler@example.com, owner@example.com',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledTimes(2)

    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['handler@example.com', 'owner@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Tags: expect.any(Array),
      Template: 'registration-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisesi on peruttu"'),
    })
    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['secretary@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Template: 'cancel-reserve-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisesi on peruttu"'),
    })
    expect(mockSES.send).toHaveBeenCalledTimes(2)

    expect(mockUpdateRegistrations).toHaveBeenCalledTimes(1)
    expect(mockUpdateRegistrations).toHaveBeenCalledWith(eventWithStaticDates.id)

    expect(res.statusCode).toEqual(200)
  })

  it('should notify secretary when cancelling from reserve and it was not notified', async () => {
    vi.setSystemTime(addMinutes(eventWithStaticDates.entryEndDate, 1))

    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { key: GROUP_KEY_RESERVE, number: 2 },
    }
    const existingJson: JsonRegistration = JSON.parse(JSON.stringify({ ...registration, reserveNotified: undefined }))

    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)

    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registration, cancelled: true }))

    expect(mockPatchRegistration).toHaveBeenCalledWith(
      eventWithStaticDates.id,
      registrationWithStaticDates.id,
      existingJson,
      {
        ...existingJson,
        cancelled: true,
        modifiedAt: new Date().toISOString(),
        modifiedBy: 'anonymous',
        updatedAt: new Date().toISOString(),
      }
    )
    expect(mockPatchRegistration).toHaveBeenCalledTimes(1)
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(1)

    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        message: 'Ilmoittautuminen peruttiin, syy: (ei täytetty)',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        message: 'Email: Ilmoittautumisesi on peruttu, to: handler@example.com, owner@example.com',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledTimes(2)

    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['handler@example.com', 'owner@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Tags: expect.any(Array),
      Template: 'registration-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisesi on peruttu"'),
    })
    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['secretary@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Template: 'cancel-early-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisesi on peruttu"'),
    })

    expect(mockSES.send).toHaveBeenCalledTimes(2)

    expect(mockUpdateRegistrations).toHaveBeenCalledTimes(1)

    expect(res.statusCode).toEqual(200)
  })

  it('should notify secretary when cancelling from participants', async () => {
    vi.setSystemTime(addMinutes(eventWithStaticDates.entryEndDate, 1))

    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { key: 'participants-1', number: 2 },
    }
    const existingJson: JsonRegistration = JSON.parse(JSON.stringify(registration))

    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)

    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registration, cancelled: true }))

    expect(mockPatchRegistration).toHaveBeenCalledWith(
      eventWithStaticDates.id,
      registrationWithStaticDates.id,
      existingJson,
      {
        ...existingJson,
        cancelled: true,
        modifiedAt: new Date().toISOString(),
        modifiedBy: 'anonymous',
        updatedAt: new Date().toISOString(),
      }
    )
    expect(mockPatchRegistration).toHaveBeenCalledTimes(1)
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(1)

    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        message: 'Ilmoittautuminen peruttiin, syy: (ei täytetty)',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        message: 'Email: Ilmoittautumisesi on peruttu, to: handler@example.com, owner@example.com',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledTimes(2)

    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['handler@example.com', 'owner@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Tags: expect.any(Array),
      Template: 'registration-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisesi on peruttu"'),
    })
    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['secretary@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Template: 'cancel-picked-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisesi on peruttu"'),
    })
    expect(mockSES.send).toHaveBeenCalledTimes(2)

    expect(mockUpdateRegistrations).toHaveBeenCalledTimes(1)

    expect(res.statusCode).toEqual(200)
  })

  it('should do happy path for updating registration', async () => {
    const existingJson = JSON.parse(JSON.stringify(registrationWithStaticDates))
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)
    const updatedRegistration = { ...registrationWithStaticDates, notes: 'updated notes' }
    const res = await putRegistrationLabmda(constructAPIGwEvent(updatedRegistration))

    expect(mockPatchRegistration).toHaveBeenCalledWith(
      eventWithStaticDates.id,
      registrationWithStaticDates.id,
      existingJson,
      {
        ...existingJson,
        modifiedAt: new Date().toISOString(),
        modifiedBy: 'anonymous',
        notes: 'updated notes',
        updatedAt: new Date().toISOString(),
      }
    )
    expect(mockPatchRegistration).toHaveBeenCalledTimes(1)
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(1)

    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: expect.any(String),
        message: 'Muutti: Lisätiedot',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        message: 'Email: Ilmoittautumisesi tietoja on muokattu, to: handler@example.com, owner@example.com',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledTimes(2)

    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['handler@example.com', 'owner@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Tags: expect.any(Array),
      Template: 'registration-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisesi tietoja on muokattu"'),
    })
    expect(mockSES.send).toHaveBeenCalledTimes(1)

    expect(mockUpdateRegistrations).toHaveBeenCalledWith(eventWithStaticDates.id)
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
      eventWithStaticDates.id,
      [expect.objectContaining({ id: registrationWithStaticDates.id, notes: 'updated notes' })],
      'org-1'
    )
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
      eventWithStaticDates.id,
      expect.not.arrayContaining([expect.objectContaining({ dog: expect.anything() })]),
      'org-1'
    )

    expect(res.statusCode).toEqual(200)
  })

  it('should merge partial patch payloads before diffing and saving', async () => {
    const existingJson = JSON.parse(JSON.stringify(registrationWithStaticDates))
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)

    const res = await putRegistrationLabmda(
      constructAPIGwEvent(
        {
          dog: { name: 'Patched dog name' },
          eventId: eventWithStaticDates.id,
          id: registrationWithStaticDates.id,
          notes: 'patched notes',
        },
        { method: 'PATCH' }
      )
    )

    expect(mockPatchRegistration).toHaveBeenCalledWith(
      eventWithStaticDates.id,
      registrationWithStaticDates.id,
      existingJson,
      expect.objectContaining({
        dog: {
          ...existingJson.dog,
          name: 'Patched dog name',
        },
        notes: 'patched notes',
      })
    )
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
      eventWithStaticDates.id,
      [
        expect.objectContaining({
          dog: { name: 'Patched dog name' },
          id: registrationWithStaticDates.id,
          notes: 'patched notes',
        }),
      ],
      'org-1'
    )
    expect(res.statusCode).toEqual(200)
  })

  it('applies array patch operations without changing dates into an object', async () => {
    const existingJson = JSON.parse(JSON.stringify(registrationWithStaticDates))
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)

    const res = await putRegistrationLabmda(
      constructAPIGwEvent(
        {
          eventId: existingJson.eventId,
          id: existingJson.id,
          operations: [{ path: ['dates', 0, 'time'], type: 'CHANGE', value: 'ip' }],
        },
        { method: 'PATCH' }
      )
    )

    expect(res.statusCode).toEqual(200)
    expect(mockPatchRegistration).toHaveBeenCalledWith(
      existingJson.eventId,
      existingJson.id,
      existingJson,
      expect.objectContaining({ dates: [{ ...existingJson.dates[0], time: 'ip' }] })
    )
    expect(Array.isArray(mockPatchRegistration.mock.calls[0]?.[3].dates)).toBe(true)
  })

  it('rejects patch operations for non-public fields', async () => {
    const existingJson = JSON.parse(JSON.stringify(registrationWithStaticDates))
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)

    const res = await putRegistrationLabmda(
      constructAPIGwEvent(
        {
          eventId: existingJson.eventId,
          id: existingJson.id,
          operations: [{ path: ['qualifyingResults', 0], type: 'CREATE', value: { result: 'VOI1' } }],
        },
        { method: 'PATCH' }
      )
    )

    expect(res.statusCode).toEqual(400)
    expect(mockPatchRegistration).not.toHaveBeenCalled()
  })

  it('rejects legacy patches with object-shaped dates', async () => {
    const res = await putRegistrationLabmda(
      constructAPIGwEvent(
        {
          dates: { 0: { time: 'ip' } },
          eventId: registrationWithStaticDates.eventId,
          id: registrationWithStaticDates.id,
        },
        { method: 'PATCH' }
      )
    )

    expect(res.statusCode).toEqual(400)
    expect(mockGetRegistration).not.toHaveBeenCalled()
    expect(mockPatchRegistration).not.toHaveBeenCalled()
  })

  it('should do happy path for confirming registration', async () => {
    const existingJson = JSON.parse(JSON.stringify(registrationWithStaticDates))
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)
    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, confirmed: true }))

    expect(mockPatchRegistration).toHaveBeenCalledWith(
      eventWithStaticDates.id,
      registrationWithStaticDates.id,
      existingJson,
      {
        ...existingJson,
        confirmed: true,
        modifiedAt: new Date().toISOString(),
        modifiedBy: 'anonymous',
        updatedAt: new Date().toISOString(),
      }
    )
    expect(mockPatchRegistration).toHaveBeenCalledTimes(1)
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(1)

    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: expect.any(String),
        message: 'Ilmoittautumisen vahvistus',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        message: 'Email: Vahvistit vastaanottavasi koepaikan, to: handler@example.com, owner@example.com',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledTimes(2)

    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['handler@example.com', 'owner@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Tags: expect.any(Array),
      Template: 'registration-local-fi',
      TemplateData: expect.stringContaining('"subject":"Vahvistit vastaanottavasi koepaikan"'),
    })
    expect(mockSES.send).toHaveBeenCalledTimes(1)

    expect(mockUpdateRegistrations).toHaveBeenCalledWith(eventWithStaticDates.id)
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
      eventWithStaticDates.id,
      [expect.objectContaining({ confirmed: true, id: registrationWithStaticDates.id })],
      'org-1'
    )

    expect(res.statusCode).toEqual(200)
  })

  it('should not save already confirmed registration when nothing actually changes', async () => {
    const existingJson = JSON.parse(JSON.stringify({ ...registrationWithStaticDates, confirmed: true }))
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)

    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, confirmed: true }))

    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(mockPatchRegistration).not.toHaveBeenCalled()
    expect(mockUpdateEventStatsForRegistration).not.toHaveBeenCalled()
    expect(mockUpdateRegistrations).not.toHaveBeenCalled()
    expect(mockDynamoDBWrite).not.toHaveBeenCalled()
    expect(mockSES.send).not.toHaveBeenCalled()

    expect(res.statusCode).toEqual(304)
    expect(res.body).toBeUndefined()
  })

  it('should not send secretary email on cancellation if secretary has no email', async () => {
    const eventWithoutSecretaryEmail = {
      ...eventWithStaticDates,
      contactInfo: { secretary: { name: 'Testi Testinen' } },
    }
    const existingJson = JSON.parse(JSON.stringify(registrationWithStaticDates))
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithoutSecretaryEmail)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)
    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, cancelled: true }))

    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['handler@example.com', 'owner@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Tags: expect.any(Array),
      Template: 'registration-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisesi on peruttu"'),
    })
    // once for user, not for secretary
    expect(mockSES.send).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toEqual(200)
  })

  it('should not confirm an already cancelled registration', async () => {
    const existingJson = JSON.parse(JSON.stringify({ ...registrationWithStaticDates, cancelled: true }))
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)
    const res = await putRegistrationLabmda(
      constructAPIGwEvent({ ...registrationWithStaticDates, cancelled: true, confirmed: true })
    )

    expect(mockPatchRegistration).toHaveBeenCalledWith(
      eventWithStaticDates.id,
      registrationWithStaticDates.id,
      existingJson,
      {
        ...existingJson,
        confirmed: true, // data is merged
        modifiedAt: new Date().toISOString(),
        modifiedBy: 'anonymous',
        updatedAt: new Date().toISOString(),
      }
    )
    expect(mockPatchRegistration).toHaveBeenCalledTimes(1)
    expect(mockSaveRegistration).not.toHaveBeenCalled()

    // No audit message for confirmation
    expect(mockDynamoDBWrite).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Ilmoittautumisen vahvistus',
      })
    )

    // No email for confirmation
    expect(mockSES.send).toHaveBeenCalledTimes(1)

    expect(res.statusCode).toEqual(200)
  })

  it('should not fail if secretary email fails', async () => {
    const error = new Error('test error')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    mockSES.send.mockImplementationOnce(() => Promise.resolve()) // first send is for user
    mockSES.send.mockImplementationOnce(() => Promise.reject(error)) // second send is for secretary
    const existingJson = JSON.parse(JSON.stringify(registrationWithStaticDates))
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)
    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, cancelled: true }))
    expect(res.statusCode).toEqual(200)
    expect(errorSpy).toHaveBeenCalledWith('error notifying cancellation to secretary', error)
  })

  it('should send invitation read email', async () => {
    const existingJson = {
      ...JSON.parse(JSON.stringify(registrationWithStaticDates)),
      invitationAttachmentSent: 'sent-attachment',
      messagesSent: { invitation: true },
    }
    mockGetEvent.mockResolvedValueOnce({
      ...JSON.parse(JSON.stringify(eventWithStaticDates)),
      invitationAttachment: 'current-attachment',
    })
    mockGetRegistration.mockResolvedValueOnce(existingJson)
    const res = await putRegistrationLabmda(
      constructAPIGwEvent({ ...registrationWithStaticDates, invitationRead: true })
    )
    expect(res.statusCode).toEqual(200)
    expect(mockSES.send).toHaveBeenCalledWith(
      expect.objectContaining({
        Template: 'registration-local-fi',
        TemplateData: expect.stringContaining('"subject":"Olet kuitannut koekutsun"'),
      })
    )
    expect(mockPatchRegistration).toHaveBeenCalledWith(
      registrationWithStaticDates.eventId,
      registrationWithStaticDates.id,
      existingJson,
      expect.objectContaining({
        invitationAttachmentRead: 'sent-attachment',
        invitationRead: true,
      })
    )
  })

  it('records a new receipt when a previously read invitation attachment is replaced', async () => {
    const existingJson = {
      ...JSON.parse(JSON.stringify(registrationWithStaticDates)),
      invitationAttachmentRead: 'old-attachment',
      invitationAttachmentSent: 'new-attachment',
      invitationRead: true,
      messagesSent: { invitation: true },
    }
    mockGetEvent.mockResolvedValueOnce({
      ...JSON.parse(JSON.stringify(eventWithStaticDates)),
      invitationAttachment: 'new-attachment',
    })
    mockGetRegistration.mockResolvedValueOnce(existingJson)

    const res = await putRegistrationLabmda(
      constructAPIGwEvent({ ...registrationWithStaticDates, invitationRead: true })
    )

    expect(res.statusCode).toEqual(200)
    expect(mockPatchRegistration).toHaveBeenCalledWith(
      registrationWithStaticDates.eventId,
      registrationWithStaticDates.id,
      existingJson,
      expect.objectContaining({ invitationAttachmentRead: 'new-attachment' })
    )
  })

  it('should return 404 if event is not found', async () => {
    vi.setSystemTime(eventWithStaticDates.entryStartDate)
    mockGetEvent.mockRejectedValueOnce(new LambdaError(404, `Event with id '${eventWithStaticDates.id}' was not found`))

    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, id: undefined }))

    expect(res.statusCode).toEqual(404)
  })

  it('should return 404 when updating a registration after the event has ended', async () => {
    vi.setSystemTime(addDays(eventWithStaticDates.endDate, 1))
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(JSON.parse(JSON.stringify(registrationWithStaticDates)))

    const res = await putRegistrationLabmda(
      constructAPIGwEvent(
        {
          eventId: registrationWithStaticDates.eventId,
          id: registrationWithStaticDates.id,
          notes: 'past event edit',
        },
        { method: 'PATCH' }
      )
    )

    expect(res.statusCode).toBe(404)
    expect(mockAuthorizeRegistrationEdit).not.toHaveBeenCalled()
    expect(mockPatchRegistration).not.toHaveBeenCalled()
  })

  it('does not expose an existing registration for a duplicate submission', async () => {
    vi.setSystemTime(eventWithStaticDates.entryStartDate)
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce(
      JSON.parse(JSON.stringify(registrationWithStaticDates))
    )

    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, id: undefined }))

    expect(res.statusCode).toEqual(409)
    expect(res.body).not.toContain('editToken')
  })

  it('returns a specific conflict for another creation while payment is in progress', async () => {
    vi.setSystemTime(eventWithStaticDates.entryStartDate)
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce({
      ...JSON.parse(JSON.stringify(registrationWithStaticDates)),
      creationIdempotencyKey: 'original-key',
      state: 'creating',
    })

    const res = await putRegistrationLabmda(
      constructAPIGwEvent({
        ...registrationWithStaticDates,
        creationIdempotencyKey: 'different-key',
        id: undefined,
      })
    )

    expect(res.statusCode).toEqual(409)
    expect(JSON.parse(res.body)).toEqual({
      error: 'paymentInProgress',
      message: 'Conflict: A payment for this dog is in progress. Please try again in a few minutes.',
    })
  })

  it('resumes a duplicate creation only when its idempotency key matches', async () => {
    vi.setSystemTime(eventWithStaticDates.entryStartDate)
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce({
      ...JSON.parse(JSON.stringify(registrationWithStaticDates)),
      creationIdempotencyKey: 'secret-create-key',
    })

    const res = await putRegistrationLabmda(
      constructAPIGwEvent({
        ...registrationWithStaticDates,
        creationIdempotencyKey: 'secret-create-key',
        id: undefined,
      })
    )

    expect(res.statusCode).toEqual(200)
  })

  it('returns a concurrent idempotent retry while the original request holds the workflow lease', async () => {
    vi.setSystemTime(eventWithStaticDates.entryStartDate)
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce({
      ...JSON.parse(JSON.stringify(registrationWithStaticDates)),
      creationIdempotencyKey: 'secret-create-key',
    })
    mockClaimNewRegistrationPostProcessing.mockResolvedValueOnce(undefined)

    const res = await putRegistrationLabmda(
      constructAPIGwEvent({
        ...registrationWithStaticDates,
        creationIdempotencyKey: 'secret-create-key',
        id: undefined,
      })
    )

    expect(res.statusCode).toEqual(200)
    expect(mockApplyNewRegistrationStatsOnce).not.toHaveBeenCalled()
    expect(mockMarkNewRegistrationPhase).not.toHaveBeenCalled()
  })

  it('should return 400 for patch registration without eventId and id', async () => {
    const res = await putRegistrationLabmda(constructAPIGwEvent({ notes: 'patched' }, { method: 'PATCH' }))

    expect(res.statusCode).toEqual(400)
    expect(JSON.parse(res.body)).toEqual({ message: 'Bad request: PATCH requires eventId and id' })
    expect(mockGetEvent).not.toHaveBeenCalled()
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(mockPatchRegistration).not.toHaveBeenCalled()
  })

  it('should return 410 when creating new registration before entry window opens', async () => {
    // Move current time 1 minute before entryStartDate
    vi.setSystemTime(addMinutes(eventWithStaticDates.entryStartDate, -1))

    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, id: undefined }))

    expect(res.statusCode).toEqual(410)
    expect(res.body).toContain('Entry is not open')

    // No writes or side effects should occur
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(mockUpdateEventStatsForRegistration).not.toHaveBeenCalled()
    expect(mockUpdateRegistrations).not.toHaveBeenCalled()
    expect(mockSES.send).not.toHaveBeenCalled()
    expect(mockDynamoDBWrite).not.toHaveBeenCalled()
  })

  it('should return 410 when creating new registration after entry window closes', async () => {
    // Move current time 1 minute after entryEndDate
    vi.setSystemTime(addMinutes(eventWithStaticDates.entryEndDate, 1))

    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, id: undefined }))

    expect(res.statusCode).toEqual(410)
    expect(res.body).toContain('Entry is not open')

    // No writes or side effects should occur
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(mockUpdateEventStatsForRegistration).not.toHaveBeenCalled()
    expect(mockUpdateRegistrations).not.toHaveBeenCalled()
    expect(mockSES.send).not.toHaveBeenCalled()
    expect(mockDynamoDBWrite).not.toHaveBeenCalled()
  })

  it('should ignore client-supplied payment fields (paidAmount, paidAt, paymentStatus)', async () => {
    vi.setSystemTime(eventWithStaticDates.entryStartDate)

    const existingJson = JSON.parse(
      JSON.stringify({
        ...registrationWithStaticDates,
        paidAmount: 5000,
        paidAt: '2024-02-03T10:11:12.000Z',
        // establish trusted values that must not change from client update
        paymentStatus: 'paid',
      })
    )

    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)

    // attempt to change payment fields via client payload
    const maliciousUpdate = {
      ...registrationWithStaticDates,
      notes: 'legit note change',
      paidAmount: 0,
      paidAt: '2030-01-01T00:00:00.000Z',
      paymentStatus: 'refunded',
    }

    const res = await putRegistrationLabmda(constructAPIGwEvent(maliciousUpdate))

    expect(res.statusCode).toEqual(200)

    // ensure patchRegistration received payment fields preserved from existing, not client-supplied values
    expect(mockPatchRegistration).toHaveBeenCalledTimes(1)
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(mockPatchRegistration).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        notes: 'legit note change',
        paidAmount: existingJson.paidAmount,
        paidAt: existingJson.paidAt,
        paymentStatus: existingJson.paymentStatus,
      })
    )
  })

  it('derives qualification on the backend while preserving a valid selected cost', async () => {
    const existingJson = JSON.parse(JSON.stringify({ ...registrationWithStaticDates, qualifies: false }))
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)

    const res = await putRegistrationLabmda(
      constructAPIGwEvent({
        eventId: registrationWithStaticDates.eventId,
        id: registrationWithStaticDates.id,
        notes: 'qualification recalculated',
        qualifies: false,
        selectedCost: 'normal',
      })
    )

    expect(res.statusCode).toBe(200)
    expect(mockPatchRegistration).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ qualifies: true, qualifyingResults: [], selectedCost: 'normal' })
    )
  })
})
