import type { JsonStationTurn } from '../../../types'
import { vi } from 'vitest'
import { jsonEmptyEvent } from '../../../__mockData__/emptyEvent'

const mockRead = vi.fn()
const mockReadAll = vi.fn()
const mockQuery = vi.fn()
const mockUpdate = vi.fn()
const mockWrite = vi.fn()
const mockConstructor = vi.fn()

vi.doMock('../../config', () => ({
  CONFIG: { eventTable: 'event-table' },
}))

vi.doMock('../../utils/CustomDynamoClient', () => ({
  default: class MockCustomDynamoClient {
    constructor(table: string) {
      mockConstructor(table)
    }
    read = (...args: unknown[]) => mockRead(...args)
    readAll = (...args: unknown[]) => mockReadAll(...args)
    query = (...args: unknown[]) => mockQuery(...args)
    update = (...args: unknown[]) => mockUpdate(...args)
    write = (...args: unknown[]) => mockWrite(...args)
  },
}))

const {
  clearWorkflowLock,
  findEventIdsByKcGuid,
  findEventIdsByKcId,
  readAllEvents,
  readEvent,
  readEventsForStats,
  readLastEntryEndBefore,
  readOrganizerEvents,
  readPublicSeasonEvents,
  readSeasonEvents,
  readSeasonEventsUpdatedSince,
  restoreKcState,
  writeEvent,
  writeEventFields,
  writeKcGuidLink,
  writeKcStateLock,
  writeKcStateReading,
  writeMigratedEvent,
  writeResultsPublished,
  writeStationTurns,
  writeWorkflowLock,
} = await import('./eventRepository')

const event = { ...jsonEmptyEvent, id: 'event-1' }

