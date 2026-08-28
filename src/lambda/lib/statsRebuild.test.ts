import type CustomDynamoClient from '../utils/CustomDynamoClient'
import type { EventStatsEvent } from './statsRebuild'
import { vi } from 'vitest'

const mockBatchWrite = vi.fn<CustomDynamoClient['batchWrite']>()
const mockDelete = vi.fn<CustomDynamoClient['delete']>()
const mockReadAll = vi.fn<CustomDynamoClient['readAll']>()

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: class {
    batchWrite = mockBatchWrite
    delete = mockDelete
    readAll = mockReadAll
  },
}))

vi.doMock('../config', () => ({
  CONFIG: {
    eventStatsTable: 'event-stats-table',
    eventTable: 'event-table',
    registrationTable: 'registration-table',
  },
}))

const {
  buildStatsRecords,
  createHandler,
  getEventStatsRecordYear,
  getStatsRecordPartition,
  REBUILDABLE_STATS_PARTITIONS,
} = await import('./statsRebuild')
const handler = createHandler()
const rebuildHandler = createHandler(REBUILDABLE_STATS_PARTITIONS)

const event = (id: string, startDate: string, eventType = 'NOU'): EventStatsEvent => ({
  classes: [],
  eventType,
  id,
  organizer: { id: `organizer-${id}` },
  places: 0,
  startDate,
  state: 'confirmed',
})

const registration = (id: string, eventId: string, overrides = {}) => ({
  cancelled: false,
  eventId,
  eventType: 'NOU',
  id,
  paidAmount: 0,
  refundAmount: 0,
  ...overrides,
})

