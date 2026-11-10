import type { SubmittedTask } from '../../lib/results'
import type {
  EventRotationGroup,
  EventStation,
  EventTeam,
  JsonConfirmedEvent,
  JsonDogEvent,
  JsonEventResult,
  JsonRegistration,
  JsonUser,
  Patch,
  TeamCompetition,
} from '../../types'
import { vi } from 'vitest'
import { jsonRegistrationsToEventWithParticipantsInvited } from '../../__mockData__/registrations'
import { legacyDayValue } from '../../test-utils/finnishDays'
import koemuotoNOWT from '../lib/KLIntegraatio-fixtures/koemuoto-NOWT.json'
import { constructAPIGwEvent } from '../test-utils/helpers'
import { conditionalCheckFailure, registrationStore } from '../test-utils/registrationStore'
// Loaded before the clock is faked: @date-fns/tz's TZDate extends the Date it finds at load, and on a
// fake Date it formats in the host zone, so a CI runner in UTC read Finnish midnight as the day before.
import '../../i18n/dates'

vi.useFakeTimers()
vi.setSystemTime(new Date('2025-03-22T12:45:33+0200'))

vi.doMock('nanoid', () => ({ nanoid: () => 'new-id' }))

vi.doMock('../lib/api-gw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api-gw')>()),
  getOrigin: vi.fn(),
}))

vi.doMock('../lib/auth', () => ({
  authorizeWithMemberOf: vi.fn(),
}))

const mockGetEventAuditMessages = vi.fn()
vi.doMock('../lib/audit', () => ({
  audit: vi.fn(),
  eventAuditKey: vi.fn((event: Pick<JsonDogEvent, 'id'>) => `event:${event.id}`),
  getEventAuditMessages: mockGetEventAuditMessages,
  registrationAuditKey: vi.fn(
    (registration: Pick<JsonRegistration, 'eventId' | 'id'>) => `${registration.eventId}:${registration.id}`
  ),
}))

vi.doMock('../lib/event', () => ({
  findEventWithKcGuid: vi.fn(),
  findEventWithKcId: vi.fn(),
  findQualificationStartDate: vi.fn(),
  getEvent: vi.fn(),
  patchEvent: vi.fn(),
  repairReadyRegistrationGroups: vi.fn().mockResolvedValue([]),
  saveEvent: vi.fn(),
  updateRegistrations: vi.fn(),
}))

const mockReadEventRegistrations = vi.fn()
/**
 * The registration rows of the results tests (KOE-1666), as the table would hold them: the result save
 * and the event save write here, and the readers read back what was written.
 */
const storedRegistrations = new Map<string, JsonRegistration>()
/** Writes over the result it was worked out from only, as the repository's condition does. */
const results = registrationStore(storedRegistrations)
const mockWriteEventResult = vi.fn(results.writeEventResult)
vi.doMock('../lib/repositories/registrationRepository', () => ({
  readEventRegistrations: mockReadEventRegistrations,
  readRegistration: results.readRegistration,
  writeEventResult: mockWriteEventResult,
}))

/** A dog picked into a group of the class, and invited: nothing left for the start list to wait on. */
const invitedParticipant = (eventClass?: string) => ({
  class: eventClass,
  eventType: '',
  group: { date: '2025-06-01', key: 'group-1', number: 1 },
  messagesSent: { invitation: true },
})

const mockReadOrganizer = vi.fn()
vi.doMock('../lib/repositories/organizerRepository', () => ({
  readOrganizer: mockReadOrganizer,
}))

const mockPublishEventChange = vi.fn()
const mockPublishEventCounts = vi.fn()
const mockPublishPublicStartList = vi.fn()
const mockPublishRegistrationPatches = vi.fn()
vi.doMock('../lib/ws/actions', () => ({
  publishEventChange: mockPublishEventChange,
  publishEventCounts: mockPublishEventCounts,
  publishPublicStartList: mockPublishPublicStartList,
  publishRegistrationPatches: mockPublishRegistrationPatches,
}))

const { authorizeWithMemberOf } = await import('../lib/auth')
const authorizeWithMemberOfMock = authorizeWithMemberOf as import('vitest').Mock<typeof authorizeWithMemberOf>
const { httpError } = await import('../lib/lambda')

const { audit, eventAuditKey } = await import('../lib/audit')
const auditMock = audit as import('vitest').Mock<typeof audit>
const eventAuditKeyMock = eventAuditKey as import('vitest').Mock<typeof eventAuditKey>

const {
  findEventWithKcGuid,
  findEventWithKcId,
  findQualificationStartDate,
  getEvent,
  patchEvent,
  repairReadyRegistrationGroups,
  saveEvent,
  updateRegistrations,
} = await import('../lib/event')
const repairReadyRegistrationGroupsMock = repairReadyRegistrationGroups as import('vitest').Mock<
  typeof repairReadyRegistrationGroups
>
const findEventWithKcGuidMock = findEventWithKcGuid as import('vitest').Mock<typeof findEventWithKcGuid>
const findEventWithKcIdMock = findEventWithKcId as import('vitest').Mock<typeof findEventWithKcId>
const findQualificationStartDateMock = findQualificationStartDate as import('vitest').Mock<
  typeof findQualificationStartDate
>
const getEventMock = getEvent as import('vitest').Mock<typeof getEvent>
const patchEventMock = patchEvent as import('vitest').Mock<typeof patchEvent>
const saveEventMock = saveEvent as import('vitest').Mock<typeof saveEvent>
const updateRegistrationsMock = updateRegistrations as import('vitest').Mock<typeof updateRegistrations>

const { CONFIG } = await import('../config')
const { default: putEventLambda } = await import('./handler')
const { processResultSubmissions } = await import('../lib/eventResults')
const { buildKcResult, KC_STATE_HANDED_OVER } = await import('../../lib/kennelliittoResults')
const { deriveNowtResult, formatEventResult, nowtTotals, placementsFor } = await import('../../lib/results')
const { dogRound, isResultTasksDroppedBody, toScoredTasks } = await import('../../lib/resultTasks')
const { patchMerge } = await import('../../lib/utils')
const { rotationDogOf } = await import('../../lib/rotation')

/** The caller as authorizeWithMemberOf answers for them: the user and the clubs they hold a role in. */
const signIn = (user: JsonUser) => {
  authorizeWithMemberOfMock.mockResolvedValueOnce({ memberOf: Object.keys(user.roles ?? {}), user })
}

const mockSecretary: JsonUser = {
  createdAt: '',
  createdBy: 'test',
  email: 'test@example.com',
  id: '',
  modifiedAt: '',
  modifiedBy: 'test',
  name: 'Test User',
  roles: {
    'org-id': 'secretary',
  },
}

const mockAdmin: JsonUser = {
  admin: true,
  createdAt: '',
  createdBy: 'test',
  email: 'test@example.com',
  id: '',
  modifiedAt: '',
  modifiedBy: 'test',
  name: 'Test User',
}

const mockEvent: JsonDogEvent = {
  classes: [],
  cost: 0,
  costMember: 0,
  createdAt: '2024-12-12T21:42:42.000Z',
  createdBy: 'system',
  description: '',
  endDate: '2025-06-02',
  eventType: '',
  id: 'existing',
  judges: [],
  location: '',
  modifiedAt: '',
  modifiedBy: '',
  name: '',
  official: {},
  organizer: {
    id: 'org-id',
    name: 'org name',
  },
  organizerId: 'org-id',
  places: 0,
  season: '2025',
  secretary: {},
  startDate: '2025-06-01',
  state: 'draft',
}
const confirmedDates: Pick<JsonDogEvent, 'endDate' | 'startDate'> = { endDate: '2025-06-02', startDate: '2025-06-01' }