describe('eventRepository', () => {
  beforeEach(() => {
    mockRead.mockReset()
    mockReadAll.mockReset()
    mockQuery.mockReset()
    mockUpdate.mockReset()
    mockWrite.mockReset()
  })

  it('opens its client on the event table', () => {
    expect(mockConstructor).toHaveBeenCalledWith('event-table')
    expect(mockConstructor).toHaveBeenCalledTimes(1)
  })

  describe('reads', () => {
    it('readEvent reads the event by id, eventually consistent unless asked', async () => {
      mockRead.mockResolvedValueOnce(event).mockResolvedValueOnce(undefined)

      await expect(readEvent('event-1')).resolves.toEqual(event)
      await expect(readEvent('event-2', true)).resolves.toBeUndefined()

      expect(mockRead).toHaveBeenNthCalledWith(1, { id: 'event-1' }, 'event-table', false)
      expect(mockRead).toHaveBeenNthCalledWith(2, { id: 'event-2' }, 'event-table', true)
    })

    it('readAllEvents scans the table and answers an empty list for nothing', async () => {
      mockReadAll.mockResolvedValueOnce([event]).mockResolvedValueOnce(undefined)

      await expect(readAllEvents()).resolves.toEqual([event])
      await expect(readAllEvents()).resolves.toEqual([])
      expect(mockReadAll).toHaveBeenCalledWith({ table: 'event-table' })
    })

    it('readEventsForStats reads only the fields the stats count from', async () => {
      mockReadAll.mockResolvedValueOnce([event])

      await expect(readEventsForStats()).resolves.toEqual([event])
      expect(mockReadAll).toHaveBeenCalledWith({
        names: { '#state': 'state' },
        projection: 'id, organizer, startDate, endDate, eventType, classes, places, #state, judges',
        table: 'event-table',
      })
    })

    it('findEventIdsByKcId and findEventIdsByKcGuid scan for the link and read only the ids', async () => {
      mockReadAll.mockResolvedValueOnce([{ id: 'a' }]).mockResolvedValueOnce([{ id: 'b' }])

      await expect(findEventIdsByKcId(123)).resolves.toEqual([{ id: 'a' }])
      await expect(findEventIdsByKcGuid('guid-1')).resolves.toEqual([{ id: 'b' }])

      expect(mockReadAll).toHaveBeenNthCalledWith(1, {
        filter: 'kcId = :kcId',
        projection: 'id',
        table: 'event-table',
        values: { ':kcId': 123 },
      })
      expect(mockReadAll).toHaveBeenNthCalledWith(2, {
        filter: 'kcGuid = :kcGuid',
        projection: 'id',
        table: 'event-table',
        values: { ':kcGuid': 'guid-1' },
      })
    })

    it('readLastEntryEndBefore asks the entry end index for the latest one before the day', async () => {
      const previous = { entryEndDate: '2024-08-20T20:59:59.999Z', id: 'previous' }
      mockQuery.mockResolvedValueOnce([previous]).mockResolvedValueOnce(undefined)

      await expect(readLastEntryEndBefore('NOME-B SM', '2025-03-22T17:00:00.000Z')).resolves.toEqual(previous)
      await expect(readLastEntryEndBefore('NOME-B SM', '2025-03-22T17:00:00.000Z')).resolves.toBeUndefined()

      expect(mockQuery).toHaveBeenCalledWith({
        forward: false,
        index: 'gsiEventTypeEntryEndDate',
        key: 'eventType = :eventType AND entryEndDate < :entryEndDate',
        limit: 1,
        table: 'event-table',
        values: { ':entryEndDate': '2025-03-22T17:00:00.000Z', ':eventType': 'NOME-B SM' },
      })
    })

    it('readPublicSeasonEvents queries the season by start date and leaves the drafts out', async () => {
      mockQuery.mockResolvedValueOnce([event])

      await expect(readPublicSeasonEvents('2026', '2026-12-31T21:59:59.999Z')).resolves.toEqual([event])
      expect(mockQuery).toHaveBeenCalledWith({
        filterExpression: '#state <> :draft',
        index: 'gsiSeasonStartDate',
        key: 'season = :season AND startDate <= :endDate',
        names: { '#state': 'state' },
        table: 'event-table',
        values: { ':draft': 'draft', ':endDate': '2026-12-31T21:59:59.999Z', ':season': '2026' },
      })
    })

    it('readSeasonEvents and readSeasonEventsUpdatedSince query the season indexes', async () => {
      mockQuery.mockResolvedValueOnce([event]).mockResolvedValueOnce([])

      await expect(readSeasonEvents(2026)).resolves.toEqual([event])
      await expect(readSeasonEventsUpdatedSince(2025, '2025-06-01T00:00:00.000Z')).resolves.toEqual([])

      expect(mockQuery).toHaveBeenNthCalledWith(1, {
        index: 'gsiSeasonStartDate',
        key: 'season = :season',
        table: 'event-table',
        values: { ':season': '2026' },
      })
      expect(mockQuery).toHaveBeenNthCalledWith(2, {
        index: 'gsiSeasonUpdatedAt',
        key: 'season = :season AND updatedAt >= :updatedAfter',
        table: 'event-table',
        values: { ':season': '2025', ':updatedAfter': '2025-06-01T00:00:00.000Z' },
      })
    })

    it('readOrganizerEvents queries the organizer index', async () => {
      mockQuery.mockResolvedValueOnce([event])

      await expect(readOrganizerEvents('org-1')).resolves.toEqual([event])
      expect(mockQuery).toHaveBeenCalledWith({
        index: 'gsiOrganizerStartDate',
        key: 'organizerId = :organizerId',
        table: 'event-table',
        values: { ':organizerId': 'org-1' },
      })
    })
  })

  describe('writes', () => {
    it('writeEvent puts the whole row', async () => {
      await writeEvent(event)
      expect(mockWrite).toHaveBeenCalledWith(event, 'event-table')
    })

    it('writeEventFields updates the fields with no condition', async () => {
      await writeEventFields('event-1', { remove: ['note'], set: { name: 'Uusi' } })
      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { remove: ['note'], set: { name: 'Uusi' } },
        'event-table'
      )
    })

    it('writeWorkflowLock takes a lock nobody holds, or one that has expired', async () => {
      await writeWorkflowLock('event-1', 'registrationGroupsLock', 'token-1', 1000, 91_000)

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { registrationGroupsLock: { expiresAt: 91_000, token: 'token-1' } } },
        'event-table',
        undefined,
        {
          expression:
            'attribute_exists(#id) AND (attribute_not_exists(#registrationGroupsLock) OR #registrationGroupsLock.#expiresAt < :now)',
          names: { '#expiresAt': 'expiresAt', '#id': 'id', '#registrationGroupsLock': 'registrationGroupsLock' },
          values: { ':now': 1000 },
        }
      )
    })

    it('clearWorkflowLock removes only the lock its token took', async () => {
      await clearWorkflowLock('event-1', 'registrationPaymentsLock', 'token-1')

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { remove: ['registrationPaymentsLock'] },
        'event-table',
        undefined,
        {
          expression: '#registrationPaymentsLock.#token = :token',
          names: { '#registrationPaymentsLock': 'registrationPaymentsLock', '#token': 'token' },
          values: { ':token': 'token-1' },
        }
      )
    })

    it('lets a failed condition through to the caller, which decides what it means', async () => {
      const failure = Object.assign(new Error('failed'), { name: 'ConditionalCheckFailedException' })
      mockUpdate.mockRejectedValueOnce(failure).mockRejectedValueOnce(failure)

      await expect(writeWorkflowLock('event-1', 'registrationGroupsLock', 'token-1', 1, 2)).rejects.toBe(failure)
      await expect(clearWorkflowLock('event-1', 'registrationGroupsLock', 'token-1')).rejects.toBe(failure)
    })
  })

  describe('writeResultsPublished', () => {
    const updatedAt = '2026-09-13T15:00:00.000Z'

    it('writes only the class entry of a stored map, held to the entry it was folded from (KOE-1510)', async () => {
      mockUpdate.mockResolvedValueOnce({
        Attributes: { resultsPublished: { ALO: ['2026-09-12', '2026-09-13'], AVO: true } },
      })

      await expect(
        writeResultsPublished(
          'event-1',
          'ALO',
          { ALO: ['2026-09-12'] },
          { ALO: ['2026-09-12', '2026-09-13'] },
          updatedAt
        )
      ).resolves.toEqual({ ALO: ['2026-09-12', '2026-09-13'], AVO: true })

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { 'resultsPublished.ALO': ['2026-09-12', '2026-09-13'], updatedAt } },
        'event-table',
        'ALL_NEW',
        {
          expression: 'attribute_exists(#id) AND #resultsPublished.#resultsClass = :foldedFrom',
          names: { '#id': 'id', '#resultsClass': 'ALO', '#resultsPublished': 'resultsPublished' },
          values: { ':foldedFrom': ['2026-09-12'] },
        }
      )
    })

    it('holds a class missing from the map to still being missing', async () => {
      // An entry never written is absent, not false: a condition on false would never hold.
      mockUpdate.mockResolvedValueOnce({ Attributes: {} })

      await expect(
        writeResultsPublished(
          'event-1',
          'AVO',
          { ALO: ['2026-09-12'] },
          { ALO: ['2026-09-12'], AVO: ['2026-09-12'] },
          updatedAt
        )
      ).resolves.toBeUndefined()

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { 'resultsPublished.AVO': ['2026-09-12'], updatedAt } },
        'event-table',
        'ALL_NEW',
        {
          expression: 'attribute_exists(#id) AND attribute_not_exists(#resultsPublished.#resultsClass)',
          names: { '#id': 'id', '#resultsClass': 'AVO', '#resultsPublished': 'resultsPublished' },
        }
      )
    })

    it.each([
      { eventClass: 'ALO' as const, name: 'a flag that is not yet a map', next: { ALO: ['2026-09-12'] }, stored: true },
      { eventClass: undefined, name: "a classless event's flag", next: ['2026-09-12'], stored: false },
    ])('writes $name whole, held to the flag as read', async ({ eventClass, next, stored }) => {
      mockUpdate.mockResolvedValueOnce({ Attributes: { resultsPublished: next } })

      await expect(writeResultsPublished('event-1', eventClass, stored, next, updatedAt)).resolves.toEqual(next)

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { resultsPublished: next, updatedAt } },
        'event-table',
        'ALL_NEW',
        {
          expression: 'attribute_exists(#id) AND #resultsPublished = :foldedFrom',
          names: { '#id': 'id', '#resultsPublished': 'resultsPublished' },
          values: { ':foldedFrom': stored },
        }
      )
    })

    it('holds a flag never written to still being missing', async () => {
      mockUpdate.mockResolvedValueOnce({})

      await expect(writeResultsPublished('event-1', undefined, undefined, true, updatedAt)).resolves.toBeUndefined()

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { resultsPublished: true, updatedAt } },
        'event-table',
        'ALL_NEW',
        {
          expression: 'attribute_exists(#id) AND attribute_not_exists(#resultsPublished)',
          names: { '#id': 'id', '#resultsPublished': 'resultsPublished' },
        }
      )
    })
  })

  describe('the Kennel Club state (KOE-1140)', () => {
    const state = { code: 1253, name: 'Ylituomarin hyväksyttäväksi', readAt: '2026-09-26T10:00:00.000Z' }

    it('writeKcStateReading writes on condition that no newer reading is stored and no fresh lock is lifted', async () => {
      await writeKcStateReading('event-1', state, '2026-09-26T09:59:30.000Z', 1253, state.readAt)

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { kcState: state, updatedAt: state.readAt } },
        'event-table',
        'NONE',
        {
          expression:
            'attribute_exists(#id) AND (attribute_not_exists(#kcState) OR (#kcState.#readAt <= :readAt AND (:code = :handedOver OR #kcState.#code <> :handedOver OR #kcState.#readAt <= :freshAfter)))',
          names: { '#code': 'code', '#id': 'id', '#kcState': 'kcState', '#readAt': 'readAt' },
          values: {
            ':code': 1253,
            ':freshAfter': '2026-09-26T09:59:30.000Z',
            ':handedOver': 1253,
            ':readAt': state.readAt,
          },
        }
      )
    })

    it('writeKcStateLock takes the lock only where no handed-over state is stored and no newer reading is', async () => {
      await writeKcStateLock('event-1', state, 1253)

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { kcState: state, updatedAt: state.readAt } },
        'event-table',
        'NONE',
        {
          expression:
            'attribute_exists(#id) AND (attribute_not_exists(#kcState) OR (#kcState.#code <> :handedOver AND #kcState.#readAt <= :readAt))',
          names: { '#code': 'code', '#id': 'id', '#kcState': 'kcState', '#readAt': 'readAt' },
          values: { ':handedOver': 1253, ':readAt': state.readAt },
        }
      )
    })

    it('restoreKcState gives the state back only while the stored one is the lock read at the time', async () => {
      const restored = { code: 754, name: 'Hyväksytty', readAt: '2026-09-26T10:00:05.000Z' }

      await restoreKcState('event-1', restored, state.readAt, restored.readAt)

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { kcState: restored, updatedAt: restored.readAt } },
        'event-table',
        'NONE',
        {
          expression: 'attribute_exists(#id) AND #kcState.#readAt = :lockedAt',
          names: { '#id': 'id', '#kcState': 'kcState', '#readAt': 'readAt' },
          values: { ':lockedAt': state.readAt },
        }
      )
    })

    it('writeKcGuidLink links only an event that has no link', async () => {
      await writeKcGuidLink('event-1', 'guid-1', '2026-09-26T10:00:00.000Z')

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { kcGuid: 'guid-1', updatedAt: '2026-09-26T10:00:00.000Z' } },
        'event-table',
        'NONE',
        {
          expression: 'attribute_exists(#id) AND attribute_not_exists(#kcGuid)',
          names: { '#id': 'id', '#kcGuid': 'kcGuid' },
        }
      )
    })
  })

  describe('writeStationTurns', () => {
    const turn: JsonStationTurn = {
      dogs: [],
      id: 'turn-1',
      registrationIds: [],
      startedAt: '2026-09-26T10:00:00.000Z',
      stationId: '1',
    }

    it('holds the write to the timeline it was derived from', async () => {
      await writeStationTurns('event-1', [turn], [turn, { ...turn, id: 'turn-2' }], '2026-09-26T10:05:00.000Z')

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { turns: [turn, { ...turn, id: 'turn-2' }], updatedAt: '2026-09-26T10:05:00.000Z' } },
        'event-table',
        undefined,
        { expression: '#turns = :expected', names: { '#turns': 'turns' }, values: { ':expected': [turn] } }
      )
    })

    it('holds the first timeline to there being none', async () => {
      await writeStationTurns('event-1', undefined, [turn], '2026-09-26T10:05:00.000Z')

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { turns: [turn], updatedAt: '2026-09-26T10:05:00.000Z' } },
        'event-table',
        undefined,
        { expression: 'attribute_not_exists(#turns)', names: { '#turns': 'turns' } }
      )
    })
  })

  describe('writeMigratedEvent', () => {
    it('lands only on a row that still exists and still has the updatedAt it was read with', async () => {
      await writeMigratedEvent('event-1', { set: { season: '2026' } }, '2026-01-01T00:00:00.000Z')

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { season: '2026' } },
        'event-table',
        undefined,
        {
          expression: 'attribute_exists(#id) AND #updatedAt = :foldedFrom',
          names: { '#id': 'id', '#updatedAt': 'updatedAt' },
          values: { ':foldedFrom': '2026-01-01T00:00:00.000Z' },
        }
      )
    })

    it('holds a row read without updatedAt to still having none', async () => {
      await writeMigratedEvent('event-1', { remove: ['old'], set: { season: '2026' } }, undefined)

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { remove: ['old'], set: { season: '2026' } },
        'event-table',
        undefined,
        {
          expression: 'attribute_exists(#id) AND attribute_not_exists(#updatedAt)',
          names: { '#id': 'id', '#updatedAt': 'updatedAt' },
        }
      )
    })
  })
})
