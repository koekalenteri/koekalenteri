import type { JsonDogEvent, JsonUser } from '../../types'
import { vi } from 'vitest'
import { expectConsoleOutput } from '../../test-utils/consoleGuard'
import { legacyDayValue } from '../../test-utils/finnishDays'
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
  authorize: vi.fn(),
}))

const mockGetEventAuditMessages = vi.fn()
vi.doMock('../lib/audit', () => ({
  audit: vi.fn(),
  eventAuditKey: vi.fn((event: Pick<JsonDogEvent, 'id'>) => `event:${event.id}`),
  getEventAuditMessages: mockGetEventAuditMessages,
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
vi.doMock('../lib/repositories/registrationRepository', () => ({
  readEventRegistrations: mockReadEventRegistrations,
}))

/** A dog picked into a group of the class, and invited: nothing left for the start list to wait on. */
const invitedParticipant = (eventClass?: string) => ({
  class: eventClass,
  eventType: '',
  group: { date: '2025-06-01', key: 'group-1', number: 1 },
  messagesSent: { invitation: true },
})

const mockPublishEventChange = vi.fn()
const mockPublishEventCounts = vi.fn()
vi.doMock('../lib/ws/actions', () => ({
  publishEventChange: mockPublishEventChange,
  publishEventCounts: mockPublishEventCounts,
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

const { authorize } = await import('../lib/auth')
const authorizeMock = authorize as import('vitest').Mock<typeof authorize>

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

const { default: putEventLambda } = await import('./handler')

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
    authorizeMock.mockResolvedValueOnce(null)

    const res = await putEventLambda(constructAPIGwEvent('test'))

    expect(res.statusCode).toEqual(401)
  })

  it('should return 403 if user does not have permissions to modify existing event', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, organizer: { id: 'no-access', name: 'some org' } })

    const res = await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ eventType: 'TEST', id: 'existing' }))

    expect(res.statusCode).toEqual(403)
  })

  it('should return 403 if user does not have to the updated org', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce(mockEvent)

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', organizer: { id: 'no-access', name: 'some org' } })
    )

    expect(res.statusCode).toEqual(403)

    authorizeMock.mockResolvedValueOnce(mockSecretary)
    const res2 = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ organizer: { id: 'no-access', name: 'some org' } })
    )

    expect(res2.statusCode).toEqual(403)
  })

  it('should return 403 when trying to delete non-deletable event', async () => {
    vi.spyOn(console, 'log').mockImplementationOnce(() => undefined)
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, state: 'invited' })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ deletedAt: new Date().toISOString(), id: 'existing' })
    )

    expect(res.statusCode).toEqual(403)
  })

  it('should allow deleting a draft event', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, state: 'draft' })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ deletedAt: new Date().toISOString(), id: 'existing' })
    )

    expect(res.statusCode).toEqual(200)
  })

  it('should allow admin to edit any organizers events', async () => {
    authorizeMock.mockResolvedValueOnce(mockAdmin)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, organizer: { id: 'no-access', name: 'some org' } })

    const res = await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ eventType: 'TEST', id: 'existing' }))

    expect(res.statusCode).toEqual(200)
  })

  it('should create a new event', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ endDate: '2025-06-02', eventType: 'TEST', startDate: '2025-06-01' })
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

  it('creates a new event without the results flag a copy carried (KOE-1510)', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({
        endDate: '2025-06-02',
        eventType: 'TEST',
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
      authorizeMock.mockResolvedValueOnce(mockSecretary)
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
      authorizeMock.mockResolvedValueOnce(mockSecretary)
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
        authorizeMock.mockResolvedValueOnce(mockSecretary)
        getEventMock.mockResolvedValueOnce({ ...linked, kcState: stored })

        const res = await putEventLambda(constructAPIGwEvent({ id: 'existing', ...change }))

        expect(res.statusCode).toEqual(409)
        expect(JSON.parse(res.body)).toMatchObject({ error: 'kcGuidLocked' })
        expect(patchEventMock).not.toHaveBeenCalled()
      })

      it('refuses a changed link once a result has been sent for any dog', async () => {
        authorizeMock.mockResolvedValueOnce(mockSecretary)
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
        authorizeMock.mockResolvedValueOnce(mockSecretary)
        getEventMock.mockResolvedValueOnce(linked)
        mockReadEventRegistrations.mockResolvedValueOnce([{ id: 'a' }])
        patchEventMock.mockResolvedValueOnce({ event: { ...mockEvent, kcGuid: 'another-guid' } })

        const res = await putEventLambda(constructAPIGwEvent({ id: 'existing', kcGuid: 'another-guid' }))

        expect(res.statusCode).toEqual(200)
      })

      it('lets a save repeat the stored link, as the results page does', async () => {
        authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce(stored)

    await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', startListPublished: true }))

    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      stored,
      expect.objectContaining({ startNumbersPublished: false })
    )
  })

  it('does not invent a start number state when the start list state is untouched', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, state: 'invited' })

    await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ eventType: 'TEST', id: 'existing' }))

    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      expect.anything(),
      expect.not.objectContaining({ startNumbersPublished: expect.anything() })
    )
  })

  it('should reject an event edit based on stale modification data', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce(mockEvent)
    findEventWithKcIdMock.mockResolvedValueOnce(undefined)
    patchEventMock.mockResolvedValueOnce({ event: { ...mockEvent, kcId: 12345 } })

    const res = await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', kcId: 12345 }))

    expect(findEventWithKcIdMock).toHaveBeenCalledWith(12345, 'existing')
    expect(res.statusCode).toEqual(200)
  })

  it('should not check for kcId conflicts when kcId is unchanged', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
      authorizeMock.mockResolvedValueOnce(mockSecretary)
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
      authorizeMock.mockResolvedValueOnce(mockSecretary)
      getEventMock.mockResolvedValueOnce(mockEvent)
      findEventWithKcGuidMock.mockResolvedValueOnce(undefined)
      patchEventMock.mockResolvedValueOnce({ event: { ...mockEvent, kcGuid: GUID } })

      const res = await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', kcGuid: GUID }))

      expect(findEventWithKcGuidMock).toHaveBeenCalledWith(GUID, 'existing')
      expect(res.statusCode).toEqual(200)
    })

    it('should not scan for conflicts when the kcGuid is unchanged, as on a results page save', async () => {
      authorizeMock.mockResolvedValueOnce(mockSecretary)
      getEventMock.mockResolvedValueOnce({ ...mockEvent, kcGuid: GUID })
      patchEventMock.mockResolvedValueOnce({ event: { ...mockEvent, eventType: 'TEST', kcGuid: GUID } })

      const res = await putEventLambda(
        constructAPIGwEvent<Partial<JsonDogEvent>>({ eventType: 'TEST', id: 'existing', kcGuid: GUID })
      )

      expect(findEventWithKcGuidMock).not.toHaveBeenCalled()
      expect(res.statusCode).toEqual(200)
    })

    it('should not scan when the kcGuid is cleared with null', async () => {
      authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
      authorizeMock.mockResolvedValueOnce(mockSecretary)
      getEventMock.mockResolvedValueOnce(classless)
      mockReadEventRegistrations.mockResolvedValueOnce([{ ...invitedParticipant(), messagesSent: {} }])

      const res = await publish({ startListPublished: true })

      expect(res.statusCode).toEqual(422)
      expect(JSON.parse(res.body)).toMatchObject({ publish: 'startList', reason: 'invitations' })
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('refuses a start list with nobody picked', async () => {
      authorizeMock.mockResolvedValueOnce(mockSecretary)
      getEventMock.mockResolvedValueOnce(classless)
      mockReadEventRegistrations.mockResolvedValueOnce([])

      const res = await publish({ startListPublished: true })

      expect(JSON.parse(res.body)).toMatchObject({ reason: 'participants' })
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it("lets a past trial's start list out though its invitations never went (KOE-1465)", async () => {
      authorizeMock.mockResolvedValueOnce(mockSecretary)
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
      authorizeMock.mockResolvedValueOnce(mockSecretary)
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
      authorizeMock.mockResolvedValueOnce(mockSecretary)
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
      authorizeMock.mockResolvedValueOnce(mockSecretary)
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
        authorizeMock.mockResolvedValueOnce(mockSecretary)
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
        authorizeMock.mockResolvedValueOnce(mockSecretary)
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
      authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)

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
  ])('should return 400 for %p before looking the event up', async (body, message) => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)

    const res = await putEventLambda(constructAPIGwEvent({ id: 'existing', ...body }))

    expect(res.statusCode).toEqual(400)
    expect(JSON.parse(res.body).message).toEqual(`Bad request: ${message}`)
    expect(getEventMock).not.toHaveBeenCalled()
    expect(saveEventMock).not.toHaveBeenCalled()
    expect(patchEventMock).not.toHaveBeenCalled()
  })

  it.each(['classes', 'judges'] as const)('should return 400 when %s is not an array', async (field) => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)

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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, season: '2024', startDate: '2024-06-15' })

    await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', name: 'Renamed but same dates' }))

    expect(mockReadOrganizerEventStatsRow).not.toHaveBeenCalled()
    expect(mockMoveOrganizerEventStatsRow).not.toHaveBeenCalled()
  })

  // KOE-1547: a row not yet migrated holds its days as instants, and a browser loaded before the
  // change sends them so; the same days in the other form are no change.
  it('reads the stored and the sent days as keys before comparing, merging or auditing them', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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

  // A day a row not yet migrated holds an hour off reads as one day here and as another in its
  // migration, which also migrates the event's registrations: a save now would leave them on different
  // days, so it is refused until the migration has run. An exact midnight is no such day (above).
  it('refuses to save a row holding a day an hour off until its migration has run, and writes nothing', async () => {
    expectConsoleOutput('request deferred')
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce({
      ...mockEvent,
      endDate: legacyDayValue('2026-11-07T22:00:00.000Z'),
      entryEndDate: legacyDayValue('2026-07-06T21:59:59.999Z'),
      startDate: legacyDayValue('2026-11-06T22:00:00.000Z'),
      state: 'confirmed',
    })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ entryEndDate: '2026-07-07', id: 'existing', location: 'New' })
    )

    expect(res.statusCode).toEqual(503)
    expect(patchEventMock).not.toHaveBeenCalled()
    expect(mockReadOrganizerEventStatsRow).not.toHaveBeenCalled()
    expect(mockMoveOrganizerEventStatsRow).not.toHaveBeenCalled()
  })

  // The stored row is read as a stored row, not as a request: forms no request sends are days there.
  it.each([
    ['a stamp without a zone, as Kennelliitto writes its days', '2025-06-01T00:00:00'],
    ['a noon instant', '2025-06-01T09:00:00.000Z'],
  ])('reads a stored start held as %s as its day: no change to audit, the day kept', async (_name, stamp) => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    // The other date is valid, so the refusal is this field's.
    const valid: Pick<JsonDogEvent, 'endDate' | 'startDate'> = { endDate: '2026-06-02', startDate: '2026-06-02' }

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ ...valid, [field]: legacyDayValue(value), eventType: 'TEST' })
    )

    expect(res.statusCode).toEqual(400)
    expect(JSON.parse(res.body)).toEqual({ message: `Bad request: ${field} must be a valid date` })
    expect(saveEventMock).not.toHaveBeenCalled()
    expect(patchEventMock).not.toHaveBeenCalled()
  })

  // A row stored before the check, with zone-less stamps: a change that does not touch its dates goes
  // through, and a bad date the request does carry is still refused.
  it('takes a date-less change to a row whose stored dates the check would refuse', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)
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
    authorizeMock.mockResolvedValueOnce(mockSecretary)

    const res = await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>(payload))

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
      authorizeMock.mockResolvedValueOnce(mockSecretary)
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
})
