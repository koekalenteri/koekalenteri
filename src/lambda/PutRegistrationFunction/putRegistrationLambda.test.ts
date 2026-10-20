import type {
  DayKey,
  JsonDogEvent,
  JsonManualTestResult,
  JsonRegistration,
  JsonTestResult,
  Registration,
} from '../../types'
import { addMinutes } from 'date-fns'
import { vi } from 'vitest'
import { registrationDogAged28MonthsWithNOUResult } from '../../__mockData__/dogs'
import {
  eventWithStaticDates,
  eventWithStaticDatesAnd3Classes,
  eventWithStaticDatesAndClass,
} from '../../__mockData__/events'
import { registrationWithStaticDates, registrationWithStaticDatesAndClass } from '../../__mockData__/registrations'
import { addDays, dayEnd, dayStart, TIME_ZONE } from '../../lib/day'
import { qualifyJsonRegistration } from '../../lib/qualification'
import { GROUP_KEY_RESERVE } from '../../lib/registration'
import { legacyRegistrationDays, rekeyRegistrationDays } from '../../lib/storedDays'
import { finnishDayOf, legacyDayValue } from '../../test-utils/finnishDays'
import { CONFIG } from '../config'
import { LambdaError } from '../lib/lambda'
import { ISO8601DateTimeRE } from '../test-utils/constants'
import { constructAPIGwEvent, deletedEvent, eventNotFound, storedRegistrationJson } from '../test-utils/helpers'
import { loggedLines } from '../test-utils/logs'

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

const mockGetEvent = vi.fn()
const mockGetLiveEvent = vi.fn<(eventId: string) => Promise<JsonDogEvent>>()
const mockApplyNewRegistrationStatsOnce = vi.fn()
const mockUpdateEventStatsForRegistration = vi.fn()
const mockUpdateRegistrations = vi.fn()
const mockPublishRegistrationPatches = vi.fn()
const mockQueryUsersByEmail = vi.fn().mockResolvedValue([])
// Every audit record written, through either writer (lib/audit owns the audit table until KOE-1415).
const mockWriteAudit = vi.fn()
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
  getLiveEvent: mockGetLiveEvent,
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
  // Nobody has the public start list open.
  publishPublicStartList: vi.fn(),
  publishPublicStartListStrict: vi.fn(),
  publishRegistrationPatches: mockPublishRegistrationPatches,
  publishRegistrationPatchesStrict: mockPublishRegistrationPatches,
}))

// The dog table: no official results unless a test puts a dog's there.
const mockReadOfficialResults = vi.fn<(regNo: string) => Promise<JsonTestResult[]>>().mockResolvedValue([])
vi.doMock('../lib/repositories/dogRepository', () => ({
  readOfficialResults: mockReadOfficialResults,
}))

vi.doMock('../lib/audit', async () => ({
  ...(await vi.importActual<typeof import('../lib/audit')>('../lib/audit')),
  audit: async (item: unknown) => mockWriteAudit(item),
  auditStrict: async (item: unknown) => mockWriteAudit(item),
}))

// Outside prod mail goes to staff only; nobody is staff unless a test says so (KOE-1469).
vi.doMock('../lib/repositories/userRepository', () => ({
  queryUsersByEmail: mockQueryUsersByEmail,
}))

const mockGetRegistration = vi.fn<(eventId: string, registrationId: string) => Promise<JsonRegistration>>()
const mockWriteRegistration = vi.fn()
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

const mockAuthorize = vi.fn<() => Promise<{ name: string } | null>>().mockResolvedValue(null)
vi.doMock('../lib/auth', () => ({
  authorize: mockAuthorize,
}))

const mockClearRegistrationEmailDeliveryStatus = vi.fn()
const mockUpdateRegistrationField = vi.fn()
vi.doMock('../lib/repositories/registrationRepository', () => ({
  claimNewRegistrationPostProcessing: mockClaimNewRegistrationPostProcessing,
  clearRegistrationEmailDeliveryStatus: mockClearRegistrationEmailDeliveryStatus,
  markNewRegistrationPhase: mockMarkNewRegistrationPhase,
  updateRegistrationField: mockUpdateRegistrationField,
  writeRegistration: mockWriteRegistration,
}))

const libRegistration = await import('../lib/registration')
const mockAuthorizeRegistrationEdit = vi.fn(() => 'test-edit-token')

