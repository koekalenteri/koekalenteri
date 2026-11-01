import type { SubmittedTask } from '../../lib/results'
import type {
  EventRotationGroup,
  EventStation,
  JsonConfirmedEvent,
  JsonDogEvent,
  JsonEventResult,
  JsonRegistration,
  JsonUser,
  Patch,
} from '../../types'
import { vi } from 'vitest'
import { jsonRegistrationsToEventWithParticipantsInvited } from '../../__mockData__/registrations'
import { legacyDayValue } from '../../test-utils/finnishDays'
import koemuotoNOWT from '../lib/KLIntegraatio-fixtures/koemuoto-NOWT.json'
import { constructAPIGwEvent } from '../test-utils/helpers'
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
  saveEvent: vi.fn(),
  updateRegistrations: vi.fn(),
}))

const mockReadEventRegistrations = vi.fn()
/**
 * The registration rows of the results tests (KOE-1666), as the table would hold them: the result save
 * and the event save write here, and the readers read back what was written.
 */
const storedRegistrations = new Map<string, JsonRegistration>()
const storeEventResult = (id: string, eventResult: JsonEventResult) => {
  const registration = storedRegistrations.get(id)
  if (registration) storedRegistrations.set(id, { ...registration, eventResult })
}
/** Writes over the result it was recomputed from only, as the repository's condition does. */
const mockWriteRecomputedEventResult = vi.fn(
  async (_eventId: string, id: string, eventResult: JsonEventResult, previousUpdatedAt: string) => {
    if (storedRegistrations.get(id)?.eventResult?.updatedAt !== previousUpdatedAt) return false
    storeEventResult(id, eventResult)
    return true
  }
)
vi.doMock('../lib/repositories/registrationRepository', () => ({
  readEventRegistrations: mockReadEventRegistrations,
  updateRegistrationField: vi.fn(async (_eventId: string, id: string, field: string, value: JsonEventResult) => {
    if (field === 'eventResult') storeEventResult(id, value)
  }),
  writeRecomputedEventResult: mockWriteRecomputedEventResult,
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

const mockReadOrganizerEventStatsRow = vi.fn()
const mockMoveOrganizerEventStatsRow = vi.fn()
// Whether the row moves is the repository's pure key comparison, and how it is retried its policy,
// both run as they are.
vi.doMock('../lib/repositories/eventStatsRepository', async () => {
  const actual = await vi.importActual<typeof import('../lib/repositories/eventStatsRepository')>(
    '../lib/repositories/eventStatsRepository'
  )
  return {
    isSameOrganizerStatsRow: actual.isSameOrganizerStatsRow,
    moveOrganizerEventStatsRow: mockMoveOrganizerEventStatsRow,
    ORGANIZER_STATS_MOVE_RETRY: actual.ORGANIZER_STATS_MOVE_RETRY,
    readOrganizerEventStatsRow: mockReadOrganizerEventStatsRow,
  }
})

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
  saveEvent,
  updateRegistrations,
} = await import('../lib/event')
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
const {
  deriveNowtResult,
  dogRound,
  formatEventResult,
  isResultTasksDroppedBody,
  nowtTotals,
  placementsFor,
  toScoredTasks,
} = await import('../../lib/results')
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
        stations: [{ date: '2026-09-12', id: 'post-1', number: 1 }],
      })

      const res = await putEventLambda(
        constructAPIGwEvent(
          { id: 'existing', rotations: [{ class: 'ALO', posts: [{ stationId: 'post-1' }, { stationId: 'gone' }] }] },
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
        { date: '2026-09-12', id: 'post-1', number: 1 },
        { date: '2026-09-12', id: 'post-2', number: 2 },
      ]
      const rotations: EventRotationGroup[] = [
        { class: 'ALO', posts: [{ stationId: 'post-1' }, { stationId: 'post-2' }] },
      ]
      const stored = { ...mockEvent, rotations, stations: posts }

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
            rotations: [{ class: 'ALO', firstNumber: 9, lastNumber: 1, posts: [{ stationId: 'post-1' }] }],
            stations: posts,
          })
        )

        expect(res.statusCode).toEqual(400)
        expect(JSON.parse(res.body)).toMatchObject({ errors: [{ group: 0, kind: 'range' }] })
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
      // No organizer stats row can exist for an event that had no organizer to key it by.
      expect(mockReadOrganizerEventStatsRow).not.toHaveBeenCalled()
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
      { rotations: [{ class: 'ALO', posts: [{ stationId: 'post-1', taskCount: 0 }] }] },
      'rotations.0.posts.0.taskCount must be at least 1',
    ],
    [
      { rotations: [{ class: 'ALO', posts: [{ dogsAtOnce: 0, stationId: 'post-1' }] }] },
      'rotations.0.posts.0.dogsAtOnce must be at least 1',
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

  it('moves the organizer stats record when startDate changes', async () => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, season: '2024', startDate: '2024-06-15' })
    const stats = {
      count: 7,
      date: '2024-06-15',
      organizerId: mockEvent.organizer.id,
      PK: `ORG#${mockEvent.organizer.id}`,
      paidAmount: 350,
      SK: `2024-06-15T00:00:00.000Z#existing`,
    }
    mockReadOrganizerEventStatsRow.mockResolvedValueOnce(stats)

    await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', startDate: '2025-01-01' }))

    // The row of the event as stored is read, and its counters move onto the row of the new start
    // date in one transaction; the keys and the transaction are the repository test's.
    const stored = expect.objectContaining({
      id: 'existing',
      organizer: mockEvent.organizer,
      startDate: '2024-06-15',
    })
    expect(mockReadOrganizerEventStatsRow).toHaveBeenCalledWith(stored)
    expect(mockMoveOrganizerEventStatsRow).toHaveBeenCalledTimes(1)
    expect(mockMoveOrganizerEventStatsRow).toHaveBeenCalledWith(
      stored,
      expect.objectContaining({
        id: 'existing',
        organizer: mockEvent.organizer,
        startDate: '2025-01-01',
      }),
      stats,
      expect.any(String)
    )
  })

  it('does not touch the organizer stats record when the key is unchanged', async () => {
    signIn(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, season: '2024', startDate: '2024-06-15' })

    await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', name: 'Renamed but same dates' }))

    expect(mockReadOrganizerEventStatsRow).not.toHaveBeenCalled()
    expect(mockMoveOrganizerEventStatsRow).not.toHaveBeenCalled()
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
    // The organizer stats row is keyed by the start as stored, and moves to the key of its day.
    expect(mockReadOrganizerEventStatsRow).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: '2025-05-31T21:00:00.000Z' })
    )
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

  describe('the stored results when the posts change (KOE-1666)', () => {
    const day = '2025-06-01'
    const judge = { id: 1000001, name: 'Pääty Tuomari' }
    const posts: EventStation[] = [
      { date: day, id: 'post-1', judges: [judge], number: 1, taskCount: 2 },
      { date: day, id: 'post-2', judges: [judge], number: 2 },
    ]
    const nowtEvent: JsonConfirmedEvent = {
      ...mockEvent,
      classes: [{ class: 'ALO', date: day }],
      entryEndDate: '2025-05-15',
      entryStartDate: '2025-05-01',
      eventType: 'NOWT',
      judges: [judge],
      kcGuid: '2b81e6a1-559b-407c-87c7-b8a9b89b1987',
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
      { index: 0, judge, points: post1[0], stationId: 'post-1' },
      { index: 1, judge, points: post1[1], stationId: 'post-1' },
      { index: 0, judge, points: post2, stationId: 'post-2' },
    ]
    const handedOverState = { code: KC_STATE_HANDED_OVER, name: 'Luovutettu', readAt: '2025-03-22T10:00:00.000Z' }
    const onePost1Task: EventStation[] = [{ ...posts[0], taskCount: 1 }, posts[1]]
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
      const placements = placementsFor(registrations)
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
    }
    const patchStations = (stations: EventStation[], query?: Record<string, string>) => {
      signIn(mockSecretary)
      const request = constructAPIGwEvent({ id: 'existing', stations }, { method: 'PATCH' })
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
      // Two posts, the first with two tasks: A 10 + 20 + 10 = 40/60, B 12 + 12 + 12 = 36/60. A places first.
      await record(nowtEvent, { 'dog-a': scores([10, 20], 10), 'dog-b': scores([12, 12], 12) })
      expect(placementsFor(stored())).toEqual(
        new Map([
          ['dog-a', 1],
          ['dog-b', 2],
        ])
      )

      // The first post is made one task: its second task's score goes, so the secretary is asked first.
      const asked = await patchStations(onePost1Task)
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

      // Confirmed: A 10 + 10 = 20/40 (50 %), B 12 + 12 = 24/40 (60 %). B now places first.
      const res = await patchStations(onePost1Task, { confirmDrops: body.confirmation })
      expect(res.statusCode).toEqual(200)

      const changed: JsonConfirmedEvent = { ...nowtEvent, stations: onePost1Task }
      const shown = stored().map((registration) => ({
        ...registration,
        eventResult: shownResult(changed, registration),
      }))

      expect(stored().map((registration) => registration.eventResult?.result)).toEqual(['ALO3', 'ALO3'])
      expect(eventResultOf('dog-a')?.tasks?.map((task) => `${task.stationId}#${task.index}`)).toEqual([
        'post-1#0',
        'post-2#0',
      ])
      expect(placementsFor(stored())).toEqual(placementsFor(shown))
      expect(placementsFor(stored()).get('dog-b')).toEqual(1)
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

      const res = await patchStations(onePost1Task, { confirmDrops: 'a confirmation of something else' })

      expect(res.statusCode).toEqual(409)
      expect(JSON.parse(res.body)).toMatchObject({ dogs: [{ id: 'dog-a', tasks: 1 }], error: 'resultTasksDropped' })
      expect(mockWriteRecomputedEventResult).not.toHaveBeenCalled()
    })

    it('recomputes without asking where nothing is dropped, and the patch removes a prize the round no longer has', async () => {
      const onePerPost: EventStation[] = [{ ...posts[0], taskCount: 1 }, posts[1]]
      const event = { ...nowtEvent, stations: onePerPost }
      getEventMock.mockResolvedValue(event)
      await record(event, {
        'dog-a': [
          { index: 0, judge, points: 15, stationId: 'post-1' },
          { index: 0, judge, points: 15, stationId: 'post-2' },
        ],
      })
      const before = storedRegistrations.get('dog-a')
      expect(before?.eventResult?.result).toEqual('ALO2')

      let sent: Patch<JsonRegistration>[] = []
      mockPublishRegistrationPatches.mockImplementationOnce(async (_eventId, patches: Patch<JsonRegistration>[]) => {
        sent = patches
      })

      // A second task at the first post: nothing recorded there yet, so the round is incomplete.
      const res = await patchStations(posts)

      expect(res.statusCode).toEqual(200)
      const after = eventResultOf('dog-a')
      expect(after).not.toHaveProperty('result')
      expect(after).toMatchObject({ maxPoints: 60, points: 30 })
      expect(patchMerge(before ?? {}, sent[0])).toEqual(storedRegistrations.get('dog-a'))
    })

    it.each<[string, EventStation[], EventStation[], number]>([
      ['parts 1 to 2', [{ ...posts[0], taskCount: 1 }], [{ ...posts[0], parts: 2, taskCount: 1 }], 1],
      ['parts 2 to 1', [{ ...posts[0], parts: 2, taskCount: 1 }], [{ ...posts[0], taskCount: 1 }], 2],
    ])('drops a score whose slot means another task after %s', async (_name, from, to, dropped) => {
      const event = { ...nowtEvent, stations: from }
      const recorded = dogRound(event, rotationDogOf(dogAt('dog-a', 1))).map((slot) => ({
        index: slot.index,
        judge,
        points: slot.maxPoints - 2,
        stationId: slot.stationId,
      }))
      await record(event, { 'dog-a': recorded })

      const res = await patchStations(to)

      expect(res.statusCode).toEqual(409)
      expect(JSON.parse(res.body)).toMatchObject({ dogs: [{ id: 'dog-a', tasks: dropped }] })
    })

    it('keeps the scores of a split post given a second task, whose first task still means the same', async () => {
      const split: EventStation[] = [{ ...posts[0], parts: 2, taskCount: 1 }]
      const event = { ...nowtEvent, stations: split }
      await record(event, {
        'dog-a': [
          { index: 0, judge, points: 9, stationId: 'post-1' },
          { index: 1, judge, points: 8, stationId: 'post-1' },
        ],
      })

      const res = await patchStations([{ ...posts[0], parts: 2, taskCount: 2 }])

      expect(res.statusCode).toEqual(200)
      expect(eventResultOf('dog-a')?.tasks?.map((task) => task.points)).toEqual([9, 8])
      expect(eventResultOf('dog-a')).toMatchObject({ maxPoints: 40, points: 17 })
    })

    it('reads no registration for a change no round reads, such as a post judge', async () => {
      getEventMock.mockResolvedValue({ ...nowtEvent, kcState: handedOverState })

      const res = await patchStations([{ ...posts[0], judges: [] }, posts[1]])

      expect(res.statusCode).toEqual(200)
      expect(mockReadEventRegistrations).not.toHaveBeenCalled()
    })

    it('refuses a change that would alter a result of a trial handed to the judge, and writes nothing', async () => {
      await record(nowtEvent, { 'dog-a': scores([10, 20], 10) })
      getEventMock.mockResolvedValue({ ...nowtEvent, kcState: handedOverState })

      const res = await patchStations(onePost1Task)

      expect(res.statusCode).toEqual(423)
      expect(JSON.parse(res.body)).toEqual({ error: 'resultsLocked' })
      expect(mockWriteRecomputedEventResult).not.toHaveBeenCalled()
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('stops at the dog where the trial was handed over while the results were written', async () => {
      await record(nowtEvent, { 'dog-a': scores([10, 20], 10), 'dog-b': scores([12, 12], 12) })
      const asked = JSON.parse((await patchStations(onePost1Task)).body)
      const handedOver = { ...nowtEvent, kcState: handedOverState }
      // The save's own read, the check before the writes and the first dog's find it open; the second dog's does not.
      getEventMock
        .mockResolvedValueOnce(nowtEvent)
        .mockResolvedValueOnce(nowtEvent)
        .mockResolvedValueOnce(nowtEvent)
        .mockResolvedValue(handedOver)

      const res = await patchStations(onePost1Task, { confirmDrops: asked.confirmation })

      expect(res.statusCode).toEqual(423)
      expect(mockWriteRecomputedEventResult).toHaveBeenCalledTimes(1)
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('saves a handed-over trial a change that leaves every result as it is', async () => {
      getEventMock.mockResolvedValue({ ...nowtEvent, kcState: handedOverState })

      // No dog has a result yet, so the change has nothing to recompute.
      const res = await patchStations(onePost1Task)

      expect(res.statusCode).toEqual(200)
      expect(patchEventMock).toHaveBeenCalled()
    })

    it('leaves a type judged as a whole alone', async () => {
      getEventMock.mockResolvedValue({ ...nowtEvent, eventType: 'NOME-B' })

      const res = await patchStations(onePost1Task)

      expect(res.statusCode).toEqual(200)
      expect(mockReadEventRegistrations).not.toHaveBeenCalled()
    })

    it('stops before the event is saved when a post saved the dog meanwhile', async () => {
      await record(nowtEvent, { 'dog-a': scores([10, 20], 10), 'dog-b': scores([12, 12], 12) })
      const asked = JSON.parse((await patchStations(onePost1Task)).body)
      mockWriteRecomputedEventResult.mockResolvedValueOnce(false)

      const res = await patchStations(onePost1Task, { confirmDrops: asked.confirmation })

      expect(res.statusCode).toEqual(409)
      expect(JSON.parse(res.body)).toMatchObject({ error: 'staleData' })
      expect(mockWriteRecomputedEventResult).toHaveBeenCalledTimes(1)
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('recomputes without asking where the task dropped is an empty field', async () => {
      await record(nowtEvent, {
        'dog-a': [
          { index: 0, judge, points: 10, stationId: 'post-1' },
          { index: 1, judge, points: null, stationId: 'post-1' },
          { index: 0, judge, points: 10, stationId: 'post-2' },
        ],
      })

      const res = await patchStations(onePost1Task)

      expect(res.statusCode).toEqual(200)
      expect(eventResultOf('dog-a')).toMatchObject({ maxPoints: 40, points: 20, result: 'ALO3' })
      expect(eventResultOf('dog-a')?.tasks).toHaveLength(2)
      expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ messageKey: 'audit.messages.resultRecomputed' }))
    })

    it('asks about a dropped task without points that records a retirement', async () => {
      await record(nowtEvent, {
        'dog-a': [
          { index: 0, judge, points: 10, stationId: 'post-1' },
          { index: 1, judge, points: null, retired: true, stationId: 'post-1' },
        ],
      })

      const res = await patchStations(onePost1Task)

      expect(res.statusCode).toEqual(409)
      expect(JSON.parse(res.body)).toMatchObject({ dogs: [{ id: 'dog-a', tasks: 1 }] })
    })

    describe('a rotation group', () => {
      // Each post one task, but the class does two at the second post.
      const group = (secondPostTasks?: number): EventRotationGroup => ({
        class: 'ALO',
        posts: [
          { stationId: 'post-1' },
          { stationId: 'post-2', ...(secondPostTasks ? { taskCount: secondPostTasks } : {}) },
        ],
      })
      const rotated = { ...nowtEvent, rotations: [group(2)], stations: onePost1Task }
      const recorded = [
        { index: 0, judge, points: 10, stationId: 'post-1' },
        { index: 0, judge, points: 20, stationId: 'post-2' },
        { index: 1, judge, points: 10, stationId: 'post-2' },
      ]
      const patchRotations = (rotations: EventRotationGroup[], query?: Record<string, string>) => {
        signIn(mockSecretary)
        const request = constructAPIGwEvent({ id: 'existing', rotations }, { method: 'PATCH' })
        return putEventLambda(query ? { ...request, queryStringParameters: query } : request)
      }

      it('recomputes the dogs when the group no longer does two tasks at a post', async () => {
        await record(rotated, { 'dog-a': recorded })
        expect(eventResultOf('dog-a')).toMatchObject({ maxPoints: 60, points: 40 })

        const asked = await patchRotations([group()])
        expect(asked.statusCode).toEqual(409)
        expect(JSON.parse(asked.body)).toMatchObject({ dogs: [{ id: 'dog-a', tasks: 1 }] })

        const res = await patchRotations([group()], { confirmDrops: JSON.parse(asked.body).confirmation })

        expect(res.statusCode).toEqual(200)
        expect(eventResultOf('dog-a')).toMatchObject({ maxPoints: 40, points: 30, result: 'ALO2' })
      })

      it('leaves the results alone when only the order of the posts changes', async () => {
        await record(rotated, { 'dog-a': recorded })
        const reordered: EventRotationGroup = { ...group(2), posts: [...group(2).posts].reverse() }

        const res = await patchRotations([reordered])

        expect(res.statusCode).toEqual(200)
        expect(mockWriteRecomputedEventResult).not.toHaveBeenCalled()
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

        // The class goes round the day's posts in number order again, one task at each: a score goes.
        expect(res.statusCode).toEqual(409)
        expect(JSON.parse(res.body)).toMatchObject({ dogs: [{ id: 'dog-a', tasks: 1 }], error: 'resultTasksDropped' })
      })
    })
  })
})