describe('putEventLambda', () => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    // A request refused before it reads the event leaves its queued answers behind; none may reach the next test.
    authorizeWithMemberOfMock.mockReset()
    getEventMock.mockReset()
    mockReadOrganizer.mockImplementation(async (id: string) => ({ id, kcId: 1, name: `Club ${id}` }))
    patchEventMock.mockImplementation(async (_id, _existing, next) => ({ event: next }))
    // A test's queued answer it did not consume must not reach the next test.
    mockReadEventRegistrations.mockReset()
    mockReadEventRegistrations.mockResolvedValue([
      invitedParticipant(),
      invitedParticipant('ALO'),
      invitedParticipant('AVO'),
    ])
    mockGetEventAuditMessages.mockImplementation((_existing: unknown, item: Partial<JsonDogEvent>) => {
      if (!_existing) return [{ message: 'Tapahtuma luotu' }]
      if (item.startListPublished) return [{ message: 'ALO starttilista julkaistu' }]
      if (item.eventType) {
        return [
          {
            changes: [
              {
                field: 'eventType',
                labelKey: 'event.eventType',
                next: { text: 'TEST' },
                previous: { state: 'empty' },
              },
            ],
            message: 'Muutti: eventType',
          },
        ]
      }
      return [{ message: 'Tapahtuma tallennettu' }]
    })
  })

  it('should return 401 if authorization fails', async () => {
    authorizeWithMemberOfMock.mockRejectedValueOnce(httpError(401, 'Unauthorized'))

    const res = await putEventLambda(constructAPIGwEvent('test'))

    expect(res.statusCode).toEqual(401)
  })

  it('should return 403 if user does not have permissions to modify existing event', async () => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, organizer: { id: 'no-access', name: 'some org' } })

    const res = await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ eventType: 'TEST', id: 'existing' }))

    expect(res.statusCode).toEqual(403)
  })

  it('should return 403 if user does not have to the updated org', async () => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce(mockEvent)

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', organizer: { id: 'no-access', name: 'some org' } })
    )

    expect(res.statusCode).toEqual(403)

    signIn(mockSecretary)
    const res2 = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ organizer: { id: 'no-access', name: 'some org' } })
    )

    expect(res2.statusCode).toEqual(403)
  })

  it('should return 403 when trying to delete non-deletable event', async () => {
    vi.spyOn(console, 'log').mockImplementationOnce(() => undefined)
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, state: 'invited' })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ deletedAt: new Date().toISOString(), id: 'existing' })
    )

    expect(res.statusCode).toEqual(403)
  })

  it('should allow deleting a draft event', async () => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, state: 'draft' })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ deletedAt: new Date().toISOString(), id: 'existing' })
    )

    expect(res.statusCode).toEqual(200)
  })

  // The admin list's incremental fetch reads deletedAt as a stamp of the row, so a browser clock
  // ahead must not reach the table (KOE-1668).
  // The file's clock stands at 2025-03-22T10:45:33.000Z.
  describe('the time of a deletion', () => {
    it('is the server time, not the one the browser sent', async () => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce({ ...mockEvent, state: 'draft' })

      await putEventLambda(
        constructAPIGwEvent<Partial<JsonDogEvent>>({ deletedAt: '2025-03-22T12:45:33.000Z', id: 'existing' })
      )

      expect(patchEventMock).toHaveBeenCalledWith(
        'existing',
        expect.anything(),
        expect.objectContaining({ deletedAt: '2025-03-22T10:45:33.000Z', updatedAt: '2025-03-22T10:45:33.000Z' })
      )
    })

    it('stays the time stored for an event deleted before', async () => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce({ ...mockEvent, deletedAt: '2025-03-01T08:00:00.000Z', state: 'draft' })

      await putEventLambda(
        constructAPIGwEvent<Partial<JsonDogEvent>>({ deletedAt: '2025-03-22T12:45:33.000Z', id: 'existing' })
      )

      expect(patchEventMock).toHaveBeenCalledWith(
        'existing',
        expect.anything(),
        expect.objectContaining({ deletedAt: '2025-03-01T08:00:00.000Z' })
      )
    })
  })

  describe('deleting by stage (KOE-1640)', () => {
    const { stageName } = CONFIG
    const copiedFrom = { at: '2025-03-01T10:00:00.000Z', by: 'admin', eventId: 'source', stage: 'prod' }
    const deleteRequest = () =>
      constructAPIGwEvent<Partial<JsonDogEvent>>({ deletedAt: new Date().toISOString(), id: 'existing' })

    afterEach(() => {
      CONFIG.stageName = stageName
    })

    it('deletes a confirmed event in dev', async () => {
      CONFIG.stageName = 'dev'
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce({ ...mockEvent, state: 'confirmed' })

      const res = await putEventLambda(deleteRequest())

      expect(res.statusCode).toEqual(200)
      expect(patchEventMock).toHaveBeenCalledWith(
        'existing',
        expect.anything(),
        expect.objectContaining({ deletedAt: expect.any(String) })
      )
    })

    it('deletes a copy from another environment in test, whatever its state', async () => {
      CONFIG.stageName = 'test'
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce({ ...mockEvent, copiedFrom, state: 'confirmed' })

      const res = await putEventLambda(deleteRequest())

      expect(res.statusCode).toEqual(200)
    })

    it("refuses test's own confirmed event, and writes nothing", async () => {
      CONFIG.stageName = 'test'
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce({ ...mockEvent, state: 'confirmed' })

      const res = await putEventLambda(deleteRequest())

      expect(res.statusCode).toEqual(403)
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('refuses a confirmed event in prod even when it carries copiedFrom', async () => {
      CONFIG.stageName = 'prod'
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce({ ...mockEvent, copiedFrom, state: 'confirmed' })

      const res = await putEventLambda(deleteRequest())

      expect(res.statusCode).toEqual(403)
      expect(patchEventMock).not.toHaveBeenCalled()
    })
  })

  it('should allow admin to edit any organizers events', async () => {
    signIn(mockAdmin)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, organizer: { id: 'no-access', name: 'some org' } })

    const res = await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ eventType: 'TEST', id: 'existing' }))

    expect(res.statusCode).toEqual(200)
  })

  // KOE-1607: sign-up is open, so a signed-in user may hold no role at all. Such a caller writes no
  // event, and every event names the organizer whose members may change it.
  describe('who may write an event', () => {
    const newEventBody: Partial<JsonDogEvent> = {
      ...confirmedDates,
      eventType: 'TEST',
      name: 'Koe',
      state: 'confirmed',
    }
    // A row from before the organizer was required; the type says it always has one.
    const orphanEvent: JsonDogEvent = { ...mockEvent }
    delete orphanEvent.organizerId
    Reflect.deleteProperty(orphanEvent, 'organizer')

    it('refuses a new event from a user with no role, and writes nothing', async () => {
      // The authorizer refuses a user with no role who is not an admin; src/lambda/lib/auth.test.ts holds it to that.
      authorizeWithMemberOfMock.mockRejectedValueOnce(httpError(403, 'Forbidden'))

      const res = await putEventLambda(constructAPIGwEvent(newEventBody))

      expect(res.statusCode).toEqual(403)
      expect(getEventMock).not.toHaveBeenCalled()
      expect(saveEventMock).not.toHaveBeenCalled()
    })

    it('refuses a change from a user with no role before reading the event', async () => {
      // The authorizer refuses a user with no role who is not an admin; src/lambda/lib/auth.test.ts holds it to that.
      authorizeWithMemberOfMock.mockRejectedValueOnce(httpError(403, 'Forbidden'))

      const res = await putEventLambda(
        constructAPIGwEvent<Partial<JsonDogEvent>>({ eventType: 'TEST', id: 'existing' }, { method: 'PATCH' })
      )

      expect(res.statusCode).toEqual(403)
      expect(getEventMock).not.toHaveBeenCalled()
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it.each([
      ['a secretary', mockSecretary],
      ['an admin', mockAdmin],
    ])('refuses a new event without an organizer from %s', async (_label, user) => {
      signIn(user)

      const res = await putEventLambda(constructAPIGwEvent(newEventBody))

      expect(res.statusCode).toEqual(400)
      expect(JSON.parse(res.body)).toEqual({
        error: 'organizerRequired',
        message: 'Bad request: the event needs an organizer',
      })
      expect(saveEventMock).not.toHaveBeenCalled()
    })

    it('refuses a change that drops the organizer of an event', async () => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce(mockEvent)

      const res = await putEventLambda(constructAPIGwEvent({ id: 'existing', organizer: null }, { method: 'PATCH' }))

      expect(res.statusCode).toEqual(400)
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('refuses rotation groups that do not fit the posts, read on the merged event (KOE-1665)', async () => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce({
        ...mockEvent,
        eventType: 'NOWT',
        stations: [{ date: '2025-06-01', id: 'post-1', number: 1 }],
      })

      const res = await putEventLambda(
        constructAPIGwEvent(
          {
            id: 'existing',
            rotations: [{ class: 'ALO', exercises: [{ stationId: 'post-1' }, { stationId: 'gone' }] }],
          },
          { method: 'PATCH' }
        )
      )

      expect(res.statusCode).toEqual(400)
      expect(JSON.parse(res.body)).toMatchObject({
        error: 'invalidRotation',
        errors: [{ group: 0, kind: 'unknownPost', stationId: 'gone' }],
      })
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    describe('rotation groups against the merged event (KOE-1665)', () => {
      const posts: EventStation[] = [
        { date: '2025-06-01', id: 'post-1', number: 1 },
        { date: '2025-06-01', id: 'post-2', number: 2 },
      ]
      const rotations: EventRotationGroup[] = [
        { class: 'ALO', exercises: [{ stationId: 'post-1' }, { stationId: 'post-2' }] },
      ]
      const stored = { ...mockEvent, eventType: 'NOWT', rotations, stations: posts }

      it('refuses a patch of the posts alone that removes a post a stored group visits', async () => {
        signIn(mockSecretary)
        getEventMock.mockResolvedValueOnce(stored)

        const res = await putEventLambda(
          constructAPIGwEvent({ id: 'existing', stations: [posts[0]] }, { method: 'PATCH' })
        )

        expect(res.statusCode).toEqual(400)
        expect(JSON.parse(res.body)).toMatchObject({
          error: 'invalidRotation',
          errors: [{ group: 0, kind: 'unknownPost', stationId: 'post-2' }],
        })
        expect(patchEventMock).not.toHaveBeenCalled()
      })

      it('checks a whole event that carries both, a range included', async () => {
        signIn(mockSecretary)
        getEventMock.mockResolvedValueOnce(mockEvent)

        const res = await putEventLambda(
          constructAPIGwEvent({
            ...mockEvent,
            // A whole event carries its classes, and a save of the classes keeps only the groups of the classes it runs.
            classes: [{ class: 'ALO', date: '2025-06-01' }],
            eventType: 'NOWT',
            rotations: [{ class: 'ALO', exercises: [{ stationId: 'post-1' }], firstNumber: 9, lastNumber: 1 }],
            stations: posts,
          })
        )

        expect(res.statusCode).toEqual(400)
        expect(JSON.parse(res.body)).toMatchObject({ errors: [{ group: 0, kind: 'range' }] })
      })

      it('leaves the rotation of a type not scored at posts unchecked: nothing reads it', async () => {
        signIn(mockSecretary)
        getEventMock.mockResolvedValueOnce({ ...stored, eventType: 'NOME-B' })

        const res = await putEventLambda(
          constructAPIGwEvent({ id: 'existing', stations: [posts[0]] }, { method: 'PATCH' })
        )

        expect(res.statusCode).toEqual(200)
        expect(patchEventMock).toHaveBeenCalled()
      })

      it('leaves a patch that touches neither alone, whatever is stored', async () => {
        signIn(mockSecretary)
        getEventMock.mockResolvedValueOnce({ ...stored, stations: [posts[0]] })

        const res = await putEventLambda(
          constructAPIGwEvent({ id: 'existing', name: 'Uusi nimi' }, { method: 'PATCH' })
        )

        expect(res.statusCode).toEqual(200)
      })

      it('accepts a rotation that fits the posts', async () => {
        signIn(mockSecretary)
        getEventMock.mockResolvedValueOnce(mockEvent)

        const res = await putEventLambda(
          constructAPIGwEvent({ id: 'existing', rotations, stations: posts }, { method: 'PATCH' })
        )

        expect(res.statusCode).toEqual(200)
        expect(patchEventMock).toHaveBeenCalled()
      })
    })

    it('refuses a secretary a change to a stored event without an organizer', async () => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce(orphanEvent)

      const res = await putEventLambda(
        constructAPIGwEvent<Partial<JsonDogEvent>>(
          { id: 'existing', organizer: mockEvent.organizer },
          { method: 'PATCH' }
        )
      )

      expect(res.statusCode).toEqual(403)
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('lets an admin save a stored event without an organizer only by giving it one', async () => {
      signIn(mockAdmin)
      getEventMock.mockResolvedValueOnce(orphanEvent)

      const refused = await putEventLambda(
        constructAPIGwEvent<Partial<JsonDogEvent>>({ eventType: 'TEST', id: 'existing' }, { method: 'PATCH' })
      )

      expect(refused.statusCode).toEqual(400)
      expect(patchEventMock).not.toHaveBeenCalled()

      signIn(mockAdmin)
      getEventMock.mockResolvedValueOnce(orphanEvent)

      const repaired = await putEventLambda(
        constructAPIGwEvent<Partial<JsonDogEvent>>(
          { id: 'existing', organizer: mockEvent.organizer },
          { method: 'PATCH' }
        )
      )

      expect(repaired.statusCode).toEqual(200)
      expect(patchEventMock).toHaveBeenCalledWith(
        'existing',
        expect.anything(),
        expect.objectContaining({ organizer: mockEvent.organizer, organizerId: 'org-id' })
      )
    })
  })

  it('should create a new event', async () => {
    signIn(mockSecretary)

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({
        endDate: '2025-06-02',
        eventType: 'TEST',
        organizer: mockEvent.organizer,
        startDate: '2025-06-01',
      })
    )

    expect(getEventMock).not.toHaveBeenCalled()
    expect(updateRegistrationsMock).not.toHaveBeenCalled()
    expect(saveEventMock).toHaveBeenCalledWith({
      createdAt: '2025-03-22T10:45:33.000Z',
      createdBy: 'Test User',
      endDate: '2025-06-02',
      eventType: 'TEST',
      id: 'new-id',
      modifiedAt: '2025-03-22T10:45:33.000Z',
      modifiedBy: 'Test User',
      organizer: mockEvent.organizer,
      organizerId: 'org-id',
      season: '2025',
      startDate: '2025-06-01',
      startListPublished: false,
      startNumbersPublished: false,
      updatedAt: '2025-03-22T10:45:33.000Z',
    })
    expect(auditMock).toHaveBeenCalledWith({
      auditKey: 'event:new-id',
      message: 'Tapahtuma luotu',
      user: 'Test User',
    })
    expect(res.statusCode).toEqual(200)
  })

  // KOE-1580: an event on an organizer id this environment's table does not hold shows the club twice
  // in the admin list and has no merchant for its payments.
  describe('the organizer must be one the table holds', () => {
    it('refuses a new event on an organizer the table does not hold', async () => {
      signIn(mockAdmin)
      mockReadOrganizer.mockResolvedValueOnce(undefined)

      const res = await putEventLambda(
        constructAPIGwEvent<Partial<JsonDogEvent>>({
          ...confirmedDates,
          eventType: 'TEST',
          organizer: { id: 'prod-id', name: 'AURAN NUUSKUT RY' },
        })
      )

      expect(res.statusCode).toEqual(400)
      expect(JSON.parse(res.body)).toEqual({ error: 'unknownOrganizer', message: expect.stringContaining('prod-id') })
      expect(mockReadOrganizer).toHaveBeenCalledWith('prod-id')
      expect(saveEventMock).not.toHaveBeenCalled()
    })

    it('refuses moving an event to an organizer the table does not hold', async () => {
      signIn(mockAdmin)
      getEventMock.mockResolvedValueOnce(mockEvent)
      mockReadOrganizer.mockResolvedValueOnce(undefined)

      const res = await putEventLambda(
        constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', organizer: { id: 'prod-id', name: 'Seura' } })
      )

      expect(res.statusCode).toEqual(400)
      expect(patchEventMock).not.toHaveBeenCalled()
      expect(saveEventMock).not.toHaveBeenCalled()
    })

    it('saves a new event on an organizer the table holds', async () => {
      signIn(mockSecretary)

      const res = await putEventLambda(
        constructAPIGwEvent<Partial<JsonDogEvent>>({
          ...confirmedDates,
          eventType: 'TEST',
          organizer: { id: 'org-id', name: 'org name' },
        })
      )

      expect(res.statusCode).toEqual(200)
      expect(mockReadOrganizer).toHaveBeenCalledWith('org-id')
    })

    it('does not read the organizer when a patch renames the organizer it keeps', async () => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce(mockEvent)

      const res = await putEventLambda(
        constructAPIGwEvent<Partial<JsonDogEvent>>(
          { id: 'existing', organizer: { id: 'org-id', name: 'renamed org' } },
          { method: 'PATCH' }
        )
      )

      expect(res.statusCode).toEqual(200)
      expect(mockReadOrganizer).not.toHaveBeenCalled()
    })

    it('does not read the organizer when the event keeps its own', async () => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce(mockEvent)

      const res = await putEventLambda(
        constructAPIGwEvent<Partial<JsonDogEvent>>({
          eventType: 'TEST',
          id: 'existing',
          organizer: mockEvent.organizer,
        })
      )

      expect(res.statusCode).toEqual(200)
      expect(mockReadOrganizer).not.toHaveBeenCalled()
    })
  })

  it('creates a new event without the results flag a copy carried (KOE-1510)', async () => {
    signIn(mockSecretary)

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({
        endDate: '2025-06-02',
        eventType: 'TEST',
        organizer: mockEvent.organizer,
        resultsPublished: true,
        startDate: '2025-06-01',
      })
    )

    expect(res.statusCode).toEqual(200)
    expect(getEventMock).not.toHaveBeenCalled()
    expect(saveEventMock).toHaveBeenCalledWith(expect.not.objectContaining({ resultsPublished: expect.anything() }))
    expect(saveEventMock).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'TEST', id: 'new-id' }))
  })

  it('should update an event', async () => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce(mockEvent)
    patchEventMock.mockResolvedValueOnce({ event: { ...mockEvent, eventType: 'TEST', kcId: undefined } })

    const res = await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ eventType: 'TEST', id: 'existing' }))

    expect(getEventMock).toHaveBeenCalledWith('existing')
    expect(updateRegistrationsMock).not.toHaveBeenCalled()
    expect(patchEventMock).toHaveBeenCalledWith('existing', mockEvent, {
      ...mockEvent,
      eventType: 'TEST',
      modifiedAt: '2025-03-22T10:45:33.000Z',
      modifiedBy: 'Test User',
      updatedAt: '2025-03-22T10:45:33.000Z',
    })
    expect(eventAuditKeyMock).toHaveBeenCalledWith({ ...mockEvent, eventType: 'TEST', kcId: undefined })
    expect(auditMock).toHaveBeenCalledWith({
      auditKey: 'event:existing',
      changes: [
        {
          field: 'eventType',
          labelKey: 'event.eventType',
          next: { text: 'TEST' },
          previous: { state: 'empty' },
        },
      ],
      message: 'Muutti: eventType',
      user: 'Test User',
    })
    expect(res.statusCode).toEqual(200)
    expect(JSON.parse(res.body)).toEqual({ ...mockEvent, eventType: 'TEST' })
  })

  it('does not persist a client-provided registration group lock', async () => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce(mockEvent)

    await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({
        id: 'existing',
        registrationGroupsLock: { expiresAt: Date.now() + 24 * 60 * 60 * 1000, token: 'client-controlled' },
      })
    )

    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      mockEvent,
      expect.not.objectContaining({ registrationGroupsLock: expect.anything() })
    )
  })

  it('preserves an existing server-owned registration group lock', async () => {
    const storedLock = { expiresAt: Date.now() + 60_000, token: 'server-owned' }
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, registrationGroupsLock: storedLock })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({
        id: 'existing',
        registrationGroupsLock: { expiresAt: Date.now() + 24 * 60 * 60 * 1000, token: 'client-controlled' },
      })
    )

    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      expect.objectContaining({ registrationGroupsLock: storedLock }),
      expect.objectContaining({ registrationGroupsLock: storedLock })
    )
    expect(JSON.parse(res.body)).not.toHaveProperty('registrationGroupsLock')
  })

  describe('what Kennelliitto said of the trial (KOE-1140)', () => {
    const stored = { code: 1253, name: 'Ylituomarin hyväksyttäväksi', readAt: '2026-09-26T10:00:00.000Z' }

    it('restores the stored state over a copy that rides an event save, without refusing the save', async () => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce({ ...mockEvent, kcState: stored })

      const res = await putEventLambda(
        constructAPIGwEvent<Partial<JsonDogEvent>>({
          id: 'existing',
          kcState: { code: 754, name: 'Hyväksytty', readAt: '2026-09-26T09:00:00.000Z' },
        })
      )

      expect(res.statusCode).toEqual(200)
      expect(patchEventMock).toHaveBeenCalledWith(
        'existing',
        expect.objectContaining({ kcState: stored }),
        expect.objectContaining({ kcState: stored })
      )
    })

    it('does not let a client write a state where none is stored', async () => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce(mockEvent)

      await putEventLambda(
        constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', kcState: { code: 1253, name: 'x', readAt: 'y' } })
      )

      expect(patchEventMock).toHaveBeenCalledWith(
        'existing',
        mockEvent,
        expect.not.objectContaining({ kcState: expect.anything() })
      )
    })

    describe('the link to the Kennelliitto trial', () => {
      const GUID = '2b81e6a1-559b-407c-87c7-b8a9b89b1987'
      const linked = { ...mockEvent, kcGuid: GUID }

      it.each([
        ['changed', { kcGuid: 'another-guid' }],
        ['cleared', { kcGuid: null }],
      ])('refuses a link %s once the state of the trial has been read', async (_name, change) => {
        signIn(mockSecretary)
        getEventMock.mockResolvedValueOnce({ ...linked, kcState: stored })

        const res = await putEventLambda(constructAPIGwEvent({ id: 'existing', ...change }))

        expect(res.statusCode).toEqual(409)
        expect(JSON.parse(res.body)).toMatchObject({ error: 'kcGuidLocked' })
        expect(patchEventMock).not.toHaveBeenCalled()
      })

      it('refuses a changed link once a result has been sent for any dog', async () => {
        signIn(mockSecretary)
        getEventMock.mockResolvedValueOnce(linked)
        mockReadEventRegistrations.mockResolvedValueOnce([
          { id: 'a' },
          { id: 'b', kcResult: { at: 'x', by: 'y', status: 'failed' } },
        ])

        const res = await putEventLambda(constructAPIGwEvent({ id: 'existing', kcGuid: 'another-guid' }))

        expect(res.statusCode).toEqual(409)
        expect(JSON.parse(res.body)).toMatchObject({ error: 'kcGuidLocked' })
      })

      it('lets the link change while nothing has been sent or read', async () => {
        signIn(mockSecretary)
        getEventMock.mockResolvedValueOnce(linked)
        mockReadEventRegistrations.mockResolvedValueOnce([{ id: 'a' }])
        patchEventMock.mockResolvedValueOnce({ event: { ...mockEvent, kcGuid: 'another-guid' } })

        const res = await putEventLambda(constructAPIGwEvent({ id: 'existing', kcGuid: 'another-guid' }))

        expect(res.statusCode).toEqual(200)
      })

      it('lets a save repeat the stored link, as the results page does', async () => {
        signIn(mockSecretary)
        getEventMock.mockResolvedValueOnce({ ...linked, kcState: stored })
        patchEventMock.mockResolvedValueOnce({ event: linked })

        const res = await putEventLambda(constructAPIGwEvent({ eventType: 'TEST', id: 'existing', kcGuid: GUID }))

        expect(res.statusCode).toEqual(200)
      })
    })
  })

  it('keeps the server-owned live timeline over whatever an event save carries', async () => {
    // KOE-1259: a stale copy riding an event save must not clobber the spans a post recorded meanwhile.
    const storedTurns = [
      {
        dogs: [{ name: 'Dog', number: 1 }],
        id: 'turn-1',
        registrationIds: ['run-1'],
        startedAt: '2026-09-12T08:00:00.000Z',
        stationId: 'post-1',
      },
    ]
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, turns: storedTurns })

    await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({
        id: 'existing',
        turns: [],
      })
    )

    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      expect.objectContaining({ turns: storedTurns }),
      expect.objectContaining({ turns: storedTurns })
    )
  })

  it('freezes an absent start number state when the start list publish state changes', async () => {
    // KOE-1266: absent means published, so publishing the list would otherwise publish the numbers too.
    const stored: JsonDogEvent = {
      ...mockEvent,
      classes: [
        { class: 'ALO', date: '2025-06-01' },
        { class: 'AVO', date: '2025-06-01' },
      ],
      startListPublished: { ALO: true },
      state: 'invited',
    }
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce(stored)

    await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({
        id: 'existing',
        startListPublished: { ALO: true, AVO: true },
      })
    )

    // ALO's numbers were already riding its published list and must stay out; AVO's were not.
    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      stored,
      expect.objectContaining({ startNumbersPublished: { ALO: true, AVO: false } })
    )
  })

  it('sends the change, start list and all, only after the event is written (KOE-1516)', async () => {
    // The published list's version is the time it was read, so it has to be read after the write.
    const steps: string[] = []
    const stored: JsonDogEvent = { ...mockEvent, startListPublished: false, state: 'invited' }
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce(stored)
    patchEventMock.mockImplementationOnce(async (eventId, _existing, next) => {
      await Promise.resolve()
      steps.push('write event')
      return {
        change: { audience: 'public', organizerId: next.organizer.id, patch: { eventId }, startList: true },
        event: next,
      }
    })
    mockPublishEventChange.mockImplementationOnce(async () => {
      steps.push('publish change')
    })

    await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', startListPublished: true }))

    expect(steps).toEqual(['write event', 'publish change'])
  })

  it('freezes an absent start number state for a classless event', async () => {
    const stored: JsonDogEvent = { ...mockEvent, startListPublished: false, state: 'invited' }
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce(stored)

    await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', startListPublished: true }))

    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      stored,
      expect.objectContaining({ startNumbersPublished: false })
    )
  })

  it('leaves an explicit start number state alone when the start list is published', async () => {
    const stored: JsonDogEvent = {
      ...mockEvent,
      startListPublished: false,
      startNumbersPublished: false,
      state: 'invited',
    }
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce(stored)

    await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', startListPublished: true }))

    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      stored,
      expect.objectContaining({ startNumbersPublished: false })
    )
  })

  it('does not invent a start number state when the start list state is untouched', async () => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, state: 'invited' })

    await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ eventType: 'TEST', id: 'existing' }))

    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      expect.anything(),
      expect.not.objectContaining({ startNumbersPublished: expect.anything() })
    )
  })

  it('should reject an event edit based on stale modification data', async () => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, modifiedAt: '2025-03-22T09:00:00.000Z' })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({
        eventType: 'TEST',
        id: 'existing',
        modifiedAt: '2025-03-22T08:00:00.000Z',
      })
    )

    expect(res.statusCode).toEqual(409)
    expect(JSON.parse(res.body)).toEqual({
      error: 'staleData',
      message: 'Event has been modified since it was loaded',
    })
    expect(patchEventMock).not.toHaveBeenCalled()
  })

  it('should reject a kcId already linked to another event', async () => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce(mockEvent)
    findEventWithKcIdMock.mockResolvedValueOnce({ id: 'other-event' })

    const res = await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', kcId: 12345 }))

    expect(findEventWithKcIdMock).toHaveBeenCalledWith(12345, 'existing')
    expect(res.statusCode).toEqual(409)
    expect(JSON.parse(res.body)).toEqual({
      error: 'kcIdConflict',
      message: 'Kennel Club ID is already linked to another event',
    })
    expect(patchEventMock).not.toHaveBeenCalled()
  })

  it('should allow saving a kcId that is not used by any other event', async () => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce(mockEvent)
    findEventWithKcIdMock.mockResolvedValueOnce(undefined)
    patchEventMock.mockResolvedValueOnce({ event: { ...mockEvent, kcId: 12345 } })

    const res = await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', kcId: 12345 }))

    expect(findEventWithKcIdMock).toHaveBeenCalledWith(12345, 'existing')
    expect(res.statusCode).toEqual(200)
  })

  it('should not check for kcId conflicts when kcId is unchanged', async () => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, kcId: 12345 })
    patchEventMock.mockResolvedValueOnce({ event: { ...mockEvent, eventType: 'TEST', kcId: 12345 } })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ eventType: 'TEST', id: 'existing', kcId: 12345 })
    )

    expect(findEventWithKcIdMock).not.toHaveBeenCalled()
    expect(res.statusCode).toEqual(200)
  })

  describe('kcGuid (KOE-1534)', () => {
    const GUID = '2b81e6a1-559b-407c-87c7-b8a9b89b1987'

    it('should reject a kcGuid already linked to another event', async () => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce(mockEvent)
      findEventWithKcGuidMock.mockResolvedValueOnce({ id: 'other-event' })

      const res = await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', kcGuid: GUID }))

      expect(findEventWithKcGuidMock).toHaveBeenCalledWith(GUID, 'existing')
      expect(res.statusCode).toEqual(409)
      expect(JSON.parse(res.body)).toEqual({
        error: 'kcGuidConflict',
        message: 'Kennel Club trial is already linked to another event',
      })
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('should allow saving a kcGuid that no other event has', async () => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce(mockEvent)
      findEventWithKcGuidMock.mockResolvedValueOnce(undefined)
      patchEventMock.mockResolvedValueOnce({ event: { ...mockEvent, kcGuid: GUID } })

      const res = await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', kcGuid: GUID }))

      expect(findEventWithKcGuidMock).toHaveBeenCalledWith(GUID, 'existing')
      expect(res.statusCode).toEqual(200)
    })

    it('should not scan for conflicts when the kcGuid is unchanged, as on a results page save', async () => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce({ ...mockEvent, kcGuid: GUID })
      patchEventMock.mockResolvedValueOnce({ event: { ...mockEvent, eventType: 'TEST', kcGuid: GUID } })

      const res = await putEventLambda(
        constructAPIGwEvent<Partial<JsonDogEvent>>({ eventType: 'TEST', id: 'existing', kcGuid: GUID })
      )

      expect(findEventWithKcGuidMock).not.toHaveBeenCalled()
      expect(res.statusCode).toEqual(200)
    })

    it('should not scan when the kcGuid is cleared with null', async () => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce({ ...mockEvent, kcGuid: GUID })
      patchEventMock.mockResolvedValueOnce({ event: mockEvent })

      const res = await putEventLambda(constructAPIGwEvent({ id: 'existing', kcGuid: null }))

      expect(findEventWithKcGuidMock).not.toHaveBeenCalled()
      expect(res.statusCode).toEqual(200)
    })
  })

  it('should audit start list class publishing without a generic change message', async () => {
    const existing = {
      ...mockEvent,
      classes: [{ class: 'ALO' }, { class: 'AVO' }],
      startListPublished: { ALO: false, AVO: false },
      state: 'invited',
    } as JsonDogEvent
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce(existing)

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>(
        { id: 'existing', startListPublished: { ALO: true, AVO: false } },
        { method: 'PATCH' }
      )
    )

    expect(res.statusCode).toEqual(200)
    expect(auditMock).toHaveBeenCalledWith({
      auditKey: 'event:existing',
      message: 'ALO starttilista julkaistu',
      user: 'Test User',
    })
    expect(auditMock).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'Muutti: startListPublished' }))
  })

  describe('publishing rules (KOE-1466)', () => {
    const classless = { ...mockEvent, startListPublished: false, state: 'invited' } as JsonDogEvent
    const publish = (body: Partial<JsonDogEvent>) =>
      putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', ...body }, { method: 'PATCH' }))

    it('refuses a start list whose participants have not had the invitation', async () => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce(classless)
      mockReadEventRegistrations.mockResolvedValueOnce([{ ...invitedParticipant(), messagesSent: {} }])

      const res = await publish({ startListPublished: true })

      expect(res.statusCode).toEqual(422)
      expect(JSON.parse(res.body)).toMatchObject({ publish: 'startList', reason: 'invitations' })
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('refuses a start list with nobody picked', async () => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce(classless)
      mockReadEventRegistrations.mockResolvedValueOnce([])

      const res = await publish({ startListPublished: true })

      expect(JSON.parse(res.body)).toMatchObject({ reason: 'participants' })
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it("lets a past trial's start list out though its invitations never went (KOE-1465)", async () => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce({ ...classless, endDate: '2025-03-01', startDate: '2025-03-01' })
      mockReadEventRegistrations.mockResolvedValueOnce([{ ...invitedParticipant(), messagesSent: {} }])

      const res = await publish({ startListPublished: true })

      expect(res.statusCode).toEqual(200)
    })

    it('judges the first publish of a past trial that never sent invitations and has no flag (KOE-1465)', async () => {
      // No flag reads as published only where the workflow invited; read as published here, the
      // publish looked like a flag left as it was and skipped the rules.
      const pastPicked: JsonDogEvent = {
        ...mockEvent,
        endDate: '2025-03-01',
        startDate: '2025-03-01',
        startListPublished: undefined,
        state: 'picked',
      }
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce(pastPicked)
      mockReadEventRegistrations.mockResolvedValueOnce([])

      const res = await publish({ startListPublished: true })

      expect(JSON.parse(res.body)).toMatchObject({ publish: 'startList', reason: 'participants' })
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('publishes the start list of a past trial that never sent invitations and has no flag (KOE-1465)', async () => {
      const pastPicked: JsonDogEvent = {
        ...mockEvent,
        endDate: '2025-03-01',
        startDate: '2025-03-01',
        startListPublished: undefined,
        state: 'picked',
      }
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce(pastPicked)
      mockReadEventRegistrations.mockResolvedValueOnce([{ ...invitedParticipant(), messagesSent: {} }])

      const res = await publish({ startListPublished: true })

      expect(res.statusCode).toEqual(200)
      expect(patchEventMock).toHaveBeenCalledWith(
        'existing',
        expect.anything(),
        expect.objectContaining({ startListPublished: true })
      )
    })

    it('always lets a start list be hidden', async () => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce({ ...classless, startListPublished: true })
      mockReadEventRegistrations.mockResolvedValueOnce([])

      const res = await publish({ startListPublished: false })

      expect(res.statusCode).toEqual(200)
      expect(mockReadEventRegistrations).not.toHaveBeenCalled()
    })

    /**
     * Results go out a day at a time only through PutResultsPublishedFunction (KOE-1510). A save still
     * carrying the flag comes from a tab loaded before that: the stored flag is never changed by it.
     */
    describe('a save carrying the results flag', () => {
      const firstDayOut: JsonDogEvent = {
        ...classless,
        resultsPublished: ['2025-06-01'],
        startListPublished: true,
        state: 'ended',
      }

      it.each([
        ['the same day key', ['2025-06-01']],
        // The old panel's copy went through the reviver and back out as the instant of Finnish midnight.
        ['the same day as a timestamp', ['2025-05-31T21:00:00.000Z']],
      ])('drops %s and saves the rest', async (_name, resultsPublished) => {
        signIn(mockSecretary)
        getEventMock.mockResolvedValueOnce(firstDayOut)

        const res = await publish({ name: 'Uusi nimi', resultsPublished })

        expect(res.statusCode).toEqual(200)
        expect(patchEventMock).toHaveBeenCalledWith(
          'existing',
          expect.anything(),
          expect.objectContaining({ name: 'Uusi nimi', resultsPublished: ['2025-06-01'] })
        )
      })

      it.each([
        ['a hide', false],
        ['a publish of every day', true],
        ['another day', ['2025-06-02']],
        ['a class map, which has nothing for a classless trial', { ALO: true }],
      ])('refuses %s, so the old panel cannot report a change that never happened', async (_name, resultsPublished) => {
        signIn(mockSecretary)
        getEventMock.mockResolvedValueOnce(firstDayOut)

        const res = await publish({ resultsPublished })

        expect(res.statusCode).toEqual(409)
        // The answer the old tab's form already reads as "reload and redo".
        expect(JSON.parse(res.body)).toMatchObject({ error: 'staleData' })
        expect(patchEventMock).not.toHaveBeenCalled()
      })
    })

    it('does not let an event save publish the start numbers', async () => {
      // Numbers go out only through PutStartNumbersFunction, which freezes them as it publishes.
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce({ ...classless, startNumbersPublished: false })

      await publish({ startNumbersPublished: true })

      expect(patchEventMock).toHaveBeenCalledWith(
        'existing',
        expect.anything(),
        expect.objectContaining({ startNumbersPublished: false })
      )
    })
  })

  it('should return 400 for patch event without id', async () => {
    signIn(mockSecretary)

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ eventType: 'TEST' }, { method: 'PATCH' })
    )

    expect(res.statusCode).toEqual(400)
    expect(JSON.parse(res.body)).toEqual({ message: 'Bad request: PATCH requires id' })
    expect(getEventMock).not.toHaveBeenCalled()
    expect(saveEventMock).not.toHaveBeenCalled()
    expect(patchEventMock).not.toHaveBeenCalled()
  })

  it.each([
    [{ places: 'monta' }, 'places must be a number'],
    [
      { state: 'julkaistu' },
      'state must be one of: draft, tentative, cancelled, confirmed, picked, invited, started, ended, completed',
    ],
    [{ paymentTime: 'later' }, 'paymentTime must be one of: registration, confirmation'],
    [{ organizer: { id: 2 } }, 'organizer.id must be a string'],
    [{ priority: 'members' }, 'priority must be an array'],
    [{ stations: [{ parts: 3 }] }, 'stations.0.parts must be 1 or 2'],
    [
      { rotations: [{ class: 'ALO', exercises: [{ parts: 3, stationId: 'post-1' }] }] },
      'rotations.0.exercises.0.parts must be 1 or 2',
    ],
    [
      { rotations: [{ class: 'ALO', exercises: [{ dogsAtOnce: 0, stationId: 'post-1' }] }] },
      'rotations.0.exercises.0.dogsAtOnce must be at least 1',
    ],
    [
      { rotations: [{ class: 'ALO', exercises: [{ dogsAtOnce: 11, stationId: 'post-1' }] }] },
      'rotations.0.exercises.0.dogsAtOnce must be at most 10',
    ],
  ])('should return 400 for %p before looking the event up', async (body, message) => {
    signIn(mockSecretary)

    const res = await putEventLambda(constructAPIGwEvent({ id: 'existing', ...body }))

    expect(res.statusCode).toEqual(400)
    expect(JSON.parse(res.body).message).toEqual(`Bad request: ${message}`)
    expect(getEventMock).not.toHaveBeenCalled()
    expect(saveEventMock).not.toHaveBeenCalled()
    expect(patchEventMock).not.toHaveBeenCalled()
  })

  it.each(['classes', 'judges'] as const)('should return 400 when %s is not an array', async (field) => {
    signIn(mockSecretary)

    const res = await putEventLambda(
      constructAPIGwEvent(
        // Deliberately an object where the type wants an array: DynamoDB marshalling produces
        // this shape from sparse arrays, and the handler must reject it.
        { id: 'existing', [field]: { 0: { name: 'Invalid sparse array' } } } as unknown as Partial<JsonDogEvent>,
        { method: 'PATCH' }
      )
    )

    expect(res.statusCode).toEqual(400)
    expect(JSON.parse(res.body)).toEqual({
      errors: [{ field, message: 'must be an array' }],
      message: `Bad request: ${field} must be an array`,
    })
    expect(getEventMock).not.toHaveBeenCalled()
    expect(saveEventMock).not.toHaveBeenCalled()
    expect(patchEventMock).not.toHaveBeenCalled()
  })

  it('should merge partial patch payloads before diffing and saving', async () => {
    const existing = {
      ...mockEvent,
      official: { id: 'official-id', name: 'Old Official' },
    }
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce(existing)

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>(
        { id: 'existing', official: { name: 'New Official' } },
        { method: 'PATCH' }
      )
    )

    expect(patchEventMock).toHaveBeenCalledWith('existing', existing, {
      ...existing,
      modifiedAt: '2025-03-22T10:45:33.000Z',
      modifiedBy: 'Test User',
      official: { id: 'official-id', name: 'New Official' },
      updatedAt: '2025-03-22T10:45:33.000Z',
    })
    expect(res.statusCode).toEqual(200)
  })

  it('should update registrations if entries differs', async () => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, entries: 10 })
    updateRegistrationsMock.mockResolvedValueOnce({
      ...mockEvent,
      entries: 11,
      entryEndDate: legacyDayValue(''),
      entryStartDate: legacyDayValue(''),
      state: 'confirmed',
    })

    const res = await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ entries: 11, id: 'existing' }))

    expect(updateRegistrationsMock).toHaveBeenCalledWith('existing')
    // The recount's counters reach open clients only if the handler sends them (KOE-1340).
    expect(mockPublishEventCounts).toHaveBeenCalledWith(expect.objectContaining({ entries: 11, id: 'existing' }))
    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      { ...mockEvent, entries: 10 },
      {
        ...mockEvent,
        entries: 11,
        modifiedAt: '2025-03-22T10:45:33.000Z',
        modifiedBy: 'Test User',
        updatedAt: '2025-03-22T10:45:33.000Z',
      }
    )
    expect(res.statusCode).toEqual(200)
  })

  it('should store the original entryEndDate for a confirmed event', async () => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce({
      ...mockEvent,
      ...confirmedDates,
      entryEndDate: '2025-03-25',
      entryStartDate: '2025-03-01',
      state: 'confirmed',
    })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ entryEndDate: '2025-04-01', id: 'existing' })
    )

    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      expect.objectContaining({
        ...mockEvent,
        ...confirmedDates,
        entryEndDate: '2025-03-25',
        entryStartDate: '2025-03-01',
        state: 'confirmed',
      }),
      {
        ...mockEvent,
        ...confirmedDates,
        entryEndDate: '2025-04-01',
        entryOrigEndDate: '2025-03-25',
        entryStartDate: '2025-03-01',
        modifiedAt: '2025-03-22T10:45:33.000Z',
        modifiedBy: 'Test User',
        season: '2025',
        state: 'confirmed',
        updatedAt: '2025-03-22T10:45:33.000Z',
      }
    )
    expect(res.statusCode).toEqual(200)
  })

  it('should not store the original entryEndDate when moved backward', async () => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce({
      ...mockEvent,
      ...confirmedDates,
      entryEndDate: '2025-02-02',
      state: 'confirmed',
    })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ entryEndDate: '2025-01-01', id: 'existing' })
    )

    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      {
        ...mockEvent,
        ...confirmedDates,
        entryEndDate: '2025-02-02',
        state: 'confirmed',
      },
      {
        ...mockEvent,
        ...confirmedDates,
        entryEndDate: '2025-01-01',
        modifiedAt: '2025-03-22T10:45:33.000Z',
        modifiedBy: 'Test User',
        season: '2025',
        state: 'confirmed',
        updatedAt: '2025-03-22T10:45:33.000Z',
      }
    )
    expect(res.statusCode).toEqual(200)
  })

  it('should not update original entryEndDate', async () => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce({
      ...mockEvent,
      ...confirmedDates,
      entryEndDate: '2025-01-01',
      entryOrigEndDate: '2024-06-01',
      state: 'confirmed',
    })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ entryEndDate: '2025-02-02', id: 'existing' })
    )

    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      {
        ...mockEvent,
        ...confirmedDates,
        entryEndDate: '2025-01-01',
        entryOrigEndDate: '2024-06-01',
        state: 'confirmed',
      },
      {
        ...mockEvent,
        ...confirmedDates,
        entryEndDate: '2025-02-02',
        entryOrigEndDate: '2024-06-01',
        modifiedAt: '2025-03-22T10:45:33.000Z',
        modifiedBy: 'Test User',
        season: '2025',
        state: 'confirmed',
        updatedAt: '2025-03-22T10:45:33.000Z',
      }
    )
    expect(res.statusCode).toEqual(200)
  })

  it('should update season when startDate is changed', async () => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, season: '2024', startDate: '2024-06-15' })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', startDate: '2025-01-01' })
    )

    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      expect.objectContaining({ ...mockEvent, season: '2024', startDate: '2024-06-15' }),
      expect.objectContaining({
        season: '2025',
        startDate: '2025-01-01',
      })
    )
    expect(res.statusCode).toEqual(200)
  })

  // KOE-1547: a row not yet migrated holds its days as instants, and a browser loaded before the
  // change sends them so; the same days in the other form are no change.
  it('reads the stored and the sent days as keys before comparing, merging or auditing them', async () => {
    signIn(mockSecretary)
    const asInstants = () => ({
      classes: [{ class: 'ALO' as const, date: legacyDayValue('2025-05-31T21:00:00.000Z') }],
      endDate: legacyDayValue('2025-06-01T21:00:00.000Z'),
      startDate: legacyDayValue('2025-05-31T21:00:00.000Z'),
    })
    getEventMock.mockResolvedValueOnce({ ...mockEvent, ...asInstants() })

    const res = await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', ...asInstants() }))

    expect(res.statusCode).toEqual(200)
    const keyed = expect.objectContaining({
      classes: [{ class: 'ALO', date: '2025-06-01' }],
      endDate: '2025-06-02',
      startDate: '2025-06-01',
    })
    expect(mockGetEventAuditMessages).toHaveBeenCalledWith(keyed, keyed)
    // The save is worked out from the row as stored, so the days it keeps are written as keys too.
    expect(patchEventMock).toHaveBeenCalledWith('existing', expect.objectContaining(asInstants()), keyed)
  })

  // The stored row is read as a stored row, not as a request: forms no request sends are days there.
  it.each([
    ['a stamp without a zone, as Kennelliitto writes its days', '2025-06-01T00:00:00'],
    ['a noon instant', '2025-06-01T09:00:00.000Z'],
  ])('reads a stored start held as %s as its day: no change to audit, the day kept', async (_name, stamp) => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, startDate: legacyDayValue(stamp) })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', startDate: '2025-06-01' }, { method: 'PATCH' })
    )

    expect(res.statusCode).toEqual(200)
    const keyed = expect.objectContaining({ startDate: '2025-06-01' })
    expect(mockGetEventAuditMessages).toHaveBeenCalledWith(keyed, expect.objectContaining({ startDate: '2025-06-01' }))
    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      expect.objectContaining({ startDate: stamp }),
      expect.objectContaining({ season: '2025', startDate: '2025-06-01' })
    )
  })

  it('should not update season when startDate is unchanged', async () => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, season: '2024', startDate: '2024-06-15' })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', location: 'New Location' })
    )

    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      expect.objectContaining({ ...mockEvent, season: '2024', startDate: '2024-06-15' }),
      expect.objectContaining({
        season: '2024',
        startDate: '2024-06-15',
      })
    )
    expect(res.statusCode).toEqual(200)
  })

  it('should add missing season when updating without changing startDate', async () => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, startDate: '2025-01-01' })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', location: 'New Location' })
    )

    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      expect.objectContaining({ ...mockEvent, startDate: '2025-01-01' }),
      expect.objectContaining({
        location: 'New Location',
        season: '2025',
        startDate: '2025-01-01',
      })
    )
    expect(res.statusCode).toEqual(200)
  })

  it('should set qualificationStartDate for existing NOME-B SM', async () => {
    const qualificationStartDate = '2024-02-02'
    const entryEndDate = '2025-01-01'
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, entryEndDate, eventType: 'NOME-B SM' })
    findQualificationStartDateMock.mockResolvedValueOnce(qualificationStartDate)

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ description: 'testing', id: 'existing' })
    )

    expect(findQualificationStartDateMock).toHaveBeenCalledWith('NOME-B SM', entryEndDate)
    expect(updateRegistrationsMock).not.toHaveBeenCalled()
    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      expect.objectContaining({
        ...mockEvent,
        entryEndDate,
        eventType: 'NOME-B SM',
      }),
      {
        ...mockEvent,
        description: 'testing',
        entryEndDate,
        eventType: 'NOME-B SM',
        modifiedAt: '2025-03-22T10:45:33.000Z',
        modifiedBy: 'Test User',
        qualificationStartDate,
        updatedAt: '2025-03-22T10:45:33.000Z',
      }
    )
    expect(res.statusCode).toEqual(200)
  })

  it.each([
    ['startDate', 'not-a-date'],
    ['endDate', 'not-a-date'],
    ['startDate', '0001-01-01T00:00:00.000Z'],
    ['endDate', '0001-01-01T00:00:00.000Z'],
    ['startDate', '12'],
    ['startDate', '2026-04-31T00:00:00.000Z'],
    ['endDate', '2026-06-28T00:00'],
  ] as const)('rejects an invalid %s (%s) before saving', async (field, value) => {
    signIn(mockSecretary)
    // The other date is valid, so the refusal is this field's.
    const valid: Pick<JsonDogEvent, 'endDate' | 'startDate'> = { endDate: '2026-06-02', startDate: '2026-06-02' }

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({
        ...valid,
        [field]: legacyDayValue(value),
        eventType: 'TEST',
        organizer: mockEvent.organizer,
      })
    )

    expect(res.statusCode).toEqual(400)
    expect(JSON.parse(res.body)).toEqual({ message: `Bad request: ${field} must be a valid date` })
    expect(saveEventMock).not.toHaveBeenCalled()
    expect(patchEventMock).not.toHaveBeenCalled()
  })

  // A row stored before the check, with zone-less stamps: a change that does not touch its dates goes
  // through, and a bad date the request does carry is still refused.
  it('takes a date-less change to a row whose stored dates the check would refuse', async () => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce({
      ...mockEvent,
      endDate: legacyDayValue('2025-06-02T00:00:00'),
      startDate: legacyDayValue('2025-06-01T00:00:00'),
    })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', name: 'Uusi nimi' }, { method: 'PATCH' })
    )

    expect(res.statusCode).toEqual(200)
  })

  it('refuses a bad date the update carries', async () => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce({
      ...mockEvent,
      endDate: legacyDayValue('2025-06-02T00:00:00'),
      startDate: legacyDayValue('2025-06-01T00:00:00'),
    })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>(
        { id: 'existing', startDate: legacyDayValue('12') },
        { method: 'PATCH' }
      )
    )

    expect(res.statusCode).toEqual(400)
    expect(JSON.parse(res.body)).toEqual({ message: 'Bad request: startDate must be a valid date' })
    expect(patchEventMock).not.toHaveBeenCalled()
  })

  it.each([
    [{ endDate: legacyDayValue('2025-06-02'), state: 'draft' as const }, 'startDate'],
    [{ endDate: legacyDayValue(''), startDate: legacyDayValue('2025-06-01'), state: 'draft' as const }, 'endDate'],
  ])('rejects a draft event with a missing or empty %s before saving', async (payload, field) => {
    signIn(mockSecretary)

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ ...payload, organizer: mockEvent.organizer })
    )

    expect(res.statusCode).toEqual(400)
    expect(JSON.parse(res.body)).toEqual({ message: `Bad request: ${field} must be a valid date` })
    expect(saveEventMock).not.toHaveBeenCalled()
  })

  // KOE-1736: an exercise's own maximum and half points, only for an unofficial trial following NOWT.
  describe('the exercise scoring of an unofficial trial (KOE-1736)', () => {
    const hankinome: JsonDogEvent = { ...mockEvent, eventType: 'Hankinome', officialFormat: 'NOWT' }
    const patch = async (stored: JsonDogEvent, body: Record<string, unknown>) => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce(stored)
      return putEventLambda(constructAPIGwEvent({ id: 'existing', ...body }, { method: 'PATCH' }))
    }

    it('stores a maximum and half points for a trial following NOWT', async () => {
      const exerciseScoring = { halfPoints: true, maxPoints: 30 }
      const res = await patch(hankinome, { exerciseScoring })

      expect(res.statusCode).toEqual(200)
      expect(patchEventMock).toHaveBeenCalledWith(
        'existing',
        expect.anything(),
        expect.objectContaining({ exerciseScoring })
      )
    })

    it('keeps the setting once a post has run a turn', async () => {
      const turn = {
        dogs: [{ name: 'Dog', number: 1 }],
        id: 'turn-1',
        registrationIds: ['run-1'],
        startedAt: '2026-09-12T08:00:00.000Z',
        stationId: 'post-1',
      }
      const run: JsonDogEvent = { ...hankinome, exerciseScoring: { maxPoints: 30 }, turns: [turn] }
      const res = await patch(run, { exerciseScoring: { maxPoints: 24 } })

      expect(res.statusCode).toEqual(409)
      expect(JSON.parse(res.body)).toMatchObject({ error: 'exerciseScoringLocked' })
    })

    it.each([
      ['an official trial', { ...mockEvent, eventType: 'NOWT' }],
      ['a trial following no NOWT', { ...hankinome, officialFormat: 'NOU' as const }],
    ])('refuses the setting on %s', async (_name, stored) => {
      const res = await patch(stored, { exerciseScoring: { maxPoints: 30 } })

      expect(res.statusCode).toEqual(400)
      expect(JSON.parse(res.body)).toMatchObject({ error: 'invalidExerciseScoring' })
    })

    it('refuses an odd maximum in whole points', async () => {
      const res = await patch(hankinome, { exerciseScoring: { maxPoints: 25 } })

      expect(res.statusCode).toEqual(400)
      expect(JSON.parse(res.body)).toMatchObject({ errors: [{ kind: 'oddWithoutHalves' }] })
    })

    // The trial's format is the secretary's to change: a setting the trial no longer qualifies for is
    // removed, the save is not refused.
    describe('once the trial no longer follows NOWT', () => {
      const scored: JsonDogEvent = { ...hankinome, exerciseScoring: { halfPoints: true, maxPoints: 30 } }
      const savedWithoutScoring = () =>
        expect(patchEventMock).toHaveBeenCalledWith(
          'existing',
          expect.anything(),
          expect.not.objectContaining({ exerciseScoring: expect.anything() })
        )

      it.each<[string, JsonDogEvent, Record<string, unknown>]>([
        ['a save of another format', scored, { officialFormat: 'NOME-B' }],
        ['a save that clears the format', scored, { officialFormat: null }],
        // A whole event repeats the stored setting beside the new format.
        ['a whole-event save of another format', scored, { ...scored, officialFormat: 'NOME-B' }],
        // A row a save left with the setting while it took another format.
        ['any later save', { ...scored, officialFormat: 'NOME-B' }, { name: 'Uusi nimi' }],
      ])('drops the setting on %s', async (_name, stored, body) => {
        const res = await patch(stored, body)

        expect(res.statusCode).toEqual(200)
        savedWithoutScoring()
      })

      it('drops a setting left behind even when a post has run a turn', async () => {
        const turn = {
          dogs: [{ name: 'Dog', number: 1 }],
          id: 'turn-1',
          registrationIds: ['run-1'],
          startedAt: '2026-09-12T08:00:00.000Z',
          stationId: 'post-1',
        }
        const res = await patch({ ...scored, officialFormat: 'NOME-B', turns: [turn] }, { name: 'Uusi nimi' })

        expect(res.statusCode).toEqual(200)
        savedWithoutScoring()
      })
    })
  })

  // KOE-674: an unofficial event's own classes, checked on the merged event through the real rule.
  describe('the own classes of an unofficial event (KOE-674)', () => {
    const derby = { code: 'DERBY', name: { fi: 'Derby' } }
    const veterans = { code: 'VET10', name: { fi: 'Veteraanit' } }
    const own: JsonDogEvent = {
      ...mockEvent,
      classes: [
        { class: 'DERBY', date: '2025-06-01' },
        { class: 'VET10', date: '2025-06-02' },
      ],
      eventType: 'Labradorien derby',
      ownClasses: [derby, veterans],
    }
    const patch = async (stored: JsonDogEvent, body: Record<string, unknown>) => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce(stored)
      return putEventLambda(constructAPIGwEvent({ id: 'existing', ...body }, { method: 'PATCH' }))
    }

    it('stores own classes, each with its class day, without reading the entries of an event with none', async () => {
      const { classes, ownClasses } = own

      const res = await patch({ ...mockEvent, eventType: own.eventType }, { classes, ownClasses })

      expect(res.statusCode).toEqual(200)
      expect(patchEventMock).toHaveBeenCalledWith(
        'existing',
        expect.anything(),
        expect.objectContaining({ ownClasses })
      )
      expect(mockReadEventRegistrations).not.toHaveBeenCalled()
    })

    it.each([
      ['on an official type', { eventType: 'NOWT' }, { kind: 'officialType' }],
      [
        'with a code that is no code',
        { ownClasses: [{ ...derby, code: 'DERBY 1' }, veterans] },
        { code: 'DERBY 1', kind: 'badCode' },
      ],
      [
        'without a class day',
        { classes: [{ class: 'DERBY', date: '2025-06-01' }] },
        { code: 'VET10', kind: 'noClassDay' },
      ],
      [
        'without a Finnish name',
        { ownClasses: [derby, { ...veterans, name: { en: 'Veterans' } }] },
        { code: 'VET10', kind: 'unnamed' },
      ],
      [
        'with a code twice',
        { ownClasses: [derby, veterans, { ...derby, name: { fi: 'Toinen' } }] },
        { code: 'DERBY', kind: 'codeTwice' },
      ],
      [
        'with a class day of no own class',
        { classes: [...own.classes, { class: 'ALO', date: '2025-06-02' }] },
        { code: 'ALO', kind: 'notOwnClass' },
      ],
      ['taken away while their class days stay', { ownClasses: [] }, { code: 'DERBY', kind: 'notOwnClass' }],
    ])('refuses own classes %s', async (_name, body, error) => {
      const res = await patch(own, body)

      expect(res.statusCode).toEqual(400)
      expect(JSON.parse(res.body)).toMatchObject({
        error: 'invalidOwnClasses',
        errors: expect.arrayContaining([error]),
      })
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('refuses own classes that are not a list of named codes', async () => {
      const res = await patch(own, { ownClasses: [{ code: 1, name: { fi: 'Derby' } }] })

      expect(res.statusCode).toEqual(400)
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    // The event's count of entries holds neither a cancelled nor an unpaid registration; both keep their class.
    const renamed = {
      classes: [own.classes[0], { class: 'VET', date: '2025-06-02' }],
      ownClasses: [derby, { ...veterans, code: 'VET' }],
    }

    it.each([
      ['an entry', {}],
      ['a cancelled entry', { cancelled: true }],
      ['an unpaid entry', { state: 'creating' }],
    ])('refuses changing a code %s holds, whatever the count of entries', async (_name, registration) => {
      mockReadEventRegistrations.mockResolvedValue([
        { ...invitedParticipant(), class: 'DERBY' },
        { ...invitedParticipant(), ...registration, class: 'VET10' },
      ])

      const res = await patch({ ...own, entries: 0 }, renamed)

      expect(res.statusCode).toEqual(400)
      expect(JSON.parse(res.body)).toMatchObject({
        error: 'invalidOwnClasses',
        errors: [{ code: 'VET10', kind: 'registered' }],
      })
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('stores a changed code once no registration holds it', async () => {
      mockReadEventRegistrations.mockResolvedValue([{ ...invitedParticipant(), class: 'DERBY' }])

      expect((await patch(own, renamed)).statusCode).toEqual(200)
    })

    it.each([
      ['an empty list', []],
      ['a null', null],
    ])('refuses taking the own classes away with %s while an entry holds one', async (_name, ownClasses) => {
      mockReadEventRegistrations.mockResolvedValue([{ ...invitedParticipant(), cancelled: true, class: 'DERBY' }])

      const res = await patch(own, { classes: [{ class: 'ALO', date: '2025-06-01' }], ownClasses })

      expect(res.statusCode).toEqual(400)
      expect(JSON.parse(res.body)).toMatchObject({ errors: [{ code: 'DERBY', kind: 'registered' }] })
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('stores the own classes taken away once no registration holds one', async () => {
      mockReadEventRegistrations.mockResolvedValue([{ ...invitedParticipant(), class: 'ALO' }])

      const res = await patch(own, { classes: [{ class: 'ALO', date: '2025-06-01' }], ownClasses: null })

      expect(res.statusCode).toEqual(200)
      expect(patchEventMock).toHaveBeenCalledWith(
        'existing',
        own,
        expect.not.objectContaining({ ownClasses: expect.anything() })
      )
    })

    it('refuses a class day of no official class on an event without own classes', async () => {
      const res = await patch(mockEvent, { classes: [{ class: 'DERBY', date: '2025-06-01' }] })

      expect(res.statusCode).toEqual(400)
      expect(JSON.parse(res.body)).toMatchObject({ errors: [{ code: 'DERBY', kind: 'notOwnClass' }] })
    })

    it('reads no entries for a save that keeps every class the event had', async () => {
      const res = await patch(
        { ...own, entries: 2 },
        { ownClasses: [veterans, { ...derby, name: { fi: 'Derby 2026' } }] }
      )

      expect(res.statusCode).toEqual(200)
      expect(mockReadEventRegistrations).not.toHaveBeenCalled()
    })

    it('leaves the own classes unchecked by a save that carries nothing they rest on', async () => {
      const res = await patch({ ...own, classes: [] }, { name: 'Uusi nimi' })

      expect(res.statusCode).toEqual(200)
    })

    // The posts and the running order of a trial that follows NOWT: a group for each class.
    describe('the running order of a class taken away', () => {
      const stations: EventStation[] = [{ date: '2025-06-01', id: 'post-1', number: 1 }]
      const derbyGroup: EventRotationGroup = { class: 'DERBY', exercises: [{ stationId: 'post-1' }] }
      const veteransGroup: EventRotationGroup = { class: 'VET10', exercises: [{ stationId: 'post-1' }] }
      const following: JsonDogEvent = {
        ...own,
        officialFormat: 'NOWT',
        rotations: [derbyGroup, veteransGroup],
        stations,
      }
      const withoutVeterans = { classes: [own.classes[0]], ownClasses: [derby] }

      beforeEach(() => mockReadEventRegistrations.mockResolvedValue([{ ...invitedParticipant(), class: 'DERBY' }]))

      it('drops the groups of the class with the class', async () => {
        const res = await patch(following, withoutVeterans)

        expect(res.statusCode).toEqual(200)
        expect(patchEventMock).toHaveBeenCalledWith(
          'existing',
          expect.anything(),
          expect.objectContaining({ rotations: [derbyGroup] })
        )
      })

      // A save of the whole event carries the stored groups back with the classes.
      it('saves the whole event that still carries the group of the class taken away', async () => {
        const res = await patch(following, { ...following, ...withoutVeterans, entryEndDate: '2025-05-20' })

        expect(res.statusCode).toEqual(200)
        expect(patchEventMock).toHaveBeenCalledWith(
          'existing',
          expect.anything(),
          expect.objectContaining({ rotations: [derbyGroup] })
        )
      })

      it('still refuses a save of the groups alone that names a class the event does not run', async () => {
        const res = await patch(
          { ...following, ...withoutVeterans, rotations: [derbyGroup] },
          {
            rotations: [derbyGroup, veteransGroup],
          }
        )

        expect(res.statusCode).toEqual(400)
        expect(JSON.parse(res.body)).toMatchObject({ errors: [{ group: 1, kind: 'unknownClass' }] })
        expect(patchEventMock).not.toHaveBeenCalled()
      })

      // An event left without classes keys a group as a classless dog, never by a class code.
      it('drops the group of the last class taken away', async () => {
        mockReadEventRegistrations.mockResolvedValue([])

        const res = await patch(
          { ...following, ...withoutVeterans, rotations: [derbyGroup] },
          { classes: [], ownClasses: null }
        )

        expect(res.statusCode).toEqual(200)
        expect(patchEventMock).toHaveBeenCalledWith(
          'existing',
          expect.anything(),
          expect.objectContaining({ rotations: [] })
        )
      })
    })
  })

  // KOE-1741: a change of the trial's days takes its posts and their groups along, never refusing.
  describe('the posts and groups when the days change (KOE-1741)', () => {
    const first: EventStation = { date: '2025-06-01', id: 'post-1', number: 1 }
    const second: EventStation = { date: '2025-06-02', id: 'post-2', number: 1 }
    const firstDay: EventRotationGroup = { class: 'ALO', exercises: [{ stationId: 'post-1' }] }
    const secondDay: EventRotationGroup = { class: 'ALO', exercises: [{ stationId: 'post-2' }] }
    const nowt: JsonDogEvent = {
      ...mockEvent,
      classes: [
        { class: 'ALO', date: '2025-06-01' },
        { class: 'ALO', date: '2025-06-02' },
      ],
      eventType: 'NOWT',
      rotations: [firstDay, secondDay],
      stations: [first, second],
    }
    const patch = async (stored: JsonDogEvent, body: Record<string, unknown>) => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce(stored)
      return putEventLambda(constructAPIGwEvent({ id: 'existing', ...body }, { method: 'PATCH' }))
    }
    const expectSaved = (fields: Partial<JsonDogEvent>) =>
      expect(patchEventMock).toHaveBeenCalledWith('existing', expect.anything(), expect.objectContaining(fields))

    beforeEach(() => mockReadEventRegistrations.mockResolvedValue([]))

    // The event form sends what it changed: the days and the classes it moved with the start.
    it.each<[string, Partial<JsonDogEvent>, EventStation[], EventRotationGroup[]]>([
      [
        'a start moved with the same length',
        {
          classes: [
            { class: 'ALO', date: '2025-06-08' },
            { class: 'ALO', date: '2025-06-09' },
          ],
          endDate: '2025-06-09',
          startDate: '2025-06-08',
        },
        [
          { ...first, date: '2025-06-08' },
          { ...second, date: '2025-06-09' },
        ],
        [firstDay, secondDay],
      ],
      [
        'a day added at the start',
        {
          classes: [
            { class: 'ALO', date: '2025-05-31' },
            { class: 'ALO', date: '2025-06-01' },
          ],
          endDate: '2025-06-02',
          startDate: '2025-05-31',
        },
        [
          { ...first, date: '2025-05-31' },
          { ...second, date: '2025-06-01' },
        ],
        [firstDay, secondDay],
      ],
      ['a day added at the end', { endDate: '2025-06-03' }, [first, second], [firstDay, secondDay]],
      [
        'the last day taken away',
        { classes: [{ class: 'ALO', date: '2025-06-01' }], endDate: '2025-06-01' },
        [first],
        [firstDay],
      ],
      [
        'a start moved past the first day',
        {
          classes: [{ class: 'ALO', date: '2025-06-02' }],
          endDate: '2025-06-02',
          startDate: '2025-06-02',
        },
        [{ ...first, date: '2025-06-02' }],
        [firstDay],
      ],
    ])('moves the posts and their groups along with %s', async (_name, body, stations, rotations) => {
      const res = await patch(nowt, body)

      expect(res.statusCode).toEqual(200)
      expectSaved({ rotations, stations })
    })

    it('moves the posts of a whole-event save that carries them back as stored', async () => {
      const res = await patch(nowt, {
        ...nowt,
        classes: [
          { class: 'ALO', date: '2025-06-08' },
          { class: 'ALO', date: '2025-06-09' },
        ],
        endDate: '2025-06-09',
        startDate: '2025-06-08',
      })

      expect(res.statusCode).toEqual(200)
      expectSaved({
        rotations: [firstDay, secondDay],
        stations: [
          { ...first, date: '2025-06-08' },
          { ...second, date: '2025-06-09' },
        ],
      })
    })

    it('keeps the day a save gives a post itself', async () => {
      const res = await patch(nowt, {
        endDate: '2025-06-09',
        startDate: '2025-06-08',
        stations: [
          { ...first, date: '2025-06-09' },
          { ...second, date: '2025-06-08' },
        ],
      })

      expect(res.statusCode).toEqual(200)
      expectSaved({
        stations: [
          { ...first, date: '2025-06-09' },
          { ...second, date: '2025-06-08' },
        ],
      })
    })

    // A row an earlier save left with posts on a day the trial no longer has.
    it('drops the posts and groups already off the days on the next save of the days', async () => {
      const stored: JsonDogEvent = { ...nowt, endDate: '2025-06-01' }

      const res = await patch(stored, { endDate: '2025-06-01', startDate: '2025-06-01' })

      expect(res.statusCode).toEqual(200)
      expectSaved({ rotations: [firstDay], stations: [first] })
    })

    it('leaves the posts alone on a save that carries neither the days nor the posts', async () => {
      const stored: JsonDogEvent = { ...nowt, endDate: '2025-06-01' }

      const res = await patch(stored, { name: 'Uusi nimi' })

      expect(res.statusCode).toEqual(200)
      expectSaved({ rotations: [firstDay, secondDay], stations: [first, second] })
    })

    // The live timeline names its posts by id: a post that has run a turn keeps its day.
    /** A turn run at a post: the live timeline names the post by its id. */
    const turnAt = (stationId: string) => ({
      dogs: [],
      id: `turn-${stationId}`,
      registrationIds: [],
      startedAt: '2025-06-01T08:00:00.000Z',
      stationId,
    })

    it.each([
      ['drop', 'post-2', { classes: [nowt.classes[0]], endDate: '2025-06-01' }],
      [
        'move',
        'post-1',
        {
          classes: [
            { class: 'ALO', date: '2025-06-08' },
            { class: 'ALO', date: '2025-06-09' },
          ],
          endDate: '2025-06-09',
          startDate: '2025-06-08',
        },
      ],
    ])('refuses a change of the days that would %s a post that has run a turn', async (_verb, stationId, body) => {
      const res = await patch({ ...nowt, turns: [turnAt(stationId)] }, body)

      expect(res.statusCode).toEqual(409)
      expect(JSON.parse(res.body)).toMatchObject({ error: 'stationDaysLocked' })
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    // The lock is the run post's alone: the day that has run stays, the other goes.
    it('saves a change of the days that leaves every post that has run a turn on its day', async () => {
      const res = await patch(
        { ...nowt, turns: [turnAt('post-1')] },
        { classes: [nowt.classes[0]], endDate: '2025-06-01' }
      )

      expect(res.statusCode).toEqual(200)
      expectSaved({ rotations: [firstDay], stations: [first] })
    })

    // A copy is saved as a new event: its posts are on its days, moved there by the copy and the form.
    it('keeps the posts and groups of a new event on its days', async () => {
      signIn(mockSecretary)
      const { id: _id, ...copy } = { ...nowt, name: 'Kopio' }

      const res = await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>(copy))

      expect(res.statusCode).toEqual(200)
      expect(saveEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'new-id', rotations: [firstDay, secondDay], stations: [first, second] })
      )
    })
  })

  // KOE-1752: the day groups and the places per day follow the trial's days. The event form moves them
  // itself, as it moves the classes, so what a save carries is on the days it gives; what a save leaves
  // out (a form loaded before) still holds the stored days and moves as many days as the start did. A
  // day the trial no longer has is left out either way.
  describe('the day groups and the places per day when the days change (KOE-1752)', () => {
    const grouped: JsonDogEvent = {
      ...mockEvent,
      dates: [
        { date: '2025-06-01', time: 'kp' },
        { date: '2025-06-02', time: 'ap' },
        { date: '2025-06-02', time: 'ip' },
      ],
      placesPerDay: { '2025-06-01': 10, '2025-06-02': 20 },
    }
    const movedWeek: Pick<JsonDogEvent, 'dates' | 'placesPerDay'> = {
      dates: [
        { date: '2025-06-08', time: 'kp' },
        { date: '2025-06-09', time: 'ap' },
        { date: '2025-06-09', time: 'ip' },
      ],
      placesPerDay: { '2025-06-08': 10, '2025-06-09': 20 },
    }
    const patch = async (stored: JsonDogEvent, body: Record<string, unknown>) => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce(stored)
      return putEventLambda(constructAPIGwEvent({ id: 'existing', ...body }, { method: 'PATCH' }))
    }
    const expectSaved = (fields: Partial<JsonDogEvent>) =>
      expect(patchEventMock).toHaveBeenCalledWith('existing', expect.anything(), expect.objectContaining(fields))

    beforeEach(() => mockReadEventRegistrations.mockResolvedValue([]))

    it.each<[string, Partial<JsonDogEvent>, Pick<JsonDogEvent, 'dates' | 'placesPerDay'>]>([
      ['a start moved with the same length', { endDate: '2025-06-09', startDate: '2025-06-08' }, movedWeek],
      [
        'a day added at the start',
        { startDate: '2025-05-31' },
        {
          dates: [
            { date: '2025-05-31', time: 'kp' },
            { date: '2025-06-01', time: 'ap' },
            { date: '2025-06-01', time: 'ip' },
          ],
          placesPerDay: { '2025-05-31': 10, '2025-06-01': 20 },
        },
      ],
      ['a day added at the end', { endDate: '2025-06-03' }, grouped],
      [
        'the last day taken away',
        { endDate: '2025-06-01' },
        { dates: [{ date: '2025-06-01', time: 'kp' }], placesPerDay: { '2025-06-01': 10 } },
      ],
    ])('moves the stored ones along with %s', async (_name, body, { dates, placesPerDay }) => {
      const res = await patch(grouped, body)

      expect(res.statusCode).toEqual(200)
      expectSaved({ dates, placesPerDay })
    })

    // An empty list of groups would leave the trial none at all: with none left the trial's defaults hold.
    it('stores no groups or places once the day they were on is taken away', async () => {
      const lastDayOnly: JsonDogEvent = {
        ...mockEvent,
        dates: [{ date: '2025-06-02', time: 'ap' }],
        placesPerDay: { '2025-06-02': 20 },
      }

      const res = await patch(lastDayOnly, { endDate: '2025-06-01' })

      expect(res.statusCode).toEqual(200)
      expect(patchEventMock).toHaveBeenCalledWith(
        'existing',
        lastDayOnly,
        expect.not.objectContaining({ dates: expect.anything() })
      )
      expect(patchEventMock).toHaveBeenCalledWith(
        'existing',
        lastDayOnly,
        expect.not.objectContaining({ placesPerDay: expect.anything() })
      )
    })

    it('keeps what a whole-event save carries on the new days', async () => {
      const res = await patch(grouped, { ...grouped, ...movedWeek, endDate: '2025-06-09', startDate: '2025-06-08' })

      expect(res.statusCode).toEqual(200)
      expectSaved(movedWeek)
    })

    it('keeps what the save gives itself, and leaves out a day the trial does not have', async () => {
      const res = await patch(grouped, {
        dates: [
          { date: '2025-06-08', time: 'ap' },
          { date: '2025-06-09', time: 'kp' },
          { date: '2025-06-10', time: 'kp' },
        ],
        endDate: '2025-06-09',
        placesPerDay: { '2025-06-01': null, '2025-06-02': null, '2025-06-08': 5, '2025-06-10': 7 },
        startDate: '2025-06-08',
      })

      expect(res.statusCode).toEqual(200)
      expectSaved({
        dates: [
          { date: '2025-06-08', time: 'ap' },
          { date: '2025-06-09', time: 'kp' },
        ],
        placesPerDay: { '2025-06-08': 5 },
      })
    })
  })

  // KOE-1745: the save sends a key taken out of a changed object as null, which the merge deletes.
  describe('a key taken out of a changed object', () => {
    const patch = async (stored: JsonDogEvent, body: Record<string, unknown>) => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce(stored)
      return putEventLambda(constructAPIGwEvent({ id: 'existing', ...body }, { method: 'PATCH' }))
    }

    it('stores the official picked in place of another, without the fields of the one before', async () => {
      const stored: JsonDogEvent = {
        ...mockEvent,
        official: { email: 'vanha@example.com', id: 'old', name: 'Vanha', phone: '040 1' },
      }
      const official = { email: 'uusi@example.com', id: 'new', name: 'Uusi' }

      const res = await patch(stored, { official: { ...official, phone: null } })

      expect(res.statusCode).toEqual(200)
      expect(patchEventMock).toHaveBeenCalledWith('existing', stored, expect.objectContaining({ official }))
    })

    it('stores the cost without a breed taken out of it, keyed by its code', async () => {
      const stored: JsonDogEvent = { ...mockEvent, cost: { breed: { '110': 40, '111': 45 }, normal: 50 } }

      const res = await patch(stored, { cost: { breed: { '110': null, '111': 45 }, normal: 50 } })

      expect(res.statusCode).toEqual(200)
      expect(patchEventMock).toHaveBeenCalledWith(
        'existing',
        stored,
        expect.objectContaining({ cost: { breed: { '111': 45 }, normal: 50 } })
      )
    })
  })

  describe('the teams of a team competition (KOE-1714)', () => {
    const putTeams = async (teams: unknown) => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce(mockEvent)
      return putEventLambda(constructAPIGwEvent({ id: 'existing', teams }, { method: 'PATCH' }))
    }
    const members = (count: number) => Array.from({ length: count }, (_, index) => `dog-${index}`)
    /** Entries that run, under the ids the teams name: before their class is picked every one may join. */
    const entriesOf = (ids: readonly string[]) =>
      ids.map((id) => ({ ...invitedParticipant('ALO'), id, state: 'ready' }))

    beforeEach(() => {
      mockReadEventRegistrations.mockResolvedValue(entriesOf([...'abcdefgh', ...members(26)]))
    })

    it.each([
      [
        'a dog in two teams',
        [{ registrationIds: ['a'] }, { registrationIds: ['a'] }],
        { kind: 'twice', registrationId: 'a' },
      ],
      ['a team of 27 dogs', [{ registrationIds: members(27) }], { kind: 'tooMany', team: 0 }],
    ])('refuses %s', async (_name, teams, error) => {
      const res = await putTeams(teams)

      expect(res.statusCode).toEqual(400)
      expect(JSON.parse(res.body)).toMatchObject({ error: 'invalidTeams', errors: [error] })
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it.each([
      ['without a list of dogs', [{ name: 'Joukkue' }]],
      ['with a name that is not text', [{ name: 1, registrationIds: [] }]],
      ['with a run-off mark that is not a boolean', [{ registrationIds: [], runOffWon: 'yes' }]],
      ['with a first-team mark that is not true (KOE-1722)', [{ primary: false, registrationIds: [] }]],
    ])('refuses a team %s', async (_name, teams) => {
      const res = await putTeams(teams)

      expect(res.statusCode).toEqual(400)
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('stores a first-team mark (KOE-1722)', async () => {
      const teams = [{ primary: true, registrationIds: ['a'] }, { registrationIds: ['b'] }]

      const res = await putTeams(teams)

      expect(res.statusCode).toEqual(200)
      expect(patchEventMock).toHaveBeenCalledWith('existing', mockEvent, expect.objectContaining({ teams }))
    })

    it('stores named teams, a full one and an empty one among them, reading the entries of the dogs that join', async () => {
      const teams = [{ name: 'Team Finland 1', registrationIds: members(26) }, { registrationIds: [] }]

      const res = await putTeams(teams)

      expect(res.statusCode).toEqual(200)
      expect(patchEventMock).toHaveBeenCalledWith('existing', mockEvent, expect.objectContaining({ teams }))
      expect(mockReadEventRegistrations).toHaveBeenCalledWith('existing')
    })

    // KOE-1725: once a dog's class is picked, only the dogs picked into it join a team.
    describe('the candidates (KOE-1725)', () => {
      const picked: JsonDogEvent = { ...mockEvent, classes: [{ class: 'ALO', date: '2025-06-01', state: 'picked' }] }
      const putOver = async (stored: JsonDogEvent, teams: unknown) => {
        signIn(mockSecretary)
        getEventMock.mockResolvedValueOnce(stored)
        return putEventLambda(constructAPIGwEvent({ id: 'existing', teams }, { method: 'PATCH' }))
      }
      const reserve = { ...invitedParticipant('ALO'), group: { key: 'reserve', number: 1 }, id: 'wait', state: 'ready' }

      beforeEach(() => {
        mockReadEventRegistrations.mockResolvedValue([...entriesOf(['a']), reserve])
      })

      it.each([
        ['a reserve dog once its class is picked', 'wait'],
        ['a dog the entries do not hold', 'nobody'],
      ])('refuses %s joining a team', async (_name, id) => {
        const res = await putOver(picked, [{ registrationIds: ['a', id] }])

        expect(res.statusCode).toEqual(400)
        expect(JSON.parse(res.body)).toMatchObject({
          error: 'invalidTeams',
          errors: [{ kind: 'notCandidate', registrationId: id }],
        })
        expect(patchEventMock).not.toHaveBeenCalled()
      })

      it('refuses an entry that is not finished, though its class is not picked yet', async () => {
        mockReadEventRegistrations.mockResolvedValue([
          ...entriesOf(['a']),
          { ...invitedParticipant('ALO'), id: 'unpaid', state: 'creating' },
        ])

        const res = await putOver(mockEvent, [{ registrationIds: ['a', 'unpaid'] }])

        expect(res.statusCode).toEqual(400)
        expect(JSON.parse(res.body)).toMatchObject({ errors: [{ kind: 'notCandidate', registrationId: 'unpaid' }] })
      })

      it('lets a reserve dog join while its class is not picked yet', async () => {
        const res = await putOver(mockEvent, [{ registrationIds: ['a', 'wait'] }])

        expect(res.statusCode).toEqual(200)
      })

      it('keeps a dog that was in a team before, and reads no entries when no dog joins', async () => {
        const stored: JsonDogEvent = { ...picked, teams: [{ registrationIds: ['wait', 'a'] }] }

        const res = await putOver(stored, [{ registrationIds: ['a'] }, { name: 'Varalla', registrationIds: ['wait'] }])

        expect(res.statusCode).toEqual(200)
        expect(mockReadEventRegistrations).not.toHaveBeenCalled()
      })
    })

    it('leaves the stored teams unchecked by a save that carries nothing they rest on (KOE-1720)', async () => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce({ ...mockEvent, teams: [{ registrationIds: ['a', 'a'] }] })

      const res = await putEventLambda(constructAPIGwEvent({ id: 'existing', name: 'Uusi nimi' }, { method: 'PATCH' }))

      expect(res.statusCode).toEqual(200)
    })

    // KOE-1720: the teams are checked on the merged event whenever a save changes what they rest on.
    describe('in series and on the merged event (KOE-1720)', () => {
      const series = [
        { id: 'open', name: { fi: 'Avoin' } },
        { id: 'breed', name: { fi: 'Rotu' } },
      ]
      const inSeries = {
        ...mockEvent,
        teamCompetition: { series },
        teams: [{ registrationIds: ['a'], seriesId: 'open' }],
      }
      const patch = async (stored: JsonDogEvent, body: Record<string, unknown>) => {
        signIn(mockSecretary)
        getEventMock.mockResolvedValueOnce(stored)
        return putEventLambda(constructAPIGwEvent({ id: 'existing', ...body }, { method: 'PATCH' }))
      }

      it('stores a team in a series of the competition, without reading the entries', async () => {
        const teams = [{ registrationIds: ['a'], seriesId: 'breed' }]

        const res = await patch(inSeries, { teams })

        expect(res.statusCode).toEqual(200)
        expect(patchEventMock).toHaveBeenCalledWith('existing', inSeries, expect.objectContaining({ teams }))
        expect(mockReadEventRegistrations).not.toHaveBeenCalled()
      })

      it('refuses a team in a series the competition does not have', async () => {
        const res = await patch(inSeries, { teams: [{ registrationIds: ['a'], seriesId: 'gone' }] })

        expect(res.statusCode).toEqual(400)
        expect(JSON.parse(res.body)).toMatchObject({
          error: 'invalidTeams',
          errors: [{ kind: 'unknownSeries', seriesId: 'gone', team: 0 }],
        })
        expect(patchEventMock).not.toHaveBeenCalled()
      })

      it('refuses removing a series a team is in, through the competition alone', async () => {
        const res = await patch(inSeries, { teamCompetition: { series: [series[1]] } })

        expect(res.statusCode).toEqual(400)
        expect(JSON.parse(res.body)).toMatchObject({
          error: 'invalidTeams',
          errors: [{ kind: 'unknownSeries', seriesId: 'open', team: 0 }],
        })
        expect(patchEventMock).not.toHaveBeenCalled()
      })

      it('stores a series removed together with moving its team out of it', async () => {
        const teams = [{ registrationIds: ['a'], seriesId: 'breed' }]

        const res = await patch(inSeries, { teamCompetition: { series: [series[1]] }, teams })

        expect(res.statusCode).toEqual(200)
        expect(patchEventMock).toHaveBeenCalledWith(
          'existing',
          inSeries,
          expect.objectContaining({ teamCompetition: { series: [series[1]] }, teams })
        )
      })

      it('refuses removing the competition settings while a team is in a series', async () => {
        const res = await patch(inSeries, { teamCompetition: null })

        expect(res.statusCode).toEqual(400)
        expect(patchEventMock).not.toHaveBeenCalled()
      })

      it('refuses series that do not fit together', async () => {
        const res = await patch(mockEvent, {
          teamCompetition: { series: [series[0], { id: 'open', name: { fi: 'Toinen' } }] },
        })

        expect(res.statusCode).toEqual(400)
        expect(JSON.parse(res.body)).toMatchObject({
          error: 'invalidTeamCompetition',
          errors: [{ kind: 'seriesTwice', seriesId: 'open' }],
        })
        expect(patchEventMock).not.toHaveBeenCalled()
      })

      it.each([
        ['a series without an id', { series: [{ name: { fi: 'Avoin' } }] }],
        ['a series with an empty id', { series: [{ id: '', name: { fi: 'Avoin' } }] }],
        ['a series name that is not text', { series: [{ id: 'open', name: { fi: 1 } }] }],
        ['a question at entry that is not a boolean', { askAtEntry: 'yes' }],
        ['counted days that are not a list', { days: '2025-06-01' }],
        ['a counted day that is not a day', { days: ['1.6.2025'] }],
      ])('refuses competition settings with %s', async (_name, teamCompetition) => {
        const res = await patch(mockEvent, { teamCompetition })

        expect(res.statusCode).toEqual(400)
        expect(patchEventMock).not.toHaveBeenCalled()
      })

      it('removes one setting of the competition on a PATCH that sends it as null', async () => {
        const stored = { ...mockEvent, teamCompetition: { askAtEntry: true, series } }

        const res = await patch(stored, { teamCompetition: { askAtEntry: null } })

        expect(res.statusCode).toEqual(200)
        expect(patchEventMock).toHaveBeenCalledWith(
          'existing',
          stored,
          expect.objectContaining({ teamCompetition: { series } })
        )
      })

      // KOE-1745: the teams page takes one setting off with a null while another stays on.
      it.each([
        ['the question at entry', { askAtEntry: null }, { days: ['2025-06-01'], litters: true }],
        ['litter teams', { litters: null }, { askAtEntry: true, days: ['2025-06-01'] }],
        ['the counted days', { days: null }, { askAtEntry: true, litters: true }],
      ])('takes off %s and keeps the settings left on', async (_name, off, kept) => {
        const stored: JsonDogEvent = {
          ...mockEvent,
          teamCompetition: { askAtEntry: true, days: ['2025-06-01'], litters: true },
        }

        const res = await patch(stored, { teamCompetition: { ...kept, ...off } })

        expect(res.statusCode).toEqual(200)
        expect(patchEventMock).toHaveBeenCalledWith(
          'existing',
          stored,
          expect.objectContaining({ teamCompetition: kept })
        )
      })

      // Off is no setting at all: settings left with none on are no settings, not an empty object.
      it.each<[string, TeamCompetition, Record<string, unknown>]>([
        ['the last setting taken off', { askAtEntry: true }, { teamCompetition: { askAtEntry: null } }],
        ['the counted days the trial no longer has', { days: ['2025-06-02'] }, { endDate: '2025-06-01' }],
      ])('stores no settings once %s leaves none', async (_name, teamCompetition, body) => {
        const stored: JsonDogEvent = { ...mockEvent, teamCompetition }

        const res = await patch(stored, body)

        expect(res.statusCode).toEqual(200)
        expect(patchEventMock).toHaveBeenCalledWith(
          'existing',
          stored,
          expect.not.objectContaining({ teamCompetition: expect.anything() })
        )
      })

      // KOE-1726: a change of the trial's days leaves out a counted day it no longer has, never refusing.
      describe('the counted days', () => {
        const counted: JsonDogEvent = {
          ...mockEvent,
          teamCompetition: { askAtEntry: true, days: ['2025-06-01', '2025-06-02'] },
          teams: [{ registrationIds: ['a'] }],
        }

        it.each([
          [
            'an earlier last day',
            { endDate: '2025-06-01', startDate: '2025-06-01' },
            { askAtEntry: true, days: ['2025-06-01'] },
          ],
          [
            'classes on other days',
            { classes: [{ class: 'ALO', date: '2025-06-03' }], endDate: '2025-06-03' },
            { askAtEntry: true },
          ],
        ])(
          'leaves out the days a save of %s takes from the trial, and publishes the list',
          async (_name, body, kept) => {
            const res = await patch(counted, body)

            expect(res.statusCode).toEqual(200)
            expect(patchEventMock).toHaveBeenCalledWith(
              'existing',
              counted,
              expect.objectContaining({ teamCompetition: kept })
            )
            expect(mockPublishPublicStartList).toHaveBeenCalledWith('existing')
          }
        )

        it('leaves out a counted day the trial does not have from a save of the settings', async () => {
          const res = await patch(counted, { teamCompetition: { days: ['2025-06-02', '2025-07-01'] } })

          expect(res.statusCode).toEqual(200)
          expect(patchEventMock).toHaveBeenCalledWith(
            'existing',
            counted,
            expect.objectContaining({ teamCompetition: { askAtEntry: true, days: ['2025-06-02'] } })
          )
        })

        it('keeps the counted days, and publishes nothing, on a save that leaves the trial its days', async () => {
          const res = await patch(counted, {
            classes: [
              { class: 'ALO', date: '2025-06-01' },
              { class: 'AVO', date: '2025-06-02' },
            ],
          })

          expect(res.statusCode).toEqual(200)
          expect(patchEventMock).toHaveBeenCalledWith(
            'existing',
            counted,
            expect.objectContaining({ teamCompetition: counted.teamCompetition })
          )
          expect(mockPublishPublicStartList).not.toHaveBeenCalled()
        })
      })

      // KOE-1752: the counted days follow the trial's days as its classes and posts do: a counted day still
      // on its stored day moves as many days as the start did, one the save counts itself keeps its day,
      // and one the trial no longer has is left out.
      describe('the counted days when the days change (KOE-1752)', () => {
        const secondCounted: JsonDogEvent = {
          ...mockEvent,
          classes: [
            { class: 'ALO', date: '2025-06-01' },
            { class: 'ALO', date: '2025-06-02' },
          ],
          teamCompetition: { askAtEntry: true, days: ['2025-06-02'] },
        }
        const movedWeek = {
          classes: [
            { class: 'ALO', date: '2025-06-08' },
            { class: 'ALO', date: '2025-06-09' },
          ],
          endDate: '2025-06-09',
          startDate: '2025-06-08',
        }

        it.each<[string, Record<string, unknown>, TeamCompetition]>([
          ['a start moved with the same length', movedWeek, { askAtEntry: true, days: ['2025-06-09'] }],
          [
            'a day added at the start',
            {
              classes: [
                { class: 'ALO', date: '2025-05-31' },
                { class: 'ALO', date: '2025-06-01' },
              ],
              startDate: '2025-05-31',
            },
            { askAtEntry: true, days: ['2025-06-01'] },
          ],
          [
            'a later first day',
            { classes: [{ class: 'ALO', date: '2025-06-02' }], startDate: '2025-06-02' },
            { askAtEntry: true },
          ],
          [
            'a day added at the end',
            { classes: [...secondCounted.classes, { class: 'ALO', date: '2025-06-03' }], endDate: '2025-06-03' },
            { askAtEntry: true, days: ['2025-06-02'] },
          ],
          [
            'the last day taken away',
            { classes: [{ class: 'ALO', date: '2025-06-01' }], endDate: '2025-06-01' },
            { askAtEntry: true },
          ],
          ['a whole-event save', { ...secondCounted, ...movedWeek }, { askAtEntry: true, days: ['2025-06-09'] }],
          [
            'a day the save counts itself',
            { ...movedWeek, teamCompetition: { days: ['2025-06-08'] } },
            { askAtEntry: true, days: ['2025-06-08'] },
          ],
        ])('follows %s', async (_name, body, kept) => {
          const res = await patch(secondCounted, body)

          expect(res.statusCode).toEqual(200)
          expect(patchEventMock).toHaveBeenCalledWith(
            'existing',
            secondCounted,
            expect.objectContaining({ teamCompetition: kept })
          )
        })
      })

      // A stored row whose teams break a rule: the save that changes what they rest on reads them again.
      const broken = { ...mockEvent, teams: [{ registrationIds: ['a', 'a'] }] }

      it.each([
        ['the classes', { classes: [{ class: 'ALO', date: '2025-06-01' }] }],
        ['the first day', { startDate: '2025-05-31' }],
        ['the last day', { endDate: '2025-06-03' }],
      ])('checks the stored teams on a save of %s that does not carry them', async (_name, body) => {
        const res = await patch(broken, body)

        expect(res.statusCode).toEqual(400)
        expect(JSON.parse(res.body)).toMatchObject({ error: 'invalidTeams' })
        expect(patchEventMock).not.toHaveBeenCalled()
      })
    })

    it('removes the stored teams on a PATCH that sends them as null', async () => {
      const stored = { ...mockEvent, teams: [{ registrationIds: ['a'] }] }
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce(stored)

      const res = await putEventLambda(constructAPIGwEvent({ id: 'existing', teams: null }, { method: 'PATCH' }))

      expect(res.statusCode).toEqual(200)
      expect(patchEventMock).toHaveBeenCalledWith(
        'existing',
        stored,
        expect.not.objectContaining({ teams: expect.anything() })
      )
      expect(Object.hasOwn(JSON.parse(res.body), 'teams')).toBe(false)
    })

    // KOE-1715: the public start list shows each dog's team, so a teams save has to reach open pages.
    describe('republishing the start list (KOE-1715)', () => {
      const team = { name: 'Team Finland 1', registrationIds: ['a', 'b'] }
      const putOver = async (
        storedTeams: EventTeam[] | undefined,
        teams: EventTeam[] | null,
        teamCompetition?: TeamCompetition
      ) => {
        signIn(mockSecretary)
        getEventMock.mockResolvedValueOnce({ ...mockEvent, teamCompetition, teams: storedTeams })
        return putEventLambda(constructAPIGwEvent({ id: 'existing', teams }, { method: 'PATCH' }))
      }

      it.each([
        ['new teams', undefined, [team]],
        ['a renamed team', [team], [{ ...team, name: 'Team Finland 2' }]],
        ['a reordered team', [team], [{ ...team, registrationIds: ['b', 'a'] }]],
        // KOE-1717: the run-off decides a placing the list shows.
        ['a run-off won', [team], [{ ...team, runOffWon: true }]],
        ['removed teams', [team], null],
      ])('publishes %s', async (_name, storedTeams, teams) => {
        const res = await putOver(storedTeams, teams)

        expect(res.statusCode).toEqual(200)
        expect(mockPublishPublicStartList).toHaveBeenCalledWith('existing')
      })

      it.each([
        ['the same teams', [team], [{ ...team, registrationIds: ['a', 'b'] }]],
        ['no teams over none stored', undefined, []],
      ])('publishes nothing for %s', async (_name, storedTeams, teams) => {
        const res = await putOver(storedTeams, teams)

        expect(res.statusCode).toEqual(200)
        expect(mockPublishPublicStartList).not.toHaveBeenCalled()
      })

      it('publishes a team moved to another series (KOE-1720)', async () => {
        const res = await putOver([{ ...team, seriesId: 'open' }], [{ ...team, seriesId: 'breed' }], {
          series: [
            { id: 'open', name: { fi: 'Avoin' } },
            { id: 'breed', name: { fi: 'Rotu' } },
          ],
        })

        expect(res.statusCode).toEqual(200)
        expect(mockPublishPublicStartList).toHaveBeenCalledWith('existing')
      })

      it('publishes a change of the counted days, and nothing for a renamed series (KOE-1720)', async () => {
        const series = [{ id: 'open', name: { fi: 'Avoin' } }]
        signIn(mockSecretary)
        getEventMock.mockResolvedValueOnce({ ...mockEvent, teamCompetition: { series }, teams: [team] })

        const renamed = await putEventLambda(
          constructAPIGwEvent(
            { id: 'existing', teamCompetition: { series: [{ id: 'open', name: { fi: 'Uusi' } }] } },
            { method: 'PATCH' }
          )
        )

        expect(renamed.statusCode).toEqual(200)
        expect(mockPublishPublicStartList).not.toHaveBeenCalled()

        signIn(mockSecretary)
        getEventMock.mockResolvedValueOnce({ ...mockEvent, teamCompetition: { series }, teams: [team] })

        const days = await putEventLambda(
          constructAPIGwEvent({ id: 'existing', teamCompetition: { days: ['2025-06-01'] } }, { method: 'PATCH' })
        )

        expect(days.statusCode).toEqual(200)
        expect(mockPublishPublicStartList).toHaveBeenCalledWith('existing')
      })

      it('publishes nothing for a save that does not carry the teams', async () => {
        signIn(mockSecretary)
        getEventMock.mockResolvedValueOnce({ ...mockEvent, teams: [team] })

        const res = await putEventLambda(
          constructAPIGwEvent({ id: 'existing', name: 'Uusi nimi' }, { method: 'PATCH' })
        )

        expect(res.statusCode).toEqual(200)
        expect(mockPublishPublicStartList).not.toHaveBeenCalled()
      })
    })
  })

  describe('the payment terms once the event has registrations (KOE-1568)', () => {
    const earlyBird = { earlyBird: { cost: 30, days: 7 }, normal: 40 }
    const priced: JsonDogEvent = {
      ...mockEvent,
      cost: { normal: 40 },
      costMember: { normal: 35 },
      entryStartDate: '2025-04-01',
      paymentTime: 'registration',
    }
    const ready = { id: 'a', state: 'ready' }

    // A value queued for a read that never came must not answer this block's reads.
    beforeEach(() => mockReadEventRegistrations.mockReset())

    const put = async (stored: JsonDogEvent, change: Partial<JsonDogEvent>, method: 'PATCH' | 'PUT' = 'PUT') => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce(stored)
      return putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', ...change }, { method }))
    }

    it.each<[string, Partial<JsonDogEvent>]>([
      ['the price', { cost: { normal: 45 } }],
      ['the member price', { costMember: { normal: 30 } }],
      ['a breed price', { cost: { breed: { '110': 30 }, normal: 40 } }],
      ['an optional cost', { cost: { normal: 40, optionalAdditionalCosts: [{ cost: 5, description: { fi: 'x' } }] } }],
      ['the payment time', { paymentTime: 'confirmation' }],
    ])('refuses a change to %s', async (_name, change) => {
      mockReadEventRegistrations.mockResolvedValue([ready])

      const res = await put(priced, change)

      expect(res.statusCode).toEqual(409)
      expect(JSON.parse(res.body)).toMatchObject({ error: 'paymentLocked' })
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('refuses a change through PATCH too', async () => {
      mockReadEventRegistrations.mockResolvedValue([ready])

      const res = await put(priced, { cost: { normal: 45 } }, 'PATCH')

      expect(res.statusCode).toEqual(409)
      expect(mockReadEventRegistrations).toHaveBeenCalledWith('existing')
    })

    it('counts a cancelled registration, which can be put back into a class', async () => {
      mockReadEventRegistrations.mockResolvedValue([{ ...ready, cancelled: true }])

      const res = await put(priced, { cost: { normal: 45 } })

      expect(res.statusCode).toEqual(409)
    })

    it.each<[string, JsonDogEvent, Partial<JsonDogEvent>]>([
      ['the same price as a new object', priced, { cost: { normal: 40 }, costMember: { normal: 35 } }],
      ['a stored number as the same price object', { ...priced, cost: 40 }, { cost: { normal: 40 } }],
      [
        'the default payment time on an event without one',
        { ...priced, paymentTime: undefined },
        { paymentTime: 'registration' },
      ],
      ['an unrelated field', priced, { name: 'renamed' }],
      ['the entry start without an early-bird price', priced, { entryStartDate: '2025-04-03' }],
      [
        'the same entry start as the instant a browser loaded before KOE-1547 sends',
        { ...priced, cost: earlyBird },
        { entryStartDate: legacyDayValue('2025-03-31T21:00:00.000Z') },
      ],
      [
        'the key of an entry start a row not yet migrated holds as an instant',
        { ...priced, cost: earlyBird, entryStartDate: legacyDayValue('2025-03-31T21:00:00.000Z') },
        { entryStartDate: '2025-04-01' },
      ],
      [
        'a moved entry start when the early-bird rate counts no days',
        { ...priced, cost: { earlyBird: { cost: 30, days: 0 }, normal: 40 } },
        { entryStartDate: '2025-04-03' },
      ],
      [
        'a new entry end beside a legacy bare-day entry start',
        { ...priced, cost: earlyBird, entryStartDate: '2025-04-01' },
        { entryEndDate: '2025-05-20' },
      ],
    ])('accepts %s', async (_name, stored, change) => {
      mockReadEventRegistrations.mockResolvedValue([ready])

      const res = await put(stored, change)

      expect(res.statusCode).toEqual(200)
      expect(patchEventMock).toHaveBeenCalled()
    })

    it.each<[string, Partial<JsonDogEvent>]>([
      ['the price', { cost: earlyBird }],
      ['the member price', { costMember: earlyBird }],
    ])('refuses moving the entry start when %s has an early-bird rate', async (_name, terms) => {
      mockReadEventRegistrations.mockResolvedValue([ready])

      const res = await put({ ...priced, ...terms }, { entryStartDate: '2025-04-03' })

      expect(res.statusCode).toEqual(409)
      expect(JSON.parse(res.body)).toMatchObject({ error: 'paymentLocked' })
    })

    it.each<[string, Array<Record<string, unknown>>]>([
      ['no registrations', []],
      ['only registrations still waiting for their payment', [{ id: 'a', state: 'creating' }]],
    ])('accepts a change when the event has %s', async (_name, registrations) => {
      mockReadEventRegistrations.mockResolvedValue(registrations)

      const res = await put(
        { ...priced, cost: earlyBird },
        {
          cost: { normal: 45 },
          entryStartDate: '2025-04-03',
          paymentTime: 'confirmation',
        }
      )

      expect(res.statusCode).toEqual(200)
    })

    it('does not read the registrations when the terms stay as they were', async () => {
      await put(priced, { name: 'renamed' })

      expect(mockReadEventRegistrations).not.toHaveBeenCalled()
    })
  })

  describe('the official type an unofficial trial follows (KOE-1718)', () => {
    const unofficial: JsonDogEvent = { ...mockEvent, eventType: 'NOU-harjoitus', officialFormat: 'NOU' }
    const ready = { id: 'a', state: 'ready' }
    const resulted = {
      ...ready,
      eventResult: { result: 'NOU1', updatedAt: '2025-06-01T10:00:00.000Z', updatedBy: 'Test User' },
    }
    /** A span the post's link recorded: the live timeline is on the event itself. */
    const turned: JsonDogEvent = {
      ...unofficial,
      turns: [
        { dogs: [], id: 'turn-1', registrationIds: ['a'], startedAt: '2025-06-01T09:00:00.000Z', stationId: '1' },
      ],
    }

    beforeEach(() => mockReadEventRegistrations.mockReset())

    const put = async (stored: JsonDogEvent, change: Patch<JsonDogEvent>, method: 'PATCH' | 'PUT' = 'PATCH') => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce(stored)
      return putEventLambda(constructAPIGwEvent<Patch<JsonDogEvent>>({ id: 'existing', ...change }, { method }))
    }

    it.each<[string, Patch<JsonDogEvent>]>([
      ['changes', { officialFormat: 'NOME-A' }],
      ['clears', { officialFormat: null }],
    ])('saves a request that %s it while no result or turn is saved', async (_name, change) => {
      mockReadEventRegistrations.mockResolvedValue([ready])

      const res = await put(unofficial, change)

      expect(res.statusCode).toEqual(200)
      expect(patchEventMock).toHaveBeenCalled()
    })

    it.each<[string, Patch<JsonDogEvent>, 'PATCH' | 'PUT']>([
      ['a change', { officialFormat: 'NOME-A' }, 'PATCH'],
      ['clearing it', { officialFormat: null }, 'PATCH'],
      ['a whole event with another one', { ...unofficial, officialFormat: 'NOME-A' }, 'PUT'],
    ])('refuses %s once a result is saved', async (_name, change, method) => {
      mockReadEventRegistrations.mockResolvedValue([resulted])

      const res = await put(unofficial, change, method)

      expect(res.statusCode).toEqual(409)
      expect(JSON.parse(res.body)).toMatchObject({ error: 'officialFormatLocked' })
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('refuses a change once a post has recorded a turn, without reading the registrations', async () => {
      const res = await put(turned, { officialFormat: 'NOME-A' })

      expect(res.statusCode).toEqual(409)
      expect(JSON.parse(res.body)).toMatchObject({ error: 'officialFormatLocked' })
      expect(mockReadEventRegistrations).not.toHaveBeenCalled()
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('saves a request repeating the stored type once a result is saved', async () => {
      mockReadEventRegistrations.mockResolvedValue([resulted])

      const res = await put(unofficial, { name: 'renamed', officialFormat: 'NOU' })

      expect(res.statusCode).toEqual(200)
    })

    it('refuses one on an official event type', async () => {
      const res = await put({ ...mockEvent, eventType: 'NOME-B' }, { officialFormat: 'NOU' })

      expect(res.statusCode).toEqual(400)
      expect(JSON.parse(res.body)).toMatchObject({ error: 'officialFormatOnOfficialType' })
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('refuses a value that is none of the four types', async () => {
      signIn(mockSecretary)
      getEventMock.mockResolvedValueOnce(unofficial)

      // A body as a browser could send it, outside the types.
      const res = await putEventLambda(
        constructAPIGwEvent({ id: 'existing', officialFormat: 'harjoitus' }, { method: 'PATCH' })
      )

      expect(res.statusCode).toEqual(400)
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('refuses NOWT on an event whose stored rotation groups do not fit its posts', async () => {
      mockReadEventRegistrations.mockResolvedValue([])

      const res = await put(
        {
          ...mockEvent,
          eventType: 'WT-harjoitus',
          rotations: [{ class: 'ALO', exercises: [{ stationId: 'post-1' }, { stationId: 'gone' }] }],
          stations: [{ date: '2025-06-01', id: 'post-1', number: 1 }],
        },
        { officialFormat: 'NOWT' }
      )

      expect(res.statusCode).toEqual(400)
      expect(JSON.parse(res.body)).toMatchObject({
        error: 'invalidRotation',
        errors: [{ group: 0, kind: 'unknownPost', stationId: 'gone' }],
      })
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    // The entries keep the class they were made in, so the classes come and go only while there are none.
    it.each<[string, JsonDogEvent, Patch<JsonDogEvent>]>([
      [
        'gives a classless trial classes',
        { ...mockEvent, entries: 2, eventType: 'NOU-harjoitus' },
        { officialFormat: 'NOWT' },
      ],
      [
        'takes the classes of a trial away',
        { ...mockEvent, classes: [{ class: 'ALO', date: '2025-06-01' }], entries: 2, eventType: 'WT-harjoitus' },
        { officialFormat: 'NOU' },
      ],
      [
        'stops following the type that gave it classes',
        { ...unofficial, entries: 2, officialFormat: 'NOWT' },
        { officialFormat: null },
      ],
    ])('refuses a change that %s once the event has entries', async (_name, stored, change) => {
      mockReadEventRegistrations.mockResolvedValue([ready])

      const res = await put(stored, change)

      expect(res.statusCode).toEqual(409)
      expect(JSON.parse(res.body)).toMatchObject({ error: 'officialFormatClassShape' })
      expect(patchEventMock).not.toHaveBeenCalled()
      expect(repairReadyRegistrationGroupsMock).not.toHaveBeenCalled()
    })

    it('saves a change that gives a classless trial classes while it has no entries', async () => {
      mockReadEventRegistrations.mockResolvedValue([])

      const res = await put({ ...mockEvent, eventType: 'NOU-harjoitus' }, { officialFormat: 'NOWT' })

      expect(res.statusCode).toEqual(200)
    })

    it('moves what a classless trial keeps under its key to the key of the type it now follows', async () => {
      mockReadEventRegistrations.mockResolvedValue([ready])
      const uploadedAt = '2025-05-01T10:00:00.000Z'
      const stored: JsonDogEvent = {
        ...mockEvent,
        entries: 2,
        eventType: 'NOU-harjoitus',
        invitationAttachmentHistory: {
          'class-key': { className: 'NOU-harjoitus', uploadedAt },
          'common-key': { uploadedAt },
        },
        invitationAttachments: { 'NOU-harjoitus': 'class-key' },
        startNumberLinkVersions: { 'NOU-harjoitus': 3 },
      }

      const res = await put(stored, { officialFormat: 'NOU' })

      expect(res.statusCode).toEqual(200)
      expect(patchEventMock).toHaveBeenCalledWith(
        'existing',
        expect.anything(),
        expect.objectContaining({
          invitationAttachmentHistory: {
            'class-key': { className: 'NOU', uploadedAt },
            'common-key': { uploadedAt },
          },
          invitationAttachments: { NOU: 'class-key' },
          officialFormat: 'NOU',
          startNumberLinkVersions: { NOU: 3 },
        })
      )
    })

    it('numbers the reserves anew when the trial starts or stops sharing one reserve list', async () => {
      mockReadEventRegistrations.mockResolvedValue([ready])
      const stored: JsonDogEvent = {
        ...mockEvent,
        classes: [{ class: 'ALO', date: '2025-06-01' }],
        entries: 2,
        eventType: 'WT-harjoitus',
      }

      const res = await put(stored, { officialFormat: 'NOWT' })

      expect(res.statusCode).toEqual(200)
      expect(repairReadyRegistrationGroupsMock).toHaveBeenCalledWith(
        'existing',
        expect.objectContaining({ eventType: 'WT-harjoitus', officialFormat: 'NOWT' }),
        mockSecretary
      )
    })

    it('neither moves keys nor numbers anew when the type followed stays', async () => {
      const stored: JsonDogEvent = {
        ...unofficial,
        startNumberLinkVersions: { NOU: 2 },
      }

      const res = await put(stored, { name: 'renamed' })

      expect(res.statusCode).toEqual(200)
      expect(repairReadyRegistrationGroupsMock).not.toHaveBeenCalled()
      expect(mockReadEventRegistrations).not.toHaveBeenCalled()
      expect(patchEventMock).toHaveBeenCalledWith(
        'existing',
        expect.anything(),
        expect.objectContaining({ startNumberLinkVersions: { NOU: 2 } })
      )
    })
  })

  describe('the stored results when the posts change (KOE-1666)', () => {
    const day = '2025-06-01'
    const judge = { id: 1000001, name: 'Pääty Tuomari' }
    const posts: EventStation[] = [
      { date: day, id: 'post-1', judges: [judge], number: 1 },
      { date: day, id: 'post-2', judges: [judge], number: 2 },
    ]
    /** ALO's running order, by post id. */
    const alo = (...ids: string[]): EventRotationGroup => ({
      class: 'ALO',
      exercises: ids.map((stationId) => ({ stationId })),
    })
    // Two exercises at the first post, then one at the second.
    const twoAtFirst = [alo('post-1', 'post-1', 'post-2')]
    // The second post's exercise taken out: its score goes, the first post's two stay where they were.
    const firstOnly = [alo('post-1', 'post-1')]
    const nowtEvent: JsonConfirmedEvent = {
      ...mockEvent,
      classes: [{ class: 'ALO', date: day }],
      entryEndDate: '2025-05-15',
      entryStartDate: '2025-05-01',
      eventType: 'NOWT',
      judges: [judge],
      kcGuid: '2b81e6a1-559b-407c-87c7-b8a9b89b1987',
      rotations: twoAtFirst,
      state: 'confirmed',
      stations: posts,
    }
    const [participant] = jsonRegistrationsToEventWithParticipantsInvited
    const dogAt = (id: string, number: number): JsonRegistration => ({
      ...participant,
      cancelled: false,
      class: 'ALO',
      dog: { ...participant.dog, name: `Koira ${id}`, regNo: `FI${number}/21` },
      eventId: 'existing',
      eventType: 'NOWT',
      group: { date: day, key: `${day}-ap`, number },
      id,
    })
    const scores = (post1: [number, number], post2: number) => [
      { exercise: 1, judge, part: 0, points: post1[0] },
      { exercise: 2, judge, part: 0, points: post1[1] },
      { exercise: 3, judge, part: 0, points: post2 },
    ]
    const handedOverState = { code: KC_STATE_HANDED_OVER, name: 'Luovutettu', readAt: '2025-03-22T10:00:00.000Z' }
    const stored = () => [...storedRegistrations.values()]
    const eventResultOf = (id: string) => storedRegistrations.get(id)?.eventResult

    /** What the results table shows for a dog: its scores read against the event's posts as they are now. */
    const shownResult = (event: JsonConfirmedEvent, registration: JsonRegistration): JsonEventResult => {
      const result = registration.eventResult
      const scored = toScoredTasks(dogRound(event, rotationDogOf(registration)), result?.tasks)
      const code = deriveNowtResult({ tasks: scored })
      const { maxPoints, percentage, points } = nowtTotals(scored)
      return {
        ...(result ?? { updatedAt: '', updatedBy: '' }),
        maxPoints,
        percentage,
        points,
        ...(code ? { result: formatEventResult(code, event.eventType, registration.class ?? undefined) } : {}),
      }
    }
    const kcSent = (registrations: JsonRegistration[], event: JsonConfirmedEvent) => {
      const placements = placementsFor(registrations, event)
      return registrations.map((registration) => {
        const outcome = buildKcResult(event, registration, koemuotoNOWT, placements.get(registration.id))
        if (!outcome.ok) throw new Error(`not sendable: ${outcome.problems.map((p) => p.code).join(',')}`)
        return { pisteet: outcome.body.pisteet, sijoitus: outcome.body.sijoitus, tulos: outcome.body.tulos }
      })
    }

    /** Scores the dogs through the result save, against the event as it stands. */
    const record = async (event: JsonConfirmedEvent, results: Record<string, SubmittedTask[]>) => {
      getEventMock.mockResolvedValue(event)
      await processResultSubmissions(
        'existing',
        event,
        stored(),
        Object.entries(results).map(([id, tasks]) => ({ eventResult: { tasks }, id })),
        'Sihteeri'
      )
      // The tests count the writes the event save makes; these were the result save's.
      mockWriteEventResult.mockClear()
    }
    const patchStations = (stations: EventStation[], query?: Record<string, string>) => {
      signIn(mockSecretary)
      const request = constructAPIGwEvent({ id: 'existing', stations }, { method: 'PATCH' })
      return putEventLambda(query ? { ...request, queryStringParameters: query } : request)
    }
    const patchRotations = (rotations: EventRotationGroup[], query?: Record<string, string>) => {
      signIn(mockSecretary)
      const request = constructAPIGwEvent({ id: 'existing', rotations }, { method: 'PATCH' })
      return putEventLambda(query ? { ...request, queryStringParameters: query } : request)
    }

    beforeEach(() => {
      storedRegistrations.clear()
      for (const registration of [dogAt('dog-a', 1), dogAt('dog-b', 2)]) {
        storedRegistrations.set(registration.id, registration)
      }
      mockReadEventRegistrations.mockImplementation(async () => stored())
    })

    it('asks before dropping recorded scores, then recomputes so placement and the sending match the table', async () => {
      // Two exercises at the first post, one at the second: A 8 + 12 + 20 = 40/60 (66.7 %, so ALO2),
      // B 12 + 12 + 12 = 36/60 (60 %, ALO3). A places first.
      await record(nowtEvent, { 'dog-a': scores([8, 12], 20), 'dog-b': scores([12, 12], 12) })
      expect(placementsFor(stored(), nowtEvent)).toEqual(
        new Map([
          ['dog-a', 1],
          ['dog-b', 2],
        ])
      )

      // The second post's exercise is taken out: its score goes, so the secretary is asked first.
      const asked = await patchRotations(firstOnly)
      expect(asked.statusCode).toEqual(409)
      const body = JSON.parse(asked.body)
      expect(body).toEqual({
        confirmation: expect.any(String),
        dogs: [
          { class: 'ALO', id: 'dog-a', name: 'Koira dog-a', number: 1, tasks: 1 },
          { class: 'ALO', id: 'dog-b', name: 'Koira dog-b', number: 2, tasks: 1 },
        ],
        error: 'resultTasksDropped',
      })
      expect(isResultTasksDroppedBody(body)).toEqual(true)
      expect(patchEventMock).not.toHaveBeenCalled()
      expect(eventResultOf('dog-a')?.result).toEqual('ALO2')

      // Confirmed: A 8 + 12 = 20/40 (50 %), B 12 + 12 = 24/40 (60 %). B now places first.
      const res = await patchRotations(firstOnly, { confirmDrops: body.confirmation })
      expect(res.statusCode).toEqual(200)

      const changed: JsonConfirmedEvent = { ...nowtEvent, rotations: firstOnly }
      const shown = stored().map((registration) => ({
        ...registration,
        eventResult: shownResult(changed, registration),
      }))

      expect(stored().map((registration) => registration.eventResult?.result)).toEqual(['ALO3', 'ALO3'])
      // Exercises 1 and 2, both at the first post, keep their scores (KOE-1665).
      expect(eventResultOf('dog-a')?.tasks?.map((task) => task.exercise)).toEqual([1, 2])
      expect(placementsFor(stored(), nowtEvent)).toEqual(placementsFor(shown, nowtEvent))
      expect(placementsFor(stored(), nowtEvent).get('dog-b')).toEqual(1)
      expect(kcSent(stored(), changed)).toEqual(kcSent(shown, changed))
      expect(eventResultOf('dog-a')).toMatchObject({ updatedAt: '2025-03-22T10:45:33.000Z', updatedBy: 'Test User' })
      expect(auditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          messageKey: 'audit.messages.resultRecomputedDropped',
          messageParams: { dropped: 1, result: 'ALO3, 20/40 p' },
        })
      )
      expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
        'existing',
        expect.arrayContaining([expect.objectContaining({ id: 'dog-a' })]),
        'org-id'
      )
      expect(mockPublishPublicStartList).toHaveBeenCalledWith('existing')
    })

    it('asks again when the confirmation is not of the drops the change makes now', async () => {
      await record(nowtEvent, { 'dog-a': scores([10, 20], 10) })

      const res = await patchRotations(firstOnly, { confirmDrops: 'a confirmation of something else' })

      expect(res.statusCode).toEqual(409)
      expect(JSON.parse(res.body)).toMatchObject({ dogs: [{ id: 'dog-a', tasks: 1 }], error: 'resultTasksDropped' })
      expect(mockWriteEventResult).not.toHaveBeenCalled()
    })

    it('recomputes without asking where nothing is dropped, and the patch removes a prize the round no longer has', async () => {
      const event = { ...nowtEvent, rotations: [alo('post-1')] }
      getEventMock.mockResolvedValue(event)
      await record(event, { 'dog-a': [{ exercise: 1, judge, part: 0, points: 15 }] })
      const before = storedRegistrations.get('dog-a')
      expect(before?.eventResult?.result).toEqual('ALO2')

      let sent: Patch<JsonRegistration>[] = []
      mockPublishRegistrationPatches.mockImplementationOnce(async (_eventId, patches: Patch<JsonRegistration>[]) => {
        sent = patches
      })

      // An exercise at the second post: nothing recorded there yet, so the round is incomplete.
      const res = await patchRotations([alo('post-1', 'post-2')])

      expect(res.statusCode).toEqual(200)
      const after = eventResultOf('dog-a')
      expect(after).not.toHaveProperty('result')
      expect(after).toMatchObject({ maxPoints: 40, points: 15 })
      expect(patchMerge(before ?? {}, sent[0])).toEqual(storedRegistrations.get('dog-a'))
    })

    it.each<[string, EventStation[], EventStation[], number]>([
      ['parts 1 to 2', [posts[0]], [{ ...posts[0], parts: 2 }], 1],
      ['parts 2 to 1', [{ ...posts[0], parts: 2 }], [posts[0]], 1],
    ])('drops the scores of an exercise whose slots mean another thing after %s', async (_name, from, to, dropped) => {
      const event = { ...nowtEvent, rotations: [alo('post-1')], stations: from }
      const recorded = dogRound(event, rotationDogOf(dogAt('dog-a', 1))).map((slot) => ({
        exercise: slot.exercise,
        judge,
        part: slot.part,
        points: slot.maxPoints - 2,
      }))
      await record(event, { 'dog-a': recorded })

      const res = await patchStations(to)

      expect(res.statusCode).toEqual(409)
      expect(JSON.parse(res.body)).toMatchObject({ dogs: [{ id: 'dog-a', tasks: dropped }] })
    })

    it('keeps the scores of an exercise when its post gets a second exercise after it (KOE-1665)', async () => {
      const split: EventStation[] = [{ ...posts[0], parts: 2 }]
      const event = { ...nowtEvent, rotations: [alo('post-1')], stations: split }
      await record(event, {
        'dog-a': [
          { exercise: 1, judge, part: 0, points: 9 },
          { exercise: 1, judge, part: 1, points: 8 },
        ],
      })

      const res = await patchRotations([alo('post-1', 'post-1')])

      // Exercise 1 stays split the same way, so its scores stay; exercise 2 is not scored yet.
      expect(res.statusCode).toEqual(200)
      expect(eventResultOf('dog-a')).toMatchObject({ maxPoints: 40, points: 17 })
      expect(eventResultOf('dog-a')).not.toHaveProperty('result')
    })

    it('reads no registration for a change no round reads, such as a post judge', async () => {
      getEventMock.mockResolvedValue({ ...nowtEvent, kcState: handedOverState })

      const res = await patchStations([{ ...posts[0], judges: [] }, posts[1]])

      expect(res.statusCode).toEqual(200)
      expect(mockReadEventRegistrations).not.toHaveBeenCalled()
    })

    it('reads no registration when only the dogs a post takes at once change (KOE-1665)', async () => {
      getEventMock.mockResolvedValue({ ...nowtEvent, kcState: handedOverState })

      const res = await patchStations([{ ...posts[0], dogsAtOnce: 2 }, posts[1]])

      expect(res.statusCode).toEqual(200)
      expect(mockReadEventRegistrations).not.toHaveBeenCalled()
    })

    it('refuses a change that would alter a result of a trial handed to the judge, and writes nothing', async () => {
      await record(nowtEvent, { 'dog-a': scores([10, 20], 10) })
      getEventMock.mockResolvedValue({ ...nowtEvent, kcState: handedOverState })

      const res = await patchRotations(firstOnly)

      expect(res.statusCode).toEqual(423)
      expect(JSON.parse(res.body)).toEqual({ error: 'resultsLocked' })
      expect(mockWriteEventResult).not.toHaveBeenCalled()
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('stops at the dog where the trial was handed over while the results were written', async () => {
      await record(nowtEvent, { 'dog-a': scores([10, 20], 10), 'dog-b': scores([12, 12], 12) })
      const asked = JSON.parse((await patchRotations(firstOnly)).body)
      const handedOver = { ...nowtEvent, kcState: handedOverState }
      // The save's own read, the check before the writes and the first dog's find it open; the second dog's does not.
      getEventMock
        .mockResolvedValueOnce(nowtEvent)
        .mockResolvedValueOnce(nowtEvent)
        .mockResolvedValueOnce(nowtEvent)
        .mockResolvedValue(handedOver)

      const res = await patchRotations(firstOnly, { confirmDrops: asked.confirmation })

      expect(res.statusCode).toEqual(423)
      expect(mockWriteEventResult).toHaveBeenCalledTimes(1)
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('saves a handed-over trial a change that leaves every result as it is', async () => {
      getEventMock.mockResolvedValue({ ...nowtEvent, kcState: handedOverState })

      // No dog has a result yet, so the change has nothing to recompute.
      const res = await patchRotations(firstOnly)

      expect(res.statusCode).toEqual(200)
      expect(patchEventMock).toHaveBeenCalled()
    })

    it('leaves a type judged as a whole alone', async () => {
      getEventMock.mockResolvedValue({ ...nowtEvent, eventType: 'NOME-B' })

      const res = await patchRotations(firstOnly)

      expect(res.statusCode).toEqual(200)
      expect(mockReadEventRegistrations).not.toHaveBeenCalled()
    })

    it('stops before the event is saved when a post saved the dog meanwhile', async () => {
      await record(nowtEvent, { 'dog-a': scores([10, 20], 10), 'dog-b': scores([12, 12], 12) })
      const asked = JSON.parse((await patchRotations(firstOnly)).body)
      mockWriteEventResult.mockRejectedValueOnce(conditionalCheckFailure())

      const res = await patchRotations(firstOnly, { confirmDrops: asked.confirmation })

      expect(res.statusCode).toEqual(409)
      expect(JSON.parse(res.body)).toMatchObject({ error: 'staleData' })
      expect(mockWriteEventResult).toHaveBeenCalledTimes(1)
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('fails the save, not as stale, when the write fails for another reason', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await record(nowtEvent, { 'dog-a': scores([10, 20], 10), 'dog-b': scores([12, 12], 12) })
      const asked = JSON.parse((await patchRotations(firstOnly)).body)
      mockWriteEventResult.mockRejectedValueOnce(new Error('throttled'))

      const res = await patchRotations(firstOnly, { confirmDrops: asked.confirmation })

      expect(res.statusCode).toEqual(500)
      expect(patchEventMock).not.toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('recomputes without asking where the task dropped is an empty field', async () => {
      await record(nowtEvent, {
        'dog-a': [
          { exercise: 1, judge, part: 0, points: 10 },
          { exercise: 2, judge, part: 0, points: 10 },
          { exercise: 3, judge, part: 0, points: null },
        ],
      })

      const res = await patchRotations(firstOnly)

      expect(res.statusCode).toEqual(200)
      expect(eventResultOf('dog-a')).toMatchObject({ maxPoints: 40, points: 20, result: 'ALO3' })
      expect(eventResultOf('dog-a')?.tasks).toHaveLength(2)
      expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ messageKey: 'audit.messages.resultRecomputed' }))
    })

    it('recomputes a round that ended at a post the change removes from what the other posts earned', async () => {
      getEventMock.mockResolvedValue(nowtEvent)
      const retirement = { cause: 'handlerChoice', exercise: 3 } as const
      const tasks = [
        { exercise: 1, judge, part: 0, points: 10 },
        { exercise: 2, judge, part: 0, points: 8 },
      ]
      await processResultSubmissions(
        'existing',
        nowtEvent,
        stored(),
        [{ eventResult: { retirement, tasks }, id: 'dog-a' }],
        'Sihteeri'
      )
      expect(eventResultOf('dog-a')).toMatchObject({ maxPoints: 60, points: 18, result: 'ALO0' })

      // The third exercise leaves the running order: the round ended at an exercise it no longer has.
      const res = await patchRotations(firstOnly)

      expect(res.statusCode).toEqual(200)
      expect(eventResultOf('dog-a')).toMatchObject({ maxPoints: 40, points: 18, result: 'ALO0', retirement })
    })

    describe('four old-style posts corrected to the three the trial had (KOE-1665)', () => {
      // One exercise at each of four posts, in number order: how every production trial is laid out.
      const fourPosts: EventStation[] = [1, 2, 3, 4].map((number) => ({
        date: day,
        id: `post-${number}`,
        judges: [judge],
        number,
      }))
      const fourPostEvent: JsonConfirmedEvent = { ...nowtEvent, rotations: [], stations: fourPosts }
      // The truth: three posts, the third doing exercises 3 and 4.
      const corrected = { rotations: [alo('post-1', 'post-2', 'post-3', 'post-3')], stations: fourPosts.slice(0, 3) }

      it('asks nothing and writes nobody, locked or not: every dog keeps its exercises 1 to 4 and its prize', async () => {
        await record(fourPostEvent, {
          'dog-a': [15, 16, 17, 18].map((points, at) => ({ exercise: at + 1, judge, part: 0, points })),
        })
        const before = eventResultOf('dog-a')
        getEventMock.mockResolvedValue({ ...fourPostEvent, kcState: handedOverState })
        signIn(mockSecretary)

        const res = await putEventLambda(constructAPIGwEvent({ id: 'existing', ...corrected }, { method: 'PATCH' }))

        expect(res.statusCode).toEqual(200)
        expect(mockWriteEventResult).not.toHaveBeenCalled()
        expect(
          shownResult({ ...fourPostEvent, ...corrected }, storedRegistrations.get('dog-a') ?? dogAt('dog-a', 1))
        ).toMatchObject({
          maxPoints: before?.maxPoints,
          points: before?.points,
          result: before?.result,
        })
      })
    })

    describe('a running order', () => {
      // One exercise at the first post, two at the second.
      const rotated = { ...nowtEvent, rotations: [alo('post-1', 'post-2', 'post-2')] }
      const recorded = [
        { exercise: 1, judge, part: 0, points: 10 },
        { exercise: 2, judge, part: 0, points: 20 },
        { exercise: 3, judge, part: 0, points: 10 },
      ]

      it('recomputes the dogs when the group no longer does its last exercise, dropping only its score', async () => {
        await record(rotated, { 'dog-a': recorded })
        expect(eventResultOf('dog-a')).toMatchObject({ maxPoints: 60, points: 40 })

        // Exercise 3 leaves the running order; exercises 1 and 2 keep theirs (KOE-1665).
        const asked = await patchRotations([alo('post-1', 'post-2')])
        expect(asked.statusCode).toEqual(409)
        expect(JSON.parse(asked.body)).toMatchObject({ dogs: [{ id: 'dog-a', tasks: 1 }] })

        const res = await patchRotations([alo('post-1', 'post-2')], {
          confirmDrops: JSON.parse(asked.body).confirmation,
        })

        expect(res.statusCode).toEqual(200)
        expect(eventResultOf('dog-a')).toMatchObject({ maxPoints: 40, points: 30, result: 'ALO2' })
      })

      it("reads no registration when only the group's dogs at once at a post change", async () => {
        getEventMock.mockResolvedValue({ ...rotated, kcState: handedOverState })
        const pairs: EventRotationGroup = {
          class: 'ALO',
          exercises: ['post-1', 'post-2', 'post-2'].map((stationId) => ({ dogsAtOnce: 2, stationId })),
        }

        const res = await patchRotations([pairs])

        expect(res.statusCode).toEqual(200)
        expect(mockReadEventRegistrations).not.toHaveBeenCalled()
      })

      it('leaves the results alone when only the order of the posts changes', async () => {
        await record(rotated, { 'dog-a': recorded })
        const reordered = alo('post-2', 'post-2', 'post-1')

        const res = await patchRotations([reordered])

        expect(res.statusCode).toEqual(200)
        expect(mockWriteEventResult).not.toHaveBeenCalled()
      })

      it('recomputes the dogs of a class moved to another day, whose group is then no longer read', async () => {
        const twoClasses: JsonConfirmedEvent = {
          ...rotated,
          classes: [
            { class: 'ALO', date: day },
            { class: 'AVO', date: day },
          ],
        }
        await record(twoClasses, { 'dog-a': recorded })
        signIn(mockSecretary)

        const res = await putEventLambda(
          constructAPIGwEvent(
            {
              classes: [
                { class: 'ALO', date: '2025-06-02' },
                { class: 'AVO', date: day },
              ],
              id: 'existing',
            },
            { method: 'PATCH' }
          )
        )

        // The class does one exercise at each post again: two exercises, so the third one's score goes.
        expect(res.statusCode).toEqual(409)
        expect(JSON.parse(res.body)).toMatchObject({ dogs: [{ id: 'dog-a', tasks: 1 }], error: 'resultTasksDropped' })
      })
    })
  })
})