vi.doMock('../lib/registration', () => ({
  ...libRegistration,
  authorizeRegistrationEdit: mockAuthorizeRegistrationEdit,
  findExistingRegistrationToEventForDog: mockfindExistingRegistrationToEventForDog,
  getReadyRegistrationsByEventId: mockGetReadyRegistrationsByEventId,
  getRegistration: mockGetRegistration,
  patchRegistration: mockPatchRegistration,
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

const { default: putRegistrationLabmda } = await import('./handler')

/** What only the secretary may see of a stored registration (KOE-1515). */
const secretaryGroup = { date: finnishDayOf(eventWithStaticDates.startDate), key: 'ap', number: 2, time: 'ap' as const }
const secretaryOnlyFields = {
  eventResult: { result: 'AVO1', updatedAt: '2026-05-27T10:00:00.000Z', updatedBy: 'Secretary' },
  group: secretaryGroup,
  internalNotes: 'call the owner',
  startGroup: { ...secretaryGroup, number: 7 },
}
const expectNoSecretaryOnlyFields = (body: unknown) => {
  Object.keys(secretaryOnlyFields).forEach((field) => {
    expect(body).not.toHaveProperty(field)
  })
}

describe('putRegistrationLabmda', () => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)

  // These tests are about the mail itself; outside prod it would go to staff only (KOE-1469)
  const stageName = CONFIG.stageName
  beforeAll(() => {
    vi.useFakeTimers()
    CONFIG.stageName = 'prod'
  })
  beforeEach(() => {
    vi.setSystemTime(eventWithStaticDates.entryStartDate)
    mockUpdateRegistrations.mockResolvedValue({ ...eventWithStaticDates, organizer: { id: 'org-1' } })
  })
  afterEach(() => {
    vi.clearAllMocks()
    mockAssertRegistrationEmailsNotSuppressed.mockResolvedValue(undefined)
    mockUpdateRegistrations.mockResolvedValue({ ...eventWithStaticDates, organizer: { id: 'org-1' } })
  })
  afterAll(() => {
    vi.useRealTimers()
    CONFIG.stageName = stageName
  })

  it('answers a new registration without the group it was placed in (KOE-1515)', async () => {
    vi.setSystemTime(eventWithStaticDates.entryStartDate)
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    // The completed registration is the stored row after the groups were reconciled.
    mockClaimNewRegistrationPostProcessing.mockResolvedValueOnce({
      registration: { ...storedRegistrationJson(registrationWithStaticDates), ...secretaryOnlyFields },
      release: async () => undefined,
      token: 'test-token',
    })
    const { id: _1, paidAmount: _2, paidAt: _3, paymentStatus: _4, ...registration } = registrationWithStaticDates

    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registration, state: 'ready' }))

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.id).toBe(registrationWithStaticDates.id)
    expectNoSecretaryOnlyFields(body)
    // The payment state goes with every answer, a new registration's too (KOE-1526): paid in full.
    expect(body).toMatchObject({ payment: { canPay: false, due: 0 } })
  })

  it('should do happy path for new registration', async () => {
    vi.setSystemTime(eventWithStaticDates.entryStartDate)
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
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

    expect(mockWriteRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        ...storedRegistrationJson(registration),
        createdAt: expect.stringMatching(ISO8601DateTimeRE),
        createdBy: 'Owner Name',
        handler: expect.objectContaining({ email: 'handler@example.com' }),
        id: expect.stringMatching(/^[A-Za-z0-9_-]{10}$/),
        modifiedAt: expect.stringMatching(ISO8601DateTimeRE),
        modifiedBy: 'Owner Name',
        owner: expect.objectContaining({ email: 'owner@example.com' }),
        payer: expect.objectContaining({ email: 'payer@example.com' }),
        updatedAt: expect.stringMatching(ISO8601DateTimeRE),
      })
    )
    expect(mockWriteRegistration).toHaveBeenCalledWith(expect.objectContaining({ state: 'creating' }))
    expect(mockWriteRegistration).toHaveBeenCalledTimes(1)
    expect(mockApplyNewRegistrationStatsOnce).toHaveBeenCalledWith(
      registrationWithStaticDates,
      expect.objectContaining({ id: eventWithStaticDates.id }),
      'test-token'
    )
    expect(mockUpdateEventStatsForRegistration).not.toHaveBeenCalled()

    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: expect.any(String),
        messageKey: 'audit.messages.registrationCreated',
        user: 'Owner Name',
        userSource: 'registration',
      })
    )
    expect(mockWriteAudit).toHaveBeenCalledTimes(1)

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

  it('audits a warning when a new registration has dates outside its class days', async () => {
    vi.setSystemTime(eventWithStaticDatesAnd3Classes.entryStartDate)
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDatesAnd3Classes)))
    const { id: _1, paidAmount: _2, paidAt: _3, paymentStatus: _4, ...registration } = registrationWithStaticDates
    // VOI runs on the event's end date; the registration picks the start date instead
    const mismatching = {
      ...registration,
      class: 'VOI',
      dates: [{ date: eventWithStaticDatesAnd3Classes.startDate, time: 'kp' }],
      eventId: eventWithStaticDatesAnd3Classes.id,
      eventType: eventWithStaticDatesAnd3Classes.eventType,
    }
    mockClaimNewRegistrationPostProcessing.mockResolvedValueOnce({
      registration: JSON.parse(JSON.stringify({ ...mismatching, id: 'mismatch-reg' })),
      release: async () => undefined,
      token: 'test-token',
    })

    const res = await putRegistrationLabmda(constructAPIGwEvent(mismatching))

    expect(res.statusCode).toEqual(200)
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({ messageKey: 'audit.messages.registrationCreated' })
    )
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        messageKey: 'audit.messages.registrationDaysOutsideClass',
        messageParams: { days: '10.2.2021', eventClass: 'VOI' },
      })
    )
    expect(mockWriteAudit).toHaveBeenCalledTimes(2)
  })

  it('rejects an update when edit-token authorization fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(storedRegistrationJson(registrationWithStaticDates))
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
    // A rejected request is the request's fault and logs at info, not as an error of ours (KOE-1342).
    expect(errorSpy).not.toHaveBeenCalled()
    expect(mockPatchRegistration).not.toHaveBeenCalled()
  })

  it('should send email for new registration when paymentTime is confirmation', async () => {
    vi.setSystemTime(eventWithStaticDates.entryStartDate)
    const eventWithConfirmationPayment = { ...eventWithStaticDates, paymentTime: 'confirmation' }
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithConfirmationPayment)))
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

    expect(mockWriteRegistration).toHaveBeenCalledWith(
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
    // Outside prod only staff get mail: make every recipient an admin of this environment
    mockQueryUsersByEmail.mockResolvedValue([{ admin: true }])
    mockGetLiveEvent.mockResolvedValueOnce(
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
      mockQueryUsersByEmail.mockReset().mockResolvedValue([])
    }
  })

  it('rejects a concurrent confirmation-time create that wins after the initial duplicate check', async () => {
    const eventWithConfirmationPayment = { ...eventWithStaticDates, paymentTime: 'confirmation' as const }
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithConfirmationPayment)))
    mockfindExistingRegistrationToEventForDog
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ ...storedRegistrationJson(registrationWithStaticDates), state: 'ready' })

    const res = await putRegistrationLabmda(
      constructAPIGwEvent({ ...registrationWithStaticDates, creationIdempotencyKey: 'new-key', id: undefined })
    )

    expect(res.statusCode).toBe(409)
    expect(mockLockRegistrationPayments).toHaveBeenCalledWith(eventWithStaticDates.id)
    expect(mockWriteRegistration).not.toHaveBeenCalled()
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
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithConfirmationPayment)))
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce(undefined).mockResolvedValueOnce(winner)

    const res = await putRegistrationLabmda(constructAPIGwEvent(request))

    expect(res.statusCode).toBe(409)
    expect(mockWriteRegistration).not.toHaveBeenCalled()
  })

  it('resumes a same-key confirmation-time create that wins while waiting for the lock', async () => {
    const eventWithConfirmationPayment = { ...eventWithStaticDates, paymentTime: 'confirmation' as const }
    const request = { ...registrationWithStaticDates, creationIdempotencyKey: 'same-key', id: undefined }
    // The winner found under the lock may already be placed and scored; the answer leaves those out (KOE-1515).
    const winner = {
      ...JSON.parse(JSON.stringify(request)),
      ...secretaryOnlyFields,
      id: 'winning-registration',
      state: 'ready',
    }
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithConfirmationPayment)))
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce(undefined).mockResolvedValueOnce(winner)
    mockClaimNewRegistrationPostProcessing.mockResolvedValueOnce(undefined)

    const res = await putRegistrationLabmda(constructAPIGwEvent(request))

    expect(res.statusCode).toBe(200)
    expect(mockWriteRegistration).not.toHaveBeenCalled()
    const body = JSON.parse(res.body)
    expect(body.id).toBe(winner.id)
    expect(body.editToken).toBe(await libRegistration.getRegistrationEditToken(winner))
    expectNoSecretaryOnlyFields(body)
  })

  it('should reject new registration with suppressed email address', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.setSystemTime(eventWithStaticDates.entryStartDate)
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
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
      }),
      undefined
    )
    expect(mockWriteRegistration).not.toHaveBeenCalled()
    expect(res.statusCode).toEqual(409)
    expect(JSON.parse(res.body)).toEqual({
      email: 'owner@example.com',
      error: 'emailSuppressed',
      reason: 'smtp; 550 user unknown',
    })
    // A rejected request is the request's fault and logs at info, not as an error of ours (KOE-1342).
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('should reject updated registration with suppressed email address', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const existingJson = storedRegistrationJson(registrationWithStaticDates)
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
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
      }),
      existingJson
    )
    expect(mockWriteRegistration).not.toHaveBeenCalled()
    expect(res.statusCode).toEqual(409)
    expect(JSON.parse(res.body)).toEqual({
      email: 'handler@example.com',
      error: 'emailSuppressed',
      reason: 'smtp; 550 user unknown',
    })
    // A rejected request is the request's fault and logs at info, not as an error of ours (KOE-1342).
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('answers a save without the result, the notes or the groups (KOE-1515)', async () => {
    const existingJson = { ...storedRegistrationJson(registrationWithStaticDates), ...secretaryOnlyFields }
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)

    const res = await putRegistrationLabmda(
      constructAPIGwEvent({
        ...registrationWithStaticDates,
        notes: 'updated notes',
      })
    )

    expect(res.statusCode).toEqual(200)
    const body = JSON.parse(res.body)
    expect(body.notes).toEqual('updated notes')
    expectNoSecretaryOnlyFields(body)
  })

  // The group stays out of the answer, so what is owed goes with it (KOE-1526).
  it.each([
    ['nothing while it is a reserve', { key: 'reserve', number: 1 }, 0],
    ['the fee again once it has a place', secretaryGroup, 123],
  ])('answers a save of a reserve whose fee was refunded with %s owed (KOE-1526)', async (_name, group, due) => {
    const existingJson = {
      ...storedRegistrationJson(registrationWithStaticDates),
      group,
      refundAmount: 123,
      refundHandlingCost: 0,
    }
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)

    const res = await putRegistrationLabmda(
      constructAPIGwEvent({ ...registrationWithStaticDates, notes: 'updated notes' })
    )

    expect(res.statusCode).toEqual(200)
    const body = JSON.parse(res.body)
    expect(body.payment.due).toBe(due)
    expect(body.payment.canPay).toBe(due > 0)
    expect(body).not.toHaveProperty('group')
  })

  it('should clear email delivery status from response after sending update email', async () => {
    const existingJson = {
      ...storedRegistrationJson(registrationWithStaticDates),
      emailDeliveryStatus: {
        at: '2026-05-27T10:00:00.000Z',
        email: 'handler@example.com',
        status: 'bounce' as const,
      },
    }
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
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
      ...storedRegistrationJson(registrationWithStaticDates),
      emailDeliveryStatus: {
        at: '2026-05-27T10:00:00.000Z',
        email: 'handler@example.com',
        status: 'bounce' as const,
      },
    }
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
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

  // A missing or predefined reason is named by its key, so the trail reads it in the reader's
  // language; a reason the entrant wrote has no key and is shown as written (KOE-1442). Neither
  // stores a Finnish text beside it (KOE-1511).
  it.each([
    [undefined, { reasonKey: 'audit.reasonMissing' }],
    ['dog-heat', { reasonKey: 'registration.cancelReason.dog-heat' }],
    ['handler-sick', { reasonKey: 'registration.cancelReason.handler-sick' }],
    ['dog-sick', { reasonKey: 'registration.cancelReason.dog-sick' }],
    ['gdpr', { reasonKey: 'registration.cancelReason.gdpr' }],
    ['custom reason', { reason: 'custom reason' }],
  ])('should do happy path for cancelled registration', async (cancelReason, messageParams) => {
    const existingJson = storedRegistrationJson(registrationWithStaticDates)
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
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
        modifiedBy: 'Owner Name',
        updatedAt: new Date().toISOString(),
      }
    )
    expect(mockPatchRegistration).toHaveBeenCalledTimes(1)
    expect(mockWriteRegistration).not.toHaveBeenCalled()
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(1)

    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        messageKey: 'audit.messages.registrationCancelled',
        messageParams,
        user: 'Owner Name',
        userSource: 'registration',
      })
    )
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        messageKey: 'audit.messages.emailSentTo',
        messageParams: expect.objectContaining({ recipients: 'handler@example.com, owner@example.com' }),
        user: 'Owner Name',
        userSource: 'registration',
      })
    )
    expect(mockWriteAudit).toHaveBeenCalledTimes(2)

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
    const existingJson = storedRegistrationJson({ ...registration, reserveNotified: 2 })

    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
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
        modifiedBy: 'Owner Name',
        updatedAt: new Date().toISOString(),
      }
    )
    expect(mockPatchRegistration).toHaveBeenCalledTimes(1)
    expect(mockWriteRegistration).not.toHaveBeenCalled()
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(1)

    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        messageKey: 'audit.messages.registrationCancelled',
        user: 'Owner Name',
        userSource: 'registration',
      })
    )
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        messageKey: 'audit.messages.emailSentTo',
        messageParams: expect.objectContaining({ recipients: 'handler@example.com, owner@example.com' }),
        user: 'Owner Name',
        userSource: 'registration',
      })
    )
    expect(mockWriteAudit).toHaveBeenCalledTimes(2)

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
    vi.setSystemTime(addMinutes(dayEnd(eventWithStaticDates.entryEndDate, TIME_ZONE), 1))

    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { key: GROUP_KEY_RESERVE, number: 2 },
    }
    const existingJson = storedRegistrationJson({ ...registration, reserveNotified: undefined })

    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
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
        modifiedBy: 'Owner Name',
        updatedAt: new Date().toISOString(),
      }
    )
    expect(mockPatchRegistration).toHaveBeenCalledTimes(1)
    expect(mockWriteRegistration).not.toHaveBeenCalled()
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(1)

    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        messageKey: 'audit.messages.registrationCancelled',
        user: 'Owner Name',
        userSource: 'registration',
      })
    )
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        messageKey: 'audit.messages.emailSentTo',
        messageParams: expect.objectContaining({ recipients: 'handler@example.com, owner@example.com' }),
        user: 'Owner Name',
        userSource: 'registration',
      })
    )
    expect(mockWriteAudit).toHaveBeenCalledTimes(2)

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
    vi.setSystemTime(addMinutes(dayEnd(eventWithStaticDates.entryEndDate, TIME_ZONE), 1))

    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { key: 'participants-1', number: 2 },
    }
    const existingJson = storedRegistrationJson(registration)

    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
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
        modifiedBy: 'Owner Name',
        updatedAt: new Date().toISOString(),
      }
    )
    expect(mockPatchRegistration).toHaveBeenCalledTimes(1)
    expect(mockWriteRegistration).not.toHaveBeenCalled()
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(1)

    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        messageKey: 'audit.messages.registrationCancelled',
        user: 'Owner Name',
        userSource: 'registration',
      })
    )
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        messageKey: 'audit.messages.emailSentTo',
        messageParams: expect.objectContaining({ recipients: 'handler@example.com, owner@example.com' }),
        user: 'Owner Name',
        userSource: 'registration',
      })
    )
    expect(mockWriteAudit).toHaveBeenCalledTimes(2)

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

  // A cleared result picker leaves a hand-entered result with no date, and the schema allows it: the
  // save goes through, and the result does not count (KOE-1548).
  it('saves a registration with a hand-entered result that has no date', async () => {
    const existingJson = storedRegistrationJson(registrationWithStaticDates)
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)
    const undated = { class: 'ALO', id: 'm1', judge: 'J', location: 'L', result: 'ALO1', type: 'NOME-B' }
    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, results: [undated] }))

    expect(res.statusCode).toEqual(200)
    expect(mockPatchRegistration).toHaveBeenCalledWith(
      eventWithStaticDates.id,
      registrationWithStaticDates.id,
      existingJson,
      expect.objectContaining({ results: [undated] })
    )
  })

  it('should do happy path for updating registration', async () => {
    const existingJson = storedRegistrationJson(registrationWithStaticDates)
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
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
        modifiedBy: 'Owner Name',
        notes: 'updated notes',
        updatedAt: new Date().toISOString(),
      }
    )
    expect(mockPatchRegistration).toHaveBeenCalledTimes(1)
    expect(mockWriteRegistration).not.toHaveBeenCalled()
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(1)
    // The entrant's own save tells their other open pages too, beside the response (KOE-1553).
    expect(mockPublishParticipantRegistrationPatches).toHaveBeenCalledWith(
      eventWithStaticDates.id,
      [registrationWithStaticDates.id],
      expect.any(Function)
    )

    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: expect.any(String),
        changes: [
          {
            field: 'notes',
            labelKey: 'registration.notes',
            next: { text: 'updated notes' },
            previous: { text: 'additional notes' },
          },
        ],
        messageKey: 'audit.changed',
        user: 'Owner Name',
        userSource: 'registration',
      })
    )
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        user: 'Owner Name',
        userSource: 'registration',
      })
    )
    expect(mockWriteAudit).toHaveBeenCalledTimes(2)

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

  it('names the rows after the payer the update itself names', async () => {
    const existingJson = storedRegistrationJson(registrationWithStaticDates)
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)
    const updatedRegistration = {
      ...registrationWithStaticDates,
      payer: { ...registrationWithStaticDates.payer, name: 'New Payer' },
    }
    const res = await putRegistrationLabmda(constructAPIGwEvent(updatedRegistration))

    expect(mockPatchRegistration).toHaveBeenCalledWith(
      eventWithStaticDates.id,
      registrationWithStaticDates.id,
      existingJson,
      expect.objectContaining({ modifiedBy: 'New Payer', payer: expect.objectContaining({ name: 'New Payer' }) })
    )
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'New Payer',
        userSource: 'registration',
      })
    )
    expect(res.statusCode).toEqual(200)
  })

  it('names the rows after the owner the ownerPays selection names', async () => {
    const existingJson = storedRegistrationJson(registrationWithStaticDates)
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)
    const updatedRegistration = {
      ...registrationWithStaticDates,
      notes: 'updated notes',
      ownerPays: 'owner-2',
      owners: [
        { ...registrationWithStaticDates.owner, key: 'owner-1' },
        { email: 'second@example.com', key: 'owner-2', membership: false, name: 'Second Owner', phone: '' },
      ],
    }
    const res = await putRegistrationLabmda(constructAPIGwEvent(updatedRegistration))

    expect(mockPatchRegistration).toHaveBeenCalledWith(
      eventWithStaticDates.id,
      registrationWithStaticDates.id,
      existingJson,
      expect.objectContaining({ modifiedBy: 'Second Owner' })
    )
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({ user: 'Second Owner', userSource: 'registration' })
    )
    expect(res.statusCode).toEqual(200)
  })

  it('names the rows after the login on the logged-in route, without the registration mark', async () => {
    mockAuthorize.mockResolvedValueOnce({ name: 'Kirjautunut Käyttäjä' })
    const existingJson = storedRegistrationJson(registrationWithStaticDates)
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)
    const res = await putRegistrationLabmda(
      constructAPIGwEvent({ ...registrationWithStaticDates, notes: 'updated notes' }, { path: '/user/registration' })
    )

    expect(mockPatchRegistration).toHaveBeenCalledWith(
      eventWithStaticDates.id,
      registrationWithStaticDates.id,
      existingJson,
      expect.objectContaining({ modifiedBy: 'Kirjautunut Käyttäjä' })
    )
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({ messageKey: 'audit.changed', user: 'Kirjautunut Käyttäjä' })
    )
    expect(mockWriteAudit).not.toHaveBeenCalledWith(expect.objectContaining({ userSource: expect.anything() }))
    expect(res.statusCode).toEqual(200)
  })

  it('should merge partial patch payloads before diffing and saving', async () => {
    const existingJson = storedRegistrationJson(registrationWithStaticDates)
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
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
    expect(mockWriteRegistration).not.toHaveBeenCalled()
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
    const existingJson = storedRegistrationJson(registrationWithStaticDates)
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
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
    const existingJson = storedRegistrationJson(registrationWithStaticDates)
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
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
    const existingJson = storedRegistrationJson(registrationWithStaticDates)
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
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
        modifiedBy: 'Owner Name',
        updatedAt: new Date().toISOString(),
      }
    )
    expect(mockPatchRegistration).toHaveBeenCalledTimes(1)
    expect(mockWriteRegistration).not.toHaveBeenCalled()
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(1)

    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: expect.any(String),
        messageKey: 'audit.messages.registrationConfirmed',
        user: 'Owner Name',
        userSource: 'registration',
      })
    )
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        user: 'Owner Name',
        userSource: 'registration',
      })
    )
    expect(mockWriteAudit).toHaveBeenCalledTimes(2)

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
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)

    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, confirmed: true }))

    expect(mockWriteRegistration).not.toHaveBeenCalled()
    expect(mockPatchRegistration).not.toHaveBeenCalled()
    expect(mockUpdateEventStatsForRegistration).not.toHaveBeenCalled()
    expect(mockUpdateRegistrations).not.toHaveBeenCalled()
    expect(mockWriteAudit).not.toHaveBeenCalled()
    expect(mockSES.send).not.toHaveBeenCalled()

    expect(res.statusCode).toEqual(304)
    expect(res.body).toBeUndefined()
  })

  // A row stored before the dog's dates were day keys (KOE-1548) holds the old forms: the birth date
  // as the instant a Finnish browser wrote, the dog table's results as Kennelliitto's stamps, the
  // qualifying results as the instants the lambda wrote. The same days saved again are no change.
  it('answers an unchanged save of a row stored before the dog dates were day keys with 304 (KOE-1548)', async () => {
    const event = JSON.parse(JSON.stringify(eventWithStaticDates))
    const official: JsonTestResult[] = [
      {
        class: '',
        date: legacyDayValue('2021-03-01T00:00:00'),
        judge: 'J',
        location: 'L',
        result: 'NOU1',
        type: 'NOU',
      },
    ]
    const manual: JsonManualTestResult[] = [
      {
        class: 'ALO',
        date: '2021-02-01' as const,
        id: 'm1',
        judge: 'J',
        location: 'L',
        result: 'ALO1',
        type: 'NOME-B',
      },
    ]
    const body: JsonRegistration = JSON.parse(
      JSON.stringify({
        ...registrationWithStaticDates,
        confirmed: true,
        dog: { ...registrationWithStaticDates.dog, dob: '2020-01-01' as const, results: [] },
        results: manual,
      })
    )
    const qualification = qualifyJsonRegistration({ ...body, dog: { ...body.dog, results: official } }, event)
    const existingJson: JsonRegistration = {
      ...body,
      dog: { ...body.dog, dob: legacyDayValue('2019-12-31T22:00:00.000Z'), results: official },
      qualifies: qualification.qualifies,
      qualifyingResults: qualification.qualifyingResults.map((r) => ({
        ...r,
        date: legacyDayValue(`${r.date}T00:00:00.000Z`),
      })),
      results: manual.map((r) => ({ ...r, date: legacyDayValue('2021-01-31T22:00:00.000Z') })),
    }
    mockGetLiveEvent.mockResolvedValueOnce(event)
    mockGetRegistration.mockResolvedValueOnce(existingJson)
    mockReadOfficialResults.mockResolvedValueOnce(official)

    const res = await putRegistrationLabmda(constructAPIGwEvent(body))

    expect(mockWriteRegistration).not.toHaveBeenCalled()
    expect(mockSES.send).not.toHaveBeenCalled()
    expect(res.statusCode).toEqual(304)
  })

  // KOE-1547: the entry's days are keys on the row, a row not yet migrated holds instants, and a browser
  // loaded before the change sends instants. The same days in the other form are no change either way.
  it.each([
    ['instants sent over a row of keys', true, false],
    ['keys sent over a row of instants', false, true],
  ])('answers an unchanged save of %s with 304', async (_name, sentAsInstants, storedAsInstants) => {
    const event = JSON.parse(JSON.stringify(eventWithStaticDates))
    const base: JsonRegistration = JSON.parse(JSON.stringify({ ...registrationWithStaticDates, confirmed: true }))
    rekeyRegistrationDays(base, legacyRegistrationDays)
    // The entry's days as keys, or as the instants their Finnish days start at.
    const withDays = (asInstants: boolean): JsonRegistration => {
      const form = (day: DayKey) => (asInstants ? legacyDayValue(dayStart(day, TIME_ZONE).toISOString()) : day)
      const copy: JsonRegistration = structuredClone(base)
      copy.dates = copy.dates.map((date) => ({ ...date, date: form(date.date) }))
      if (copy.group?.date) copy.group = { ...copy.group, date: form(copy.group.date) }
      return copy
    }
    mockGetLiveEvent.mockResolvedValueOnce(event)
    mockGetRegistration.mockResolvedValueOnce(withDays(storedAsInstants))

    const res = await putRegistrationLabmda(constructAPIGwEvent(withDays(sentAsInstants)))

    expect(mockWriteRegistration).not.toHaveBeenCalled()
    expect(res.statusCode).toEqual(304)
  })

  it('should not send secretary email on cancellation if secretary has no email', async () => {
    const eventWithoutSecretaryEmail = {
      ...eventWithStaticDates,
      contactInfo: { secretary: { name: 'Testi Testinen' } },
    }
    const existingJson = storedRegistrationJson(registrationWithStaticDates)
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithoutSecretaryEmail)))
    // The notice goes by the event as recounted after the save.
    mockUpdateRegistrations.mockResolvedValueOnce(
      JSON.parse(JSON.stringify({ ...eventWithoutSecretaryEmail, organizer: { id: 'org-1' } }))
    )
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
    const existingJson = storedRegistrationJson({ ...registrationWithStaticDates, cancelled: true })
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
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
        modifiedBy: 'Owner Name',
        updatedAt: new Date().toISOString(),
      }
    )
    expect(mockPatchRegistration).toHaveBeenCalledTimes(1)
    expect(mockWriteRegistration).not.toHaveBeenCalled()

    // No audit message for confirmation
    expect(mockWriteAudit).not.toHaveBeenCalledWith(
      expect.objectContaining({
        messageKey: 'audit.messages.registrationConfirmed',
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
    const existingJson = storedRegistrationJson(registrationWithStaticDates)
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)
    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, cancelled: true }))
    expect(res.statusCode).toEqual(200)
    expect(loggedLines(errorSpy)).toContainEqual(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'test error' }),
        message: 'error notifying cancellation to secretary',
      })
    )
  })

  it('should send invitation read email', async () => {
    const existingJson = {
      ...storedRegistrationJson(registrationWithStaticDates),
      invitationAttachmentSent: 'sent-attachment',
      messagesSent: { invitation: true },
    }
    mockGetLiveEvent.mockResolvedValueOnce({
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
      ...storedRegistrationJson(registrationWithStaticDates),
      invitationAttachmentRead: 'old-attachment',
      invitationAttachmentSent: 'new-attachment',
      invitationRead: true,
      messagesSent: { invitation: true },
    }
    mockGetLiveEvent.mockResolvedValueOnce({
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
    mockGetLiveEvent.mockRejectedValueOnce(
      new LambdaError(404, `Event with id '${eventWithStaticDates.id}' was not found`)
    )

    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, id: undefined }))

    expect(res.statusCode).toEqual(404)
  })

  // KOE-1586: a deleted event still took registrations from anyone holding its id.
  it('answers a deleted event as a missing one, and stores nothing', async () => {
    vi.setSystemTime(eventWithStaticDates.entryStartDate)
    mockGetEvent.mockResolvedValueOnce(deletedEvent(JSON.parse(JSON.stringify(eventWithStaticDates))))
    mockGetLiveEvent.mockRejectedValueOnce(eventNotFound(eventWithStaticDates.id))

    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, id: undefined }))

    expect(res.statusCode).toEqual(404)
    expect(mockGetLiveEvent).toHaveBeenCalledWith(eventWithStaticDates.id)
    expect(mockWriteRegistration).not.toHaveBeenCalled()
  })

  it('should return 404 when updating a registration after the event has ended', async () => {
    vi.setSystemTime(dayStart(addDays(eventWithStaticDates.endDate, 1), TIME_ZONE))
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(storedRegistrationJson(registrationWithStaticDates))

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

  // The participant's own form and the server read one rule (KOE-1584): what the entry says is closed
  // from the close of entry to the trial and once the class has been judged; confirming, cancelling and
  // reading an invitation are not edits of it and stay open until the trial's last day has gone.
  describe.each([
    [
      'between the close of entry and the trial',
      addMinutes(dayEnd(eventWithStaticDates.entryEndDate, TIME_ZONE), 1),
      'invited',
    ],
    [
      'on a trial day once the class has ended',
      addMinutes(dayStart(eventWithStaticDates.startDate, TIME_ZONE), 720),
      'ended',
    ],
  ] as const)('%s', (_label, now, state) => {
    const event = () => ({ ...JSON.parse(JSON.stringify(eventWithStaticDates)), state })
    const existingJson = () => ({
      ...storedRegistrationJson(registrationWithStaticDates),
      invitationAttachmentSent: 'sent-attachment',
      messagesSent: { invitation: true, picked: true },
    })
    const patch = (fields: Partial<JsonRegistration>) =>
      constructAPIGwEvent(
        { eventId: registrationWithStaticDates.eventId, id: registrationWithStaticDates.id, ...fields },
        { method: 'PATCH' }
      )

    beforeEach(() => {
      vi.setSystemTime(now)
      mockGetLiveEvent.mockResolvedValueOnce(event())
      mockGetRegistration.mockResolvedValueOnce(existingJson())
    })

    it('refuses an edit of what the entry says with 410', async () => {
      const res = await putRegistrationLabmda(patch({ notes: 'late edit' }))

      expect(res.statusCode).toBe(410)
      expect(JSON.parse(res.body)).toEqual({ message: 'Gone: the entry can no longer be edited' })
      expect(mockPatchRegistration).not.toHaveBeenCalled()
    })

    it('refuses an edit that comes with a cancellation', async () => {
      const res = await putRegistrationLabmda(patch({ cancelled: true, notes: 'late edit' }))

      expect(res.statusCode).toBe(410)
      expect(mockPatchRegistration).not.toHaveBeenCalled()
    })

    it.each([
      ['a confirmation', { confirmed: true }],
      ['a cancellation', { cancelled: true, cancelReason: 'sick' }],
      ['an invitation read', { invitationRead: true }],
    ] as const)('saves %s', async (_kind, fields) => {
      const res = await putRegistrationLabmda(patch(fields))

      expect(res.statusCode).toBe(200)
      expect(mockPatchRegistration).toHaveBeenCalledWith(
        registrationWithStaticDates.eventId,
        registrationWithStaticDates.id,
        existingJson(),
        expect.objectContaining(fields)
      )
    })

    // A full body carries every field the browser holds, and so every field the server derives or
    // stores on its own besides the request's (KOE-1584).
    it.each([
      ['a confirmation', { confirmed: true }],
      ['a cancellation', { cancelled: true, cancelReason: 'sick' }],
    ] as const)('saves %s sent as the whole registration', async (_kind, fields) => {
      const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, ...fields }))

      expect(res.statusCode).toBe(200)
      expect(mockPatchRegistration).toHaveBeenCalledWith(
        registrationWithStaticDates.eventId,
        registrationWithStaticDates.id,
        existingJson(),
        expect.objectContaining(fields)
      )
    })

    it('refuses an edit sent as the whole registration with 410', async () => {
      const res = await putRegistrationLabmda(
        constructAPIGwEvent({ ...registrationWithStaticDates, confirmed: true, notes: 'late edit' })
      )

      expect(res.statusCode).toBe(410)
      expect(mockPatchRegistration).not.toHaveBeenCalled()
    })
  })

  // The entry's own class decides, not the event's state: ALO has been judged on the first day while
  // AVO still runs on the second (KOE-1584).
  it.each([
    ['ALO', 410],
    ['AVO', 200],
  ] as const)('answers an edit of an entry in %s once ALO has ended with %s (KOE-1584)', async (eventClass, status) => {
    vi.setSystemTime(addMinutes(dayStart(eventWithStaticDatesAndClass.startDate, TIME_ZONE), 720))
    mockGetLiveEvent.mockResolvedValueOnce({
      ...JSON.parse(JSON.stringify(eventWithStaticDatesAndClass)),
      classes: [
        { class: 'ALO', date: '2021-02-10', state: 'ended' },
        { class: 'AVO', date: '2021-02-11', state: 'started' },
      ],
      state: 'started',
    })
    const existingJson = storedRegistrationJson({ ...registrationWithStaticDatesAndClass, class: eventClass })
    mockGetRegistration.mockResolvedValueOnce(existingJson)

    const res = await putRegistrationLabmda(
      constructAPIGwEvent(
        { eventId: existingJson.eventId, id: existingJson.id, notes: 'judged or not' },
        { method: 'PATCH' }
      )
    )

    expect(res.statusCode).toBe(status)
    if (status === 410) expect(mockPatchRegistration).not.toHaveBeenCalled()
    else
      expect(mockPatchRegistration).toHaveBeenCalledWith(
        existingJson.eventId,
        existingJson.id,
        existingJson,
        expect.objectContaining({ notes: 'judged or not' })
      )
  })

  it('answers an edit sent as the whole registration after the trial with 404 (KOE-1584)', async () => {
    vi.setSystemTime(dayStart(addDays(eventWithStaticDates.endDate, 1), TIME_ZONE))
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(storedRegistrationJson(registrationWithStaticDates))

    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, notes: 'late edit' }))

    expect(res.statusCode).toBe(404)
    expect(mockPatchRegistration).not.toHaveBeenCalled()
  })

  it('saves an edit of what the entry says on the second day of a started trial (KOE-1584)', async () => {
    vi.setSystemTime(addMinutes(dayStart(eventWithStaticDates.endDate, TIME_ZONE), 720))
    mockGetLiveEvent.mockResolvedValueOnce({ ...JSON.parse(JSON.stringify(eventWithStaticDates)), state: 'started' })
    mockGetRegistration.mockResolvedValueOnce(storedRegistrationJson(registrationWithStaticDates))

    const res = await putRegistrationLabmda(
      constructAPIGwEvent(
        { eventId: registrationWithStaticDates.eventId, id: registrationWithStaticDates.id, notes: 'day two' },
        { method: 'PATCH' }
      )
    )

    expect(res.statusCode).toBe(200)
    expect(mockPatchRegistration).toHaveBeenCalledWith(
      registrationWithStaticDates.eventId,
      registrationWithStaticDates.id,
      storedRegistrationJson(registrationWithStaticDates),
      expect.objectContaining({ notes: 'day two' })
    )
  })

  it('does not expose an existing registration for a duplicate submission', async () => {
    vi.setSystemTime(eventWithStaticDates.entryStartDate)
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce(storedRegistrationJson(registrationWithStaticDates))

    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, id: undefined }))

    expect(res.statusCode).toEqual(409)
    expect(res.body).not.toContain('editToken')
  })

  it('returns a specific conflict for another creation while payment is in progress', async () => {
    vi.setSystemTime(eventWithStaticDates.entryStartDate)
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce({
      ...storedRegistrationJson(registrationWithStaticDates),
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
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce({
      ...storedRegistrationJson(registrationWithStaticDates),
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
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    // The stored registration may already be placed and scored; the retry answers it without those (KOE-1515).
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce({
      ...storedRegistrationJson(registrationWithStaticDates),
      ...secretaryOnlyFields,
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
    expectNoSecretaryOnlyFields(JSON.parse(res.body))
  })

  it('should return 400 for patch registration without eventId and id', async () => {
    const res = await putRegistrationLabmda(constructAPIGwEvent({ notes: 'patched' }, { method: 'PATCH' }))

    expect(res.statusCode).toEqual(400)
    expect(JSON.parse(res.body)).toEqual({ message: 'Bad request: PATCH requires eventId and id' })
    expect(mockGetLiveEvent).not.toHaveBeenCalled()
    expect(mockWriteRegistration).not.toHaveBeenCalled()
    expect(mockPatchRegistration).not.toHaveBeenCalled()
  })

  it.each([
    [{ dates: { 0: { date: '2026-05-16' as const } } }, 'dates must be an array'],
    [{ dog: { regNo: 42 } }, 'dog.regNo must be a string'],
    [{ class: 'KVA' }, 'class must be one of: ALO, AVO, VOI'],
    [{ language: 'sv' }, 'language must be one of: fi, en'],
    [{ agreeToTerms: 'yes' }, 'agreeToTerms must be a boolean'],
    [{ optionalCosts: { 0: 1 } }, 'optionalCosts must be an array'],
  ])('should return 400 for %p before touching the event or the registration', async (body, message) => {
    const res = await putRegistrationLabmda(constructAPIGwEvent({ eventId: 'test1', id: 'reg1', ...body }))

    expect(res.statusCode).toEqual(400)
    expect(JSON.parse(res.body).message).toEqual(`Bad request: ${message}`)
    expect(mockGetLiveEvent).not.toHaveBeenCalled()
    expect(mockWriteRegistration).not.toHaveBeenCalled()
    expect(mockPatchRegistration).not.toHaveBeenCalled()
  })

  it('names every malformed field, not only the first', async () => {
    const res = await putRegistrationLabmda(
      constructAPIGwEvent({ eventId: 'test1', id: 'reg1', notes: 5, reserve: 'MAYBE' })
    )

    expect(res.statusCode).toEqual(400)
    expect(JSON.parse(res.body).errors).toEqual([
      { field: 'notes', message: 'must be a string' },
      { field: 'reserve', message: 'must be one of: ANY, DAY, WEEK, NO, ' },
    ])
  })

  it('should return 410 when creating new registration before entry window opens', async () => {
    // Move current time 1 minute before entryStartDate
    vi.setSystemTime(addMinutes(dayStart(eventWithStaticDates.entryStartDate, TIME_ZONE), -1))

    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, id: undefined }))

    expect(res.statusCode).toEqual(410)
    expect(res.body).toContain('Entry is not open')

    // No writes or side effects should occur
    expect(mockWriteRegistration).not.toHaveBeenCalled()
    expect(mockUpdateEventStatsForRegistration).not.toHaveBeenCalled()
    expect(mockUpdateRegistrations).not.toHaveBeenCalled()
    expect(mockSES.send).not.toHaveBeenCalled()
    expect(mockWriteAudit).not.toHaveBeenCalled()
  })

  it('should return 410 when creating new registration after entry window closes', async () => {
    // Move current time 1 minute after entryEndDate
    vi.setSystemTime(addMinutes(dayEnd(eventWithStaticDates.entryEndDate, TIME_ZONE), 1))

    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, id: undefined }))

    expect(res.statusCode).toEqual(410)
    expect(res.body).toContain('Entry is not open')

    // No writes or side effects should occur
    expect(mockWriteRegistration).not.toHaveBeenCalled()
    expect(mockUpdateEventStatsForRegistration).not.toHaveBeenCalled()
    expect(mockUpdateRegistrations).not.toHaveBeenCalled()
    expect(mockSES.send).not.toHaveBeenCalled()
    expect(mockWriteAudit).not.toHaveBeenCalled()
  })

  // KOE-525: the entry restrictions (KOE-524) gate the API as they gate the form. The mock dog is a
  // curly coated retriever (110) and nobody on the mock registration is a member.
  it('should return 400 when a new registration meets none of the entry restrictions', async () => {
    mockGetLiveEvent.mockResolvedValueOnce(
      JSON.parse(JSON.stringify({ ...eventWithStaticDates, restrictions: ['member', '122'] }))
    )
    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, id: undefined }))

    expect(res.statusCode).toEqual(400)
    expect(res.body).toContain('restricted to members or named breeds')

    // No writes or side effects should occur
    expect(mockWriteRegistration).not.toHaveBeenCalled()
    expect(mockUpdateEventStatsForRegistration).not.toHaveBeenCalled()
    expect(mockUpdateRegistrations).not.toHaveBeenCalled()
    expect(mockSES.send).not.toHaveBeenCalled()
    expect(mockWriteAudit).not.toHaveBeenCalled()
  })

  it.each`
    admitted           | registration
    ${'a member'}      | ${{ ...registrationWithStaticDates, owner: { ...registrationWithStaticDates.owner, membership: true } }}
    ${'a named breed'} | ${{ ...registrationWithStaticDates, dog: { ...registrationWithStaticDates.dog, breedCode: '122' } }}
  `('should save a new registration that meets one entry restriction, $admitted', async ({ registration }) => {
    mockGetLiveEvent.mockResolvedValueOnce(
      JSON.parse(JSON.stringify({ ...eventWithStaticDates, restrictions: ['member', '122'] }))
    )
    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registration, id: undefined }))

    expect(res.statusCode).toEqual(200)
    expect(mockWriteRegistration).toHaveBeenCalledTimes(1)
  })

  it('should return 400 when an update no longer meets the entry restrictions', async () => {
    mockGetLiveEvent.mockResolvedValueOnce(
      JSON.parse(JSON.stringify({ ...eventWithStaticDates, restrictions: ['member'] }))
    )
    mockGetRegistration.mockResolvedValueOnce(
      JSON.parse(
        JSON.stringify({
          ...registrationWithStaticDates,
          owner: { ...registrationWithStaticDates.owner, membership: true },
        })
      )
    )
    const res = await putRegistrationLabmda(
      constructAPIGwEvent({
        ...registrationWithStaticDates,
        owner: { ...registrationWithStaticDates.owner, membership: false },
      })
    )

    expect(res.statusCode).toEqual(400)
    expect(res.body).toContain('restricted to members or named breeds')
    expect(mockWriteRegistration).not.toHaveBeenCalled()
    expect(mockPatchRegistration).not.toHaveBeenCalled()
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

    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
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
    expect(mockWriteRegistration).not.toHaveBeenCalled()
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
    mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
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
  // The official results the eligibility rests on come from the dog table, never from the request:
  // a client can write anything into its own copy of them (KOE-1346).
  describe('official results', () => {
    const jsonDog = JSON.parse(JSON.stringify(registrationDogAged28MonthsWithNOUResult))
    const { id: _1, paidAmount: _2, paidAt: _3, paymentStatus: _4, ...entry } = registrationWithStaticDatesAndClass

    beforeEach(() => {
      vi.setSystemTime(eventWithStaticDatesAndClass.entryStartDate)
      mockGetLiveEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDatesAndClass)))
    })

    it('does not qualify a dog on results the request carries when the dog table holds none', async () => {
      const res = await putRegistrationLabmda(constructAPIGwEvent({ ...entry, state: 'ready' }))

      expect(res.statusCode).toBe(200)
      expect(mockReadOfficialResults).toHaveBeenCalledWith(registrationDogAged28MonthsWithNOUResult.regNo)
      expect(mockWriteRegistration).toHaveBeenCalledWith(
        expect.objectContaining({
          dog: expect.objectContaining({ results: [] }),
          qualifies: false,
          qualifyingResults: [],
        })
      )
    })

    it('qualifies a dog on the results the dog table holds, whatever the request carries', async () => {
      mockReadOfficialResults.mockResolvedValueOnce(jsonDog.results)

      const res = await putRegistrationLabmda(
        constructAPIGwEvent({ ...entry, dog: { ...entry.dog, results: [] }, state: 'ready' })
      )

      expect(res.statusCode).toBe(200)
      expect(mockWriteRegistration).toHaveBeenCalledWith(
        expect.objectContaining({
          dog: expect.objectContaining({ results: jsonDog.results }),
          qualifies: true,
          qualifyingResults: [expect.objectContaining({ official: true, result: 'NOU1', type: 'NOU' })],
        })
      )
    })
  })
})
