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
    [{ PK: 'OTHER#2025', SK: 'id' }, undefined],
    [{ PK: 'YEARS', SK: 'not-a-year' }, undefined],
    [{ PK: 'ORG#organizer', SK: 'not-a-date#event' }, undefined],
    [{ PK: 'CAPACITY#NOME-B', SK: '2025-06#ALO' }, 2025],
    [{ PK: 'CAPACITY#NOU', SK: 'not-a-month#NOU' }, undefined],
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
      projection: 'id, organizer, startDate, eventType, classes, places, #state',
      table: 'event-table',
    })
    expect(mockReadAll).toHaveBeenNthCalledWith(2, {
      names: { '#class': 'class', '#group': 'group', '#handler': 'handler', '#key': 'key', '#owner': 'owner' },
      projection:
        'eventId, id, cancelled, paidAmount, refundAmount, eventType, dog.regNo, dog.breedCode, #handler.email, #owner.email, #class, #group.#key',
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
      [{ PK: 'STAT#2025#dog', SK: 'FI12345' }, 'participation'],
      [{ PK: 'TOTALS#2025', SK: 'dog' }, 'participation'],
      [{ PK: 'BUCKETS#2025#dog#handler', SK: '1' }, 'participation'],
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

    it('is classified as a participation record so the rebuild owns and re-creates it', () => {
      expect(getStatsRecordPartition({ PK: 'RETENTION#2025', SK: 'new' })).toBe('participation')
      expect(getEventStatsRecordYear({ PK: 'RETENTION#2025', SK: 'new' })).toBe(2025)
    })
  })
})
