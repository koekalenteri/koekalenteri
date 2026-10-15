import type { JsonDogEvent, JsonUser } from '../../types'
import { vi } from 'vitest'
import { constructAPIGwEvent } from '../test-utils/helpers'
// Loaded before the clock is faked: @date-fns/tz's TZDate extends the Date it finds at load, and on a
// fake Date it formats in the host zone, so a CI runner in UTC read Finnish midnight as the day before.
import '../../i18n/dates'

vi.useFakeTimers()
vi.setSystemTime(new Date('2025-03-22T12:45:33+0200'))

vi.doMock('nanoid', () => ({ nanoid: () => 'new-id' }))

vi.doMock('../lib/api-gw', () => ({
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

const mockGetRegistrationsByEventId = vi.fn()
vi.doMock('../lib/registration', () => ({
  getRegistrationsByEventId: mockGetRegistrationsByEventId,
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

const mockStatsRead = vi.fn()
const mockStatsTransaction = vi.fn()
vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return { documentTransaction: mockStatsTransaction, read: mockStatsRead, write: vi.fn() }
  }),
}))

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
const confirmedDates = { endDate: '2025-06-02', startDate: '2025-06-01' }

describe('putEventLambda', () => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    patchEventMock.mockImplementation(async (_id, _existing, next) => ({ event: next }))
    mockGetRegistrationsByEventId.mockResolvedValue([
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
      mockGetRegistrationsByEventId.mockResolvedValueOnce([{ ...invitedParticipant(), messagesSent: {} }])

      const res = await publish({ startListPublished: true })

      expect(res.statusCode).toEqual(422)
      expect(JSON.parse(res.body)).toMatchObject({ publish: 'startList', reason: 'invitations' })
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it('refuses a start list with nobody picked', async () => {
      authorizeMock.mockResolvedValueOnce(mockSecretary)
      getEventMock.mockResolvedValueOnce(classless)
      mockGetRegistrationsByEventId.mockResolvedValueOnce([])

      const res = await publish({ startListPublished: true })

      expect(JSON.parse(res.body)).toMatchObject({ reason: 'participants' })
      expect(patchEventMock).not.toHaveBeenCalled()
    })

    it("lets a past trial's start list out though its invitations never went (KOE-1465)", async () => {
      authorizeMock.mockResolvedValueOnce(mockSecretary)
      getEventMock.mockResolvedValueOnce({ ...classless, endDate: '2025-03-01', startDate: '2025-03-01' })
      mockGetRegistrationsByEventId.mockResolvedValueOnce([{ ...invitedParticipant(), messagesSent: {} }])

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
      mockGetRegistrationsByEventId.mockResolvedValueOnce([])

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
      mockGetRegistrationsByEventId.mockResolvedValueOnce([{ ...invitedParticipant(), messagesSent: {} }])

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
      mockGetRegistrationsByEventId.mockResolvedValueOnce([])

      const res = await publish({ startListPublished: false })

      expect(res.statusCode).toEqual(200)
      expect(mockGetRegistrationsByEventId).not.toHaveBeenCalled()
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
      entryEndDate: '',
      entryStartDate: '',
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
      entryEndDate: '2025-03-25T00:00:00Z',
      entryStartDate: '2025-03-01T00:00:00Z',
      state: 'confirmed',
    })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ entryEndDate: '2025-04-01T00:00:00Z', id: 'existing' })
    )

    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      expect.objectContaining({
        ...mockEvent,
        ...confirmedDates,
        entryEndDate: '2025-03-25T00:00:00Z',
        entryStartDate: '2025-03-01T00:00:00Z',
        state: 'confirmed',
      }),
      {
        ...mockEvent,
        ...confirmedDates,
        entryEndDate: '2025-04-01T00:00:00Z',
        entryOrigEndDate: '2025-03-25T00:00:00Z',
        entryStartDate: '2025-03-01T00:00:00Z',
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
      entryEndDate: '2025-02-02T00:00:00Z',
      state: 'confirmed',
    })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ entryEndDate: '2025-01-01T00:00:00Z', id: 'existing' })
    )

    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      {
        ...mockEvent,
        ...confirmedDates,
        entryEndDate: '2025-02-02T00:00:00Z',
        state: 'confirmed',
      },
      {
        ...mockEvent,
        ...confirmedDates,
        entryEndDate: '2025-01-01T00:00:00Z',
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
      entryEndDate: '2025-01-01T00:00:00Z',
      entryOrigEndDate: '2024-06-01T00:00:00Z',
      state: 'confirmed',
    })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ entryEndDate: '2025-02-02T00:00:00Z', id: 'existing' })
    )

    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      {
        ...mockEvent,
        ...confirmedDates,
        entryEndDate: '2025-01-01T00:00:00Z',
        entryOrigEndDate: '2024-06-01T00:00:00Z',
        state: 'confirmed',
      },
      {
        ...mockEvent,
        ...confirmedDates,
        entryEndDate: '2025-02-02T00:00:00Z',
        entryOrigEndDate: '2024-06-01T00:00:00Z',
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
    getEventMock.mockResolvedValueOnce({ ...mockEvent, season: '2024', startDate: '2024-06-15T00:00:00.000Z' })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', startDate: '2024-12-31T22:00:00.000Z' })
    )

    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      expect.objectContaining({ ...mockEvent, season: '2024', startDate: '2024-06-15T00:00:00.000Z' }),
      expect.objectContaining({
        season: '2025',
        startDate: '2024-12-31T22:00:00.000Z',
      })
    )
    expect(res.statusCode).toEqual(200)
  })

  it('moves the organizer stats record when startDate changes', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, season: '2024', startDate: '2024-06-15T00:00:00.000Z' })
    mockStatsRead.mockResolvedValueOnce({
      count: 7,
      date: '2024-06-15T00:00:00.000Z',
      organizerId: mockEvent.organizer.id,
      PK: `ORG#${mockEvent.organizer.id}`,
      paidAmount: 350,
      SK: `2024-06-15T00:00:00.000Z#existing`,
    })

    await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', startDate: '2024-12-31T22:00:00.000Z' })
    )

    // Counters carry across (added, so a registration already counted under the new key is kept);
    // the old key is removed in the same transaction.
    expect(mockStatsTransaction).toHaveBeenCalledWith([
      {
        Update: expect.objectContaining({
          ExpressionAttributeValues: expect.objectContaining({
            ':count': 7,
            ':date': '2024-12-31T22:00:00.000Z',
            ':paidAmount': 350,
          }),
          Key: { PK: `ORG#${mockEvent.organizer.id}`, SK: `2024-12-31T22:00:00.000Z#existing` },
        }),
      },
      {
        Delete: expect.objectContaining({
          Key: { PK: `ORG#${mockEvent.organizer.id}`, SK: `2024-06-15T00:00:00.000Z#existing` },
        }),
      },
    ])
  })

  it('does not touch the organizer stats record when the key is unchanged', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, season: '2024', startDate: '2024-06-15T00:00:00.000Z' })

    await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', name: 'Renamed but same dates' }))

    expect(mockStatsRead).not.toHaveBeenCalled()
    expect(mockStatsTransaction).not.toHaveBeenCalled()
  })

  it('should not update season when startDate is unchanged', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, season: '2024', startDate: '2024-06-15T00:00:00.000Z' })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', location: 'New Location' })
    )

    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      expect.objectContaining({ ...mockEvent, season: '2024', startDate: '2024-06-15T00:00:00.000Z' }),
      expect.objectContaining({
        season: '2024',
        startDate: '2024-06-15T00:00:00.000Z',
      })
    )
    expect(res.statusCode).toEqual(200)
  })

  it('should add missing season when updating without changing startDate', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, startDate: '2024-12-31T22:00:00.000Z' })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', location: 'New Location' })
    )

    expect(patchEventMock).toHaveBeenCalledWith(
      'existing',
      expect.objectContaining({ ...mockEvent, startDate: '2024-12-31T22:00:00.000Z' }),
      expect.objectContaining({
        location: 'New Location',
        season: '2025',
        startDate: '2024-12-31T22:00:00.000Z',
      })
    )
    expect(res.statusCode).toEqual(200)
  })

  it('should set qualificationStartDate for existing NOME-B SM', async () => {
    const qualificationStartDate = '2024-02-02T00:00:00Z'
    const entryEndDate = '2025-01-01T00:00:00Z'
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

  it.each(['startDate', 'endDate'] as const)('rejects an invalid %s before saving', async (field) => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ [field]: 'not-a-date', eventType: 'TEST' })
    )

    expect(res.statusCode).toEqual(400)
    expect(saveEventMock).not.toHaveBeenCalled()
    expect(patchEventMock).not.toHaveBeenCalled()
  })

  it.each([
    [{ endDate: '2025-06-02', state: 'draft' as const }, 'startDate'],
    [{ endDate: '', startDate: '2025-06-01', state: 'draft' as const }, 'endDate'],
  ])('rejects a draft event with a missing or empty %s before saving', async (payload, field) => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)

    const res = await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>(payload))

    expect(res.statusCode).toEqual(400)
    expect(JSON.parse(res.body)).toEqual({ message: `Bad request: ${field} must be a valid date` })
    expect(saveEventMock).not.toHaveBeenCalled()
  })
})