describe('statsRebuild', () => {
  const mockLog = vi.spyOn(console, 'log').mockImplementation(() => undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    mockDelete.mockResolvedValue(true)
    mockBatchWrite.mockResolvedValue(undefined)
  })

  it.each([
    [{ PK: 'ORG#organizer', SK: '2025-05-01#event' }, 2025],
    [{ PK: 'ORG#organizer', SK: '2025-05-01#event#copy' }, 2025],
    [{ PK: 'ORG#organizer', SK: '2025-12-31T23:30:00Z#event' }, 2026],
    [{ PK: 'YEARS', SK: '2025' }, 2025],
    [{ PK: 'STAT#2025#dog#handler', SK: 'id' }, 2025],
    [{ PK: 'TOTALS#2025', SK: 'dog' }, 2025],
    [{ PK: 'BUCKETS#2025#dog#handler', SK: '0-1' }, 2025],
    [{ PK: 'BUCKETS#2025#dogsPerHandler', SK: '1' }, 2025],
    [{ PK: 'OTHER#2025', SK: 'id' }, undefined],
    [{ PK: 'YEARS', SK: 'not-a-year' }, undefined],
    [{ PK: 'ORG#organizer', SK: 'not-a-date#event' }, undefined],
    [{ PK: 'CAPACITY#NOME-B', SK: '2025-06#ALO' }, 2025],
    [{ PK: 'CAPACITY#NOU', SK: 'not-a-month#NOU' }, undefined],
    [{ PK: 'JUDGE#2025', SK: '1' }, 2025],
    [{ PK: 'BREAKDOWN#2025', SK: 'organizer-1#NOU' }, 2025],
  ])('extracts stats year from %o', (key, expected) => {
    expect(getEventStatsRecordYear(key)).toBe(expected)
  })

  it('does nothing when events, registrations, and stats are all absent', async () => {
    mockReadAll.mockResolvedValue([])

    await handler()

    expect(mockReadAll).toHaveBeenCalledTimes(3)
    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockBatchWrite).not.toHaveBeenCalled()
  })

  it('calculates final stats once, then bulk writes each year in ascending order and prunes only stale keys', async () => {
    const event2025 = event('event-2025', '2025-05-01')
    const event2026 = event('event-2026', '2026-05-01', 'other')
    const registration2025 = registration('registration-2025', event2025.id, {
      cancelled: true,
      dog: { breedCode: 'LAB', regNo: 'FI123' },
      handler: { email: 'handler@example.com' },
      owner: { email: 'owner@example.com' },
      paidAmount: 30,
      refundAmount: 5,
    })
    const registration2026 = registration('registration-2026', event2026.id, { paidAmount: 20 })
    const stats = [
      { PK: 'TOTALS#2025', SK: 'dog' },
      { PK: 'TOTALS#2024', SK: 'dog' },
    ]
    mockReadAll
      .mockResolvedValueOnce([event2026, event2025])
      .mockResolvedValueOnce([registration2026, registration2025])
      .mockResolvedValueOnce(stats)

    await handler()

    expect(mockReadAll).toHaveBeenNthCalledWith(1, {
      names: { '#state': 'state' },
      projection: 'id, organizer, startDate, eventType, classes, places, #state, judges',
      table: 'event-table',
    })
    expect(mockReadAll).toHaveBeenNthCalledWith(2, {
      names: { '#class': 'class', '#group': 'group', '#handler': 'handler', '#key': 'key', '#owner': 'owner' },
      projection:
        'eventId, id, cancelled, paidAmount, refundAmount, eventType, dog.regNo, dog.breedCode, #handler.email, #handler.membership, #owner.membership, owners, ownerHandles, #class, #group.#key',
      table: 'registration-table',
    })
    expect(mockReadAll).toHaveBeenNthCalledWith(3, { projection: 'PK, SK' })
    // TOTALS#2024 has no counterpart in the rebuilt records, so it is pruned; TOTALS#2025 is
    // regenerated in place and must never be deleted -- deleting it would blank the year for
    // however long the write takes, and /stats caches that gap publicly.
    expect(mockDelete).toHaveBeenCalledTimes(1)
    expect(mockDelete).toHaveBeenCalledWith(stats[1])
    expect(mockDelete).not.toHaveBeenCalledWith(stats[0])
    expect(mockBatchWrite).toHaveBeenCalledTimes(2)
    expect(mockBatchWrite).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([
        expect.objectContaining({
          cancelledRegistrations: 1,
          count: 1,
          PK: 'ORG#organizer-event-2025',
          paidAmount: 30,
          paidRegistrations: 1,
          refundedAmount: 5,
          refundedRegistrations: 1,
          SK: '2025-05-01#event-2025',
        }),
        { count: 1, PK: 'TOTALS#2025', SK: 'dog' },
        { count: 1, PK: 'BUCKETS#2025#dog#handler', SK: '1' },
        { count: 1, PK: 'BUCKETS#2025#dogsPerHandler', SK: '1' },
        expect.objectContaining({ PK: 'YEARS', SK: '2025' }),
      ])
    )
    expect(mockBatchWrite).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining([
        expect.objectContaining({ count: 1, PK: 'ORG#organizer-event-2026', SK: '2026-05-01#event-2026' }),
        expect.objectContaining({ PK: 'YEARS', SK: '2026' }),
      ])
    )
  })

  it('counts repeated participants and derives unique totals and dog-handler buckets', () => {
    const testEvent = event('event-2025', '2025-05-01')
    const { records, skippedCount } = buildStatsRecords(
      [
        registration('one', testEvent.id, { dog: { regNo: 'FI1' }, handler: { email: 'a@example.com' } }),
        registration('two', testEvent.id, { dog: { regNo: 'FI1' }, handler: { email: 'a@example.com' } }),
        registration('three', testEvent.id, { dog: { regNo: 'FI2' }, handler: { email: 'b@example.com' } }),
      ],
      new Map([[testEvent.id, testEvent]]),
      '2025-01-01T00:00:00.000Z'
    )

    expect(skippedCount).toBe(0)
    expect(records).toEqual(
      expect.arrayContaining([
        { count: 2, PK: 'TOTALS#2025', SK: 'dog' },
        { count: 2, PK: 'TOTALS#2025', SK: 'dog#handler' },
        { count: 1, PK: 'BUCKETS#2025#dog#handler', SK: '1' },
        { count: 1, PK: 'BUCKETS#2025#dog#handler', SK: '2' },
        // Both handler a (1 distinct dog, run twice) and handler b (1 distinct dog) land in the '1' bucket.
        { count: 2, PK: 'BUCKETS#2025#dogsPerHandler', SK: '1' },
      ])
    )
  })

  it('buckets handlers by how many distinct dogs they ran, not how many times they registered', () => {
    const testEvent = event('event-2025', '2025-05-01')
    const { records } = buildStatsRecords(
      [
        registration('one', testEvent.id, { dog: { regNo: 'FI1' }, handler: { email: 'a@example.com' } }),
        registration('two', testEvent.id, { dog: { regNo: 'FI2' }, handler: { email: 'a@example.com' } }),
        registration('three', testEvent.id, { dog: { regNo: 'FI3' }, handler: { email: 'b@example.com' } }),
      ],
      new Map([[testEvent.id, testEvent]]),
      '2025-01-01T00:00:00.000Z'
    )

    expect(records).toEqual(
      expect.arrayContaining([
        // Handler a ran 2 distinct dogs; handler b ran 1.
        { count: 1, PK: 'BUCKETS#2025#dogsPerHandler', SK: '1' },
        { count: 1, PK: 'BUCKETS#2025#dogsPerHandler', SK: '2' },
      ])
    )
  })

  it('builds monthly capacity-vs-starters records per event type and class', () => {
    const nomeB: EventStatsEvent = {
      classes: [
        { class: 'ALO', date: '2025-06-01', places: 10 },
        { class: 'AVO', date: '2025-06-01', places: 8 },
      ],
      eventType: 'NOME-B',
      id: 'nome-b-event',
      organizer: { id: 'organizer-1' },
      places: 0,
      startDate: '2025-06-01',
      state: 'confirmed',
    }
    const registrations = [
      registration('starter', nomeB.id, { class: 'ALO', eventType: 'NOME-B', group: { key: 'ALO-ap' } }),
      registration('reserve', nomeB.id, { class: 'ALO', eventType: 'NOME-B', group: { key: 'reserve' } }),
      registration('cancelled', nomeB.id, {
        cancelled: true,
        class: 'AVO',
        eventType: 'NOME-B',
        group: { key: 'AVO-ap' },
      }),
    ]

    const { records } = buildStatsRecords(registrations, new Map([[nomeB.id, nomeB]]), '2025-01-01T00:00:00.000Z')

    expect(records).toEqual(
      expect.arrayContaining([
        {
          cancelledRegistrations: 0,
          eventCount: 1,
          organizerId: 'organizer-1',
          PK: 'CAPACITY#NOME-B',
          places: 10,
          reserve: 1,
          SK: '2025-06#ALO#organizer-1',
          starters: 1,
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        {
          cancelledRegistrations: 1,
          eventCount: 1,
          organizerId: 'organizer-1',
          PK: 'CAPACITY#NOME-B',
          places: 8,
          reserve: 0,
          SK: '2025-06#AVO#organizer-1',
          starters: 0,
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ])
    )
  })

  it('falls back to the event type as the class key for classless event types', () => {
    const nou: EventStatsEvent = {
      classes: [],
      eventType: 'NOU',
      id: 'nou-event',
      organizer: { id: 'organizer-1' },
      places: 15,
      startDate: '2025-04-10',
      state: 'confirmed',
    }
    const registrations = [registration('starter', nou.id, { eventType: 'NOU', group: { key: 'kp' } })]

    const { records } = buildStatsRecords(registrations, new Map([[nou.id, nou]]), '2025-01-01T00:00:00.000Z')

    expect(records).toEqual(
      expect.arrayContaining([
        {
          cancelledRegistrations: 0,
          eventCount: 1,
          organizerId: 'organizer-1',
          PK: 'CAPACITY#NOU',
          places: 15,
          reserve: 0,
          SK: '2025-04#NOU#organizer-1',
          starters: 1,
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ])
    )
  })

  it('buckets a class by its own scheduled date, not the event start date', () => {
    const multiDay: EventStatsEvent = {
      classes: [{ class: 'VOI', date: '2025-07-15', places: 5 }],
      eventType: 'NOWT',
      id: 'multi-day-event',
      organizer: { id: 'organizer-1' },
      places: 0,
      startDate: '2025-07-10',
      state: 'confirmed',
    }

    const { records } = buildStatsRecords([], new Map([[multiDay.id, multiDay]]), '2025-01-01T00:00:00.000Z')

    expect(records).toEqual(
      expect.arrayContaining([expect.objectContaining({ PK: 'CAPACITY#NOWT', SK: '2025-07#VOI#organizer-1' })])
    )
  })

  it('buckets capacity by the event timezone, not the stored UTC instant', () => {
    // 2025-06-01 00:00 Europe/Helsinki is stored as the previous day in UTC.
    const juneFirst: EventStatsEvent = {
      classes: [{ class: 'ALO', date: '2025-05-31T21:00:00.000Z', places: 6 }],
      eventType: 'NOME-B',
      id: 'june-first-event',
      organizer: { id: 'organizer-1' },
      places: 0,
      startDate: '2025-05-31T21:00:00.000Z',
      state: 'confirmed',
    }
    const registrations = [
      registration('starter', juneFirst.id, { class: 'ALO', eventType: 'NOME-B', group: { key: 'ALO-ap' } }),
    ]

    const { records } = buildStatsRecords(
      registrations,
      new Map([[juneFirst.id, juneFirst]]),
      '2025-01-01T00:00:00.000Z'
    )

    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ PK: 'CAPACITY#NOME-B', places: 6, SK: '2025-06#ALO#organizer-1', starters: 1 }),
      ])
    )
  })

  it('splits the event total over classes that have no places of their own', () => {
    const noClassPlaces: EventStatsEvent = {
      classes: [
        { class: 'ALO', date: '2025-09-06' },
        { class: 'AVO', date: '2025-09-06' },
        { class: 'VOI', date: '2025-09-06' },
      ],
      eventType: 'NOME-B',
      id: 'no-class-places-event',
      organizer: { id: 'organizer-1' },
      places: 31,
      startDate: '2025-09-06',
      state: 'confirmed',
    }

    const { records } = buildStatsRecords([], new Map([[noClassPlaces.id, noClassPlaces]]), '2025-01-01T00:00:00.000Z')
    const capacity = records.filter((record) => record.PK === 'CAPACITY#NOME-B')

    // 31 total, not 31 per class: remainder goes to the first class, as in the event form.
    expect(capacity.reduce((total, record) => total + ('places' in record ? (record.places ?? 0) : 0), 0)).toBe(31)
    expect(capacity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ places: 11, SK: '2025-09#ALO#organizer-1' }),
        expect.objectContaining({ places: 10, SK: '2025-09#AVO#organizer-1' }),
        expect.objectContaining({ places: 10, SK: '2025-09#VOI#organizer-1' }),
      ])
    )
  })

  it('tops up only the classes missing places when some are set', () => {
    const mixed: EventStatsEvent = {
      classes: [
        { class: 'ALO', date: '2025-09-06', places: 12 },
        { class: 'AVO', date: '2025-09-06' },
      ],
      eventType: 'NOME-B',
      id: 'mixed-places-event',
      organizer: { id: 'organizer-1' },
      places: 20,
      startDate: '2025-09-06',
      state: 'confirmed',
    }

    const { records } = buildStatsRecords([], new Map([[mixed.id, mixed]]), '2025-01-01T00:00:00.000Z')

    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ places: 12, SK: '2025-09#ALO#organizer-1' }),
        expect.objectContaining({ places: 8, SK: '2025-09#AVO#organizer-1' }),
      ])
    )
  })

  it('counts a registration as a starter only when its group is a participant group', () => {
    const nomeB: EventStatsEvent = {
      classes: [{ class: 'ALO', date: '2025-06-01', places: 10 }],
      eventType: 'NOME-B',
      id: 'group-event',
      organizer: { id: 'organizer-1' },
      places: 0,
      startDate: '2025-06-01',
      state: 'confirmed',
    }
    const registrations = [
      registration('starter', nomeB.id, { class: 'ALO', eventType: 'NOME-B', group: { key: 'ALO-ap' } }),
      registration('reserve', nomeB.id, { class: 'ALO', eventType: 'NOME-B', group: { key: 'reserve' } }),
      registration('no-group', nomeB.id, { class: 'ALO', eventType: 'NOME-B' }),
    ]

    const { records } = buildStatsRecords(registrations, new Map([[nomeB.id, nomeB]]), '2025-01-01T00:00:00.000Z')

    expect(records).toEqual(
      expect.arrayContaining([expect.objectContaining({ reserve: 2, SK: '2025-06#ALO#organizer-1', starters: 1 })])
    )
  })

  it("attributes a registration with an unknown class to the event's only class", () => {
    const nou: EventStatsEvent = {
      classes: [],
      eventType: 'NOU',
      id: 'single-class-event',
      organizer: { id: 'organizer-1' },
      places: 15,
      startDate: '2025-04-10',
      state: 'confirmed',
    }
    // Registration carries a class the (classless) event does not offer.
    const registrations = [registration('starter', nou.id, { class: 'ALO', eventType: 'NOU', group: { key: 'kp' } })]

    const { records, unattributedCapacityCount } = buildStatsRecords(
      registrations,
      new Map([[nou.id, nou]]),
      '2025-01-01T00:00:00.000Z'
    )

    expect(unattributedCapacityCount).toBe(0)
    expect(records.filter((record) => record.PK === 'CAPACITY#NOU')).toEqual([
      expect.objectContaining({ places: 15, SK: '2025-04#NOU#organizer-1', starters: 1 }),
    ])
  })

  it('drops a registration whose class is ambiguous rather than inventing a zero-places bucket', () => {
    const nomeB: EventStatsEvent = {
      classes: [
        { class: 'ALO', date: '2025-06-01', places: 10 },
        { class: 'AVO', date: '2025-06-01', places: 8 },
      ],
      eventType: 'NOME-B',
      id: 'ambiguous-event',
      organizer: { id: 'organizer-1' },
      places: 0,
      startDate: '2025-06-01',
      state: 'confirmed',
    }
    // No class on the registration, and the event offers more than one.
    const registrations = [registration('classless', nomeB.id, { eventType: 'NOME-B', group: { key: 'ALO-ap' } })]

    const { records, unattributedCapacityCount } = buildStatsRecords(
      registrations,
      new Map([[nomeB.id, nomeB]]),
      '2025-01-01T00:00:00.000Z'
    )

    expect(unattributedCapacityCount).toBe(1)
    expect(records.filter((record) => record.PK === 'CAPACITY#NOME-B')).toEqual([
      expect.objectContaining({ places: 10, SK: '2025-06#ALO#organizer-1', starters: 0 }),
      expect.objectContaining({ places: 8, SK: '2025-06#AVO#organizer-1', starters: 0 }),
    ])
  })

  it('excludes draft, tentative and cancelled events from capacity stats', () => {
    const draft: EventStatsEvent = {
      classes: [{ class: 'ALO', date: '2025-08-01', places: 5 }],
      eventType: 'NOME-B',
      id: 'draft-event',
      organizer: { id: 'organizer-1' },
      places: 0,
      startDate: '2025-08-01',
      state: 'draft',
    }
    const cancelled: EventStatsEvent = { ...draft, id: 'cancelled-event', state: 'cancelled' }
    const tentative: EventStatsEvent = { ...draft, id: 'tentative-event', state: 'tentative' }

    const { records } = buildStatsRecords(
      [],
      new Map([
        [draft.id, draft],
        [cancelled.id, cancelled],
        [tentative.id, tentative],
      ]),
      '2025-01-01T00:00:00.000Z'
    )

    expect(records.filter((record) => record.PK.startsWith('CAPACITY#'))).toHaveLength(0)
  })

  describe('breed start rate', () => {
    it('counts starters and reserve per breed, cancelled excluded entirely', () => {
      const nomeB = event('nome-b-event', '2025-06-01', 'NOME-B')
      const registrations = [
        registration('starter', nomeB.id, { dog: { breedCode: '122' }, eventType: 'NOME-B', group: { key: 'ALO-ap' } }),
        registration('reserve', nomeB.id, {
          dog: { breedCode: '122' },
          eventType: 'NOME-B',
          group: { key: 'reserve' },
        }),
        registration('cancelled', nomeB.id, {
          cancelled: true,
          dog: { breedCode: '122' },
          eventType: 'NOME-B',
          group: { key: 'ALO-ap' },
        }),
        registration('other-breed', nomeB.id, {
          dog: { breedCode: '111' },
          eventType: 'NOME-B',
          group: { key: 'reserve' },
        }),
      ]

      const { records } = buildStatsRecords(registrations, new Map([[nomeB.id, nomeB]]), '2025-01-01T00:00:00.000Z')

      expect(records).toEqual(
        expect.arrayContaining([
          { PK: 'STAT#2025#breedStart', reserve: 1, SK: '122', starters: 1, updatedAt: '2025-01-01T00:00:00.000Z' },
          { PK: 'STAT#2025#breedStart', reserve: 1, SK: '111', starters: 0, updatedAt: '2025-01-01T00:00:00.000Z' },
        ])
      )
    })

    it('falls back to "unknown" when the breed code is missing', () => {
      const nomeB = event('nome-b-event', '2025-06-01', 'NOME-B')
      const registrations = [registration('starter', nomeB.id, { eventType: 'NOME-B', group: { key: 'ALO-ap' } })]

      const { records } = buildStatsRecords(registrations, new Map([[nomeB.id, nomeB]]), '2025-01-01T00:00:00.000Z')

      expect(records).toEqual(
        expect.arrayContaining([
          { PK: 'STAT#2025#breedStart', reserve: 0, SK: 'unknown', starters: 1, updatedAt: '2025-01-01T00:00:00.000Z' },
        ])
      )
    })

    it('excludes unofficial event types, same as breed participation counts', () => {
      const other = event('other-event', '2025-06-01', 'other')
      const registrations = [
        registration('starter', other.id, { dog: { breedCode: '122' }, eventType: 'other', group: { key: 'ap' } }),
      ]

      const { records } = buildStatsRecords(registrations, new Map([[other.id, other]]), '2025-01-01T00:00:00.000Z')

      expect(records.filter((record) => record.PK === 'STAT#2025#breedStart')).toHaveLength(0)
    })

    it('excludes draft, tentative and cancelled events, same as capacity', () => {
      const draft: EventStatsEvent = {
        ...event('draft-event', '2025-08-01', 'NOME-B'),
        state: 'draft',
      }
      const registrations = [
        registration('starter', draft.id, { dog: { breedCode: '122' }, eventType: 'NOME-B', group: { key: 'ap' } }),
      ]

      const { records } = buildStatsRecords(registrations, new Map([[draft.id, draft]]), '2025-01-01T00:00:00.000Z')

      expect(records.filter((record) => record.PK === 'STAT#2025#breedStart')).toHaveLength(0)
    })
  })

  describe('event breakdown', () => {
    it('seeds event count and places per club + event type, plus the club subtotal and grand total', () => {
      const nou = { ...event('nou-event', '2025-06-01', 'NOU'), places: 15 }

      const { records } = buildStatsRecords([], new Map([[nou.id, nou]]), '2025-01-01T00:00:00.000Z')

      expect(records).toEqual(
        expect.arrayContaining([
          {
            cancelledRegistrations: 0,
            eventCount: 1,
            eventType: 'NOU',
            handlerCount: 0,
            memberStarters: 0,
            organizerId: 'organizer-nou-event',
            PK: 'BREAKDOWN#2025',
            places: 15,
            reserve: 0,
            SK: 'organizer-nou-event#NOU',
            starters: 0,
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
          expect.objectContaining({
            eventCount: 1,
            eventType: 'ALL',
            organizerId: 'organizer-nou-event',
            PK: 'BREAKDOWN#2025',
            places: 15,
            SK: 'organizer-nou-event#ALL',
          }),
          expect.objectContaining({
            eventCount: 1,
            eventType: 'ALL',
            organizerId: 'ALL',
            PK: 'BREAKDOWN#2025',
            places: 15,
            SK: 'ALL#ALL',
          }),
        ])
      )
    })

    it('counts starters and distinct handlers per club + event type, tallying reserve and cancelled separately', () => {
      const nou = event('nou-event', '2025-06-01', 'NOU')
      const registrations = [
        registration('starter-1', nou.id, { eventType: 'NOU', group: { key: 'ap' }, handler: { email: 'a@x.fi' } }),
        registration('starter-2', nou.id, {
          eventType: 'NOU',
          group: { key: 'ap' },
          // Same handler, a second dog: should not inflate the distinct handler count.
          handler: { email: 'A@X.FI' },
        }),
        registration('reserve', nou.id, {
          eventType: 'NOU',
          group: { key: 'reserve' },
          handler: { email: 'b@x.fi' },
        }),
        registration('cancelled', nou.id, {
          cancelled: true,
          eventType: 'NOU',
          group: { key: 'ap' },
          handler: { email: 'c@x.fi' },
        }),
      ]

      const { records } = buildStatsRecords(registrations, new Map([[nou.id, nou]]), '2025-01-01T00:00:00.000Z')

      expect(records).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            cancelledRegistrations: 1,
            handlerCount: 1,
            memberStarters: 0,
            PK: 'BREAKDOWN#2025',
            reserve: 1,
            SK: 'organizer-nou-event#NOU',
            starters: 2,
          }),
        ])
      )
    })

    it('counts starters whose handler is a club member', () => {
      const nou = event('nou-event', '2025-06-01', 'NOU')
      const registrations = [
        registration('member', nou.id, {
          eventType: 'NOU',
          group: { key: 'ap' },
          handler: { email: 'a@x.fi', membership: true },
        }),
        registration('non-member', nou.id, {
          eventType: 'NOU',
          group: { key: 'ap' },
          handler: { email: 'b@x.fi', membership: false },
        }),
      ]

      const { records } = buildStatsRecords(registrations, new Map([[nou.id, nou]]), '2025-01-01T00:00:00.000Z')

      expect(records).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            memberStarters: 1,
            PK: 'BREAKDOWN#2025',
            SK: 'organizer-nou-event#NOU',
            starters: 2,
          }),
        ])
      )
    })

    it('deduplicates handlers within a club across event types, and nationwide across clubs', () => {
      // Same club, two event types, same handler: the club subtotal must dedupe to 1.
      const nouAtClub1 = event('nou-event', '2025-06-01', 'NOU')
      const nomeBAtClub1 = { ...event('nome-b-event', '2025-06-02', 'NOME-B'), organizer: nouAtClub1.organizer }
      // A different club running the same event type with the same handler: only the grand
      // total should dedupe across clubs -- each club's own rows must still show 1 starter.
      const nouAtClub2 = { ...event('nou-event-2', '2025-06-03', 'NOU'), organizer: { id: 'organizer-2' } }
      const registrations = [
        registration('club1-nou', nouAtClub1.id, {
          eventType: 'NOU',
          group: { key: 'ap' },
          handler: { email: 'a@x.fi' },
        }),
        registration('club1-nomeb', nomeBAtClub1.id, {
          eventType: 'NOME-B',
          group: { key: 'ap' },
          handler: { email: 'a@x.fi' },
        }),
        registration('club2-nou', nouAtClub2.id, {
          eventType: 'NOU',
          group: { key: 'ap' },
          handler: { email: 'a@x.fi' },
        }),
      ]

      const { records } = buildStatsRecords(
        registrations,
        new Map([
          [nouAtClub1.id, nouAtClub1],
          [nomeBAtClub1.id, nomeBAtClub1],
          [nouAtClub2.id, nouAtClub2],
        ]),
        '2025-01-01T00:00:00.000Z'
      )

      expect(records).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            handlerCount: 1,
            organizerId: 'organizer-nou-event',
            PK: 'BREAKDOWN#2025',
            SK: 'organizer-nou-event#NOU',
            starters: 1,
          }),
          expect.objectContaining({
            handlerCount: 1,
            organizerId: 'organizer-nou-event',
            PK: 'BREAKDOWN#2025',
            SK: 'organizer-nou-event#NOME-B',
            starters: 1,
          }),
          // Club 1 subtotal: same handler in both event types dedupes to 1, not 2.
          expect.objectContaining({
            handlerCount: 1,
            organizerId: 'organizer-nou-event',
            PK: 'BREAKDOWN#2025',
            SK: 'organizer-nou-event#ALL',
            starters: 2,
          }),
          expect.objectContaining({
            handlerCount: 1,
            organizerId: 'organizer-2',
            PK: 'BREAKDOWN#2025',
            SK: 'organizer-2#NOU',
            starters: 1,
          }),
          // Grand total: same handler across three starts at two clubs dedupes to 1, not 3.
          expect.objectContaining({
            eventCount: 3,
            handlerCount: 1,
            organizerId: 'ALL',
            PK: 'BREAKDOWN#2025',
            SK: 'ALL#ALL',
            starters: 3,
          }),
        ])
      )
    })

    it('excludes draft, tentative and cancelled events, same as capacity', () => {
      const draft: EventStatsEvent = { ...event('draft-event', '2025-08-01', 'NOU'), state: 'draft' }

      const { records } = buildStatsRecords([], new Map([[draft.id, draft]]), '2025-01-01T00:00:00.000Z')

      expect(records.filter((record) => record.PK.startsWith('BREAKDOWN#'))).toHaveLength(0)
    })
  })

  describe('judge workload', () => {
    it('counts one event per judge, independent of registrations', () => {
      const nomeB: EventStatsEvent = {
        ...event('nome-b-event', '2025-06-01'),
        judges: [
          { id: 1, name: 'Matti Meikäläinen' },
          { id: 2, name: 'Maija Mallikas' },
        ],
      }

      const { records } = buildStatsRecords([], new Map([[nomeB.id, nomeB]]), '2025-01-01T00:00:00.000Z')

      expect(records.filter((record) => record.PK === 'JUDGE#2025')).toEqual(
        expect.arrayContaining([
          { count: 1, name: 'Matti Meikäläinen', PK: 'JUDGE#2025', SK: '1', updatedAt: '2025-01-01T00:00:00.000Z' },
          { count: 1, name: 'Maija Mallikas', PK: 'JUDGE#2025', SK: '2', updatedAt: '2025-01-01T00:00:00.000Z' },
        ])
      )
    })

    it('counts a judge only once per event even when assigned to several classes', () => {
      const nomeB: EventStatsEvent = {
        ...event('nome-b-event', '2025-06-01'),
        classes: [
          { class: 'ALO', date: '2025-06-01', judge: { id: 1, name: 'Matti Meikäläinen' } },
          { class: 'AVO', date: '2025-06-01', judge: { id: 1, name: 'Matti Meikäläinen' } },
        ],
        judges: [{ id: 1, name: 'Matti Meikäläinen' }],
      }
      const other: EventStatsEvent = {
        ...event('other-event', '2025-07-01'),
        judges: [{ id: 1, name: 'Matti Meikäläinen' }],
      }

      const { records } = buildStatsRecords(
        [],
        new Map([
          [nomeB.id, nomeB],
          [other.id, other],
        ]),
        '2025-01-01T00:00:00.000Z'
      )

      expect(records.filter((record) => record.PK === 'JUDGE#2025')).toEqual([
        { count: 2, name: 'Matti Meikäläinen', PK: 'JUDGE#2025', SK: '1', updatedAt: '2025-01-01T00:00:00.000Z' },
      ])
    })

    it('keys a judge without an id by name', () => {
      const nomeB: EventStatsEvent = {
        ...event('nome-b-event', '2025-06-01'),
        judges: [{ name: 'Foreign Judge' }],
      }

      const { records } = buildStatsRecords([], new Map([[nomeB.id, nomeB]]), '2025-01-01T00:00:00.000Z')

      expect(records.filter((record) => record.PK === 'JUDGE#2025')).toEqual([
        {
          count: 1,
          name: 'Foreign Judge',
          PK: 'JUDGE#2025',
          SK: 'Foreign Judge',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ])
    })

    it('excludes draft, tentative and cancelled events, same as capacity', () => {
      const draft: EventStatsEvent = {
        ...event('draft-event', '2025-08-01'),
        judges: [{ id: 1, name: 'Matti Meikäläinen' }],
        state: 'draft',
      }

      const { records } = buildStatsRecords([], new Map([[draft.id, draft]]), '2025-01-01T00:00:00.000Z')

      expect(records.filter((record) => record.PK === 'JUDGE#2025')).toHaveLength(0)
    })

    it('is classified as its own partition, rebuildable like capacity and participation', () => {
      expect(getStatsRecordPartition({ PK: 'JUDGE#2025', SK: '1' })).toBe('judges')
      expect(REBUILDABLE_STATS_PARTITIONS).toContain('judges')
    })
  })

  it('skips registrations whose events are missing or have invalid start dates', async () => {
    const invalidEvent = event('invalid-event', 'not-a-date')
    mockReadAll
      .mockResolvedValueOnce([invalidEvent])
      .mockResolvedValueOnce([
        registration('missing-registration', 'missing-event'),
        registration('invalid-registration', invalidEvent.id),
      ])
      .mockResolvedValueOnce([])

    await handler()

    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockBatchWrite).not.toHaveBeenCalled()
    expect(mockLog).toHaveBeenLastCalledWith(
      'Stats regeneration completed. Records: 0, Skipped: 2, Unclassified stats: 0, Registrations without a capacity class: 0'
    )
  })

  it('reports stats records that cannot be assigned to a year', async () => {
    mockReadAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ PK: 'NEW_STAT_FAMILY#2025', SK: 'id' }])

    await handler()

    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockLog).toHaveBeenLastCalledWith(
      'Stats regeneration completed. Records: 0, Skipped: 0, Unclassified stats: 1, Registrations without a capacity class: 0'
    )
  })

  describe('partition scoping', () => {
    it.each([
      [{ PK: 'ORG#organizer-1', SK: '2025-06-01#event' }, 'organizer'],
      [{ PK: 'CAPACITY#NOME-B', SK: '2025-06#ALO' }, 'capacity'],
      [{ PK: 'JUDGE#2025', SK: '1' }, 'judges'],
      [{ PK: 'STAT#2025#dog', SK: 'FI12345' }, 'participation'],
      [{ PK: 'TOTALS#2025', SK: 'dog' }, 'participation'],
      [{ PK: 'BUCKETS#2025#dog#handler', SK: '1' }, 'participation'],
      [{ PK: 'BUCKETS#2025#dogsPerHandler', SK: '1' }, 'participation'],
      [{ PK: 'YEARS', SK: '2025' }, 'participation'],
      [{ PK: 'NEW_STAT_FAMILY#2025', SK: 'id' }, undefined],
    ])('assigns %o to the %s partition', (key, expected) => {
      expect(getStatsRecordPartition(key)).toBe(expected)
    })

    it('never deletes organizer records when they are out of scope', async () => {
      mockReadAll
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { PK: 'ORG#organizer-1', SK: '2025-06-01#event' },
          { PK: 'TOTALS#2025', SK: 'dog' },
          { PK: 'CAPACITY#NOME-B', SK: '2025-06#ALO' },
        ])

      await rebuildHandler()

      // ORG# is maintained by registration writes; touching it here would race them.
      const deleted = mockDelete.mock.calls.map(([key]) => key)
      expect(deleted).toEqual([
        { PK: 'TOTALS#2025', SK: 'dog' },
        { PK: 'CAPACITY#NOME-B', SK: '2025-06#ALO' },
      ])
    })

    it('writes no organizer records when they are out of scope', () => {
      const nomeB: EventStatsEvent = {
        classes: [{ class: 'ALO', date: '2025-06-01', places: 10 }],
        eventType: 'NOME-B',
        id: 'scoped-event',
        organizer: { id: 'organizer-1' },
        places: 0,
        startDate: '2025-06-01',
        state: 'confirmed',
      }
      const registrations = [
        registration('starter', nomeB.id, { class: 'ALO', eventType: 'NOME-B', group: { key: 'ALO-ap' } }),
      ]

      const { records } = buildStatsRecords(
        registrations,
        new Map([[nomeB.id, nomeB]]),
        '2025-01-01T00:00:00.000Z',
        REBUILDABLE_STATS_PARTITIONS
      )

      expect(records.some((record) => record.PK.startsWith('ORG#'))).toBe(false)
      expect(records.some((record) => record.PK.startsWith('CAPACITY#'))).toBe(true)
      expect(records.some((record) => record.PK.startsWith('TOTALS#'))).toBe(true)
      expect(records.some((record) => record.PK === 'YEARS')).toBe(true)
    })

    it('rebuilds every partition by default', () => {
      const nomeB: EventStatsEvent = {
        classes: [{ class: 'ALO', date: '2025-06-01', places: 10 }],
        eventType: 'NOME-B',
        id: 'full-event',
        organizer: { id: 'organizer-1' },
        places: 0,
        startDate: '2025-06-01',
        state: 'confirmed',
      }
      const registrations = [
        registration('starter', nomeB.id, { class: 'ALO', eventType: 'NOME-B', group: { key: 'ALO-ap' } }),
      ]

      const { records } = buildStatsRecords(registrations, new Map([[nomeB.id, nomeB]]), '2025-01-01T00:00:00.000Z')

      expect(records.some((record) => record.PK.startsWith('ORG#'))).toBe(true)
      expect(records.some((record) => record.PK.startsWith('CAPACITY#'))).toBe(true)
      expect(records.some((record) => record.PK.startsWith('TOTALS#'))).toBe(true)
    })
  })

  it('fails instead of reporting success when cleanup fails', async () => {
    mockReadAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ PK: 'TOTALS#2025', SK: 'dog' }])
    mockDelete.mockResolvedValueOnce(false)

    await expect(handler()).rejects.toThrow('Failed to delete stats record TOTALS#2025/dog')
    expect(mockBatchWrite).not.toHaveBeenCalled()
  })

  describe('event totals', () => {
    it('counts committed official events with no registrations, so averages divide by events held', () => {
      const withRegistrations = event('event-with-registrations', '2025-05-01')
      const empty = event('event-empty', '2025-06-01')
      const cancelled: EventStatsEvent = { ...event('event-cancelled', '2025-07-01'), state: 'cancelled' }
      const unofficial = event('event-unofficial', '2025-08-01', 'other')
      const eventsById = new Map(
        [withRegistrations, empty, cancelled, unofficial].map((testEvent) => [testEvent.id, testEvent])
      )

      const { records } = buildStatsRecords([registration('one', withRegistrations.id)], eventsById, 'now')

      // The registration-less event counts toward the total; cancelled and unofficial do not.
      expect(records).toContainEqual({ count: 2, PK: 'TOTALS#2025', SK: 'event' })
      expect(records).toContainEqual({ count: 0, PK: 'STAT#2025#event', SK: empty.id })
      expect(records.some((record) => record.PK === 'STAT#2025#event' && record.SK === cancelled.id)).toBe(false)
    })
  })

  describe('retention', () => {
    const pair = (regNo: string, email: string) => ({ dog: { regNo }, handler: { email } })
    const build = (years: { year: number; pairs: { dog: { regNo: string }; handler: { email: string } }[] }[]) => {
      const events = years.map(({ year }) => event(`e${year}`, `${year}-05-01`))
      const registrations = years.flatMap(({ year, pairs }) =>
        pairs.map((p, i) => registration(`r${year}-${i}`, `e${year}`, p))
      )
      const { records } = buildStatsRecords(registrations, new Map(events.map((e) => [e.id, e])), 'now')
      return records.filter((r) => r.PK.startsWith('RETENTION#'))
    }

    it('splits a year into pairs that competed the year before and pairs that did not', () => {
      const records = build([
        { pairs: [pair('FI1', 'a@example.com'), pair('FI2', 'b@example.com')], year: 2024 },
        // FI1/a returns; FI2 comes back with a different handler, so it is a different pair.
        {
          pairs: [pair('FI1', 'a@example.com'), pair('FI2', 'c@example.com'), pair('FI3', 'd@example.com')],
          year: 2025,
        },
      ])

      expect(records).toEqual(
        expect.arrayContaining([
          { count: 2, PK: 'RETENTION#2025', SK: 'new' },
          { count: 1, PK: 'RETENTION#2025', SK: 'returning' },
        ])
      )
    })

    it('writes nothing for the earliest year, which has nothing to compare against', () => {
      // Otherwise every pair would count as new and the chart would show a spike that is only
      // an artefact of where the data begins.
      const records = build([{ pairs: [pair('FI1', 'a@example.com')], year: 2024 }])

      expect(records).toEqual([])
    })

    it('writes nothing for a year whose predecessor had no events at all', () => {
      const records = build([
        { pairs: [pair('FI1', 'a@example.com')], year: 2023 },
        { pairs: [pair('FI1', 'a@example.com')], year: 2025 },
      ])

      expect(records.filter((r) => r.PK === 'RETENTION#2025')).toEqual([])
    })

    it('writes nothing for a year whose predecessor had events but no registration data', () => {
      // Event seeding creates the predecessor's yearlyStats entry with an empty pair set;
      // retention against it would be the same misleading "everyone is new" as the earliest year.
      const records = build([
        { pairs: [], year: 2024 },
        { pairs: [pair('FI1', 'a@example.com')], year: 2025 },
      ])

      expect(records.filter((r) => r.PK === 'RETENTION#2025')).toEqual([])
    })

    it('is classified as a participation record so the rebuild owns and re-creates it', () => {
      expect(getStatsRecordPartition({ PK: 'RETENTION#2025', SK: 'new' })).toBe('participation')
      expect(getEventStatsRecordYear({ PK: 'RETENTION#2025', SK: 'new' })).toBe(2025)
    })
  })
})
