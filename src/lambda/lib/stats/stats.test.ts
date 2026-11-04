import type { JsonEventType } from '../../../types'
import type { JsonCapacityStatsItem, RegistrationStatsInput } from '../../../types/Stats'
import type * as eventStatsRepository from '../repositories/eventStatsRepository'
import { vi } from 'vitest'

const mockReadOrganizerEventStats = vi.fn<typeof eventStatsRepository.readOrganizerEventStats>()
const mockReadAllOrganizerEventStats = vi.fn<typeof eventStatsRepository.readAllOrganizerEventStats>()
const mockReadYearlyTotals = vi.fn<typeof eventStatsRepository.readYearlyTotals>()
const mockReadRetention = vi.fn<typeof eventStatsRepository.readRetention>()
const mockReadYearlyBreakdown = vi.fn<typeof eventStatsRepository.readYearlyBreakdown>()
const mockReadBreedStarts = vi.fn<typeof eventStatsRepository.readBreedStarts>()
const mockReadBuckets = vi.fn<typeof eventStatsRepository.readBuckets>()
const mockReadStatsYears = vi.fn<typeof eventStatsRepository.readStatsYears>()
const mockReadCapacityStats = vi.fn<typeof eventStatsRepository.readCapacityStats>()
const mockReadJudgeWorkload = vi.fn<typeof eventStatsRepository.readJudgeWorkload>()
const mockReadEventBreakdown = vi.fn<typeof eventStatsRepository.readEventBreakdown>()

// The key builder is the real one; only the table access is replaced.
vi.doMock('../repositories/eventStatsRepository', async (importOriginal) => {
  const original = await importOriginal<typeof eventStatsRepository>()
  return {
    ...original,
    readAllOrganizerEventStats: mockReadAllOrganizerEventStats,
    readBreedStarts: mockReadBreedStarts,
    readBuckets: mockReadBuckets,
    readCapacityStats: mockReadCapacityStats,
    readEventBreakdown: mockReadEventBreakdown,
    readJudgeWorkload: mockReadJudgeWorkload,
    readOrganizerEventStats: mockReadOrganizerEventStats,
    readRetention: mockReadRetention,
    readStatsYears: mockReadStatsYears,
    readYearlyBreakdown: mockReadYearlyBreakdown,
    readYearlyTotals: mockReadYearlyTotals,
  }
})

const mockReadEventTypes = vi.fn<() => Promise<JsonEventType[]>>()
vi.doMock('../repositories/eventTypeRepository', () => ({
  readEventTypes: mockReadEventTypes,
}))

const {
  getOrganizerStats,
  getYearlyTotalStats,
  getAvailableYears,
  getDogHandlerBuckets,
  getDogsPerHandlerBuckets,
  getYearlyBreakdown,
  getBreedStartBreakdown,
  bucketForCount,
  hashStatValue,
  participationIdentifiers,
  eventStatsYear,
  getCapacityStats,
  getCapacityStatsAllEventTypes,
  getRetentionStats,
  getJudgeWorkload,
  getEventBreakdown,
} = await import('./stats')

describe('lib/stats/stats', () => {
  afterEach(() => {
    vi.resetAllMocks()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('eventStatsYear', () => {
    it('derives the year for a regular event date', () => {
      expect(eventStatsYear({ startDate: '2025-06-01' })).toBe(2025)
    })

    it('derives the year in the Finnish timezone', () => {
      expect(eventStatsYear({ startDate: '2025-12-31T23:30:00Z' })).toBe(2026)
    })

    it('returns undefined for an invalid date', () => {
      expect(eventStatsYear({ startDate: 'not-a-date' })).toBeUndefined()
    })
  })

  // Test moved from event.test.ts
  describe('getOrganizerStats', () => {
    const row = (organizerId: string, date: string) => ({
      cancelledRegistrations: 0,
      count: 1,
      date,
      eventId: 'e1',
      memberRegistrations: 0,
      organizerId,
      PK: `ORG#${organizerId}`,
      paidAmount: 0,
      paidRegistrations: 0,
      refundedAmount: 0,
      refundedRegistrations: 0,
      reserveRegistrations: 0,
      SK: `${date}#e1`,
      updatedAt: date,
    })

    it('reads each organizer given, with the range, and sorts the rows by date', async () => {
      mockReadOrganizerEventStats
        .mockResolvedValueOnce([row('org1', '2024-05-01')])
        .mockResolvedValueOnce([row('org2', '2024-02-01')])

      const result = await getOrganizerStats(['org1', 'org2'], '2024-01-01', '2024-12-31')

      expect(mockReadOrganizerEventStats).toHaveBeenCalledWith('org1', '2024-01-01', '2024-12-31')
      expect(mockReadOrganizerEventStats).toHaveBeenCalledWith('org2', '2024-01-01', '2024-12-31')
      expect(mockReadAllOrganizerEventStats).not.toHaveBeenCalled()
      expect(result.map((stats) => stats.organizerId)).toEqual(['org2', 'org1'])
    })

    it('gets all stats for admin users with the range', async () => {
      mockReadAllOrganizerEventStats.mockResolvedValueOnce([row('org1', '2024-02-01')])

      const result = await getOrganizerStats(undefined, '2024-01-01', '2024-12-31')

      expect(mockReadAllOrganizerEventStats).toHaveBeenCalledWith('2024-01-01', '2024-12-31')
      expect(result).toHaveLength(1)
      expect(result[0].organizerId).toBe('org1')
    })

    it('returns nothing without reading for an explicit empty organizer list', async () => {
      await expect(getOrganizerStats([])).resolves.toEqual([])

      expect(mockReadOrganizerEventStats).not.toHaveBeenCalled()
      expect(mockReadAllOrganizerEventStats).not.toHaveBeenCalled()
    })
  })
  describe('getYearlyTotalStats', () => {
    it('reads the year and names each total by its type', async () => {
      mockReadYearlyTotals.mockResolvedValueOnce([
        { count: 150, SK: 'dog' },
        { count: 100, SK: 'handler' },
        { count: 200, SK: 'dog#handler' },
      ])

      const result = await getYearlyTotalStats(2024)

      expect(mockReadYearlyTotals).toHaveBeenCalledWith(2024)
      expect(result).toEqual([
        { count: 150, type: 'dog', year: 2024 },
        { count: 100, type: 'handler', year: 2024 },
        { count: 200, type: 'dog#handler', year: 2024 },
      ])
    })

    it('handles empty results', async () => {
      mockReadYearlyTotals.mockResolvedValueOnce([])

      await expect(getYearlyTotalStats(2023)).resolves.toEqual([])
    })
  })

  describe('getAvailableYears', () => {
    it('reads the years as numbers in order', async () => {
      mockReadStatsYears.mockResolvedValueOnce([{ SK: '2023' }, { SK: '2022' }, { SK: '2024' }])

      await expect(getAvailableYears()).resolves.toEqual([2022, 2023, 2024])
    })

    it('handles empty results', async () => {
      mockReadStatsYears.mockResolvedValueOnce([])

      await expect(getAvailableYears()).resolves.toEqual([])
    })
  })

  describe('getDogHandlerBuckets', () => {
    it('reads the dog#handler buckets of the year', async () => {
      mockReadBuckets.mockResolvedValueOnce([
        { count: 50, SK: '1' },
        { count: 15, SK: '5-9' },
        { count: 5, SK: '10+' },
      ])

      const result = await getDogHandlerBuckets(2024)

      expect(mockReadBuckets).toHaveBeenCalledWith(2024, 'dog#handler')
      expect(result).toEqual([
        { bucket: '1', count: 50 },
        { bucket: '5-9', count: 15 },
        { bucket: '10+', count: 5 },
      ])
    })
  })

  describe('getDogsPerHandlerBuckets', () => {
    it('reads the dogsPerHandler buckets of the year', async () => {
      mockReadBuckets.mockResolvedValueOnce([
        { count: 50, SK: '1' },
        { count: 30, SK: '2' },
      ])

      const result = await getDogsPerHandlerBuckets(2024)

      expect(mockReadBuckets).toHaveBeenCalledWith(2024, 'dogsPerHandler')
      expect(result).toEqual([
        { bucket: '1', count: 50 },
        { bucket: '2', count: 30 },
      ])
    })
  })

  describe('getYearlyBreakdown', () => {
    it('reads the per-entity breakdown of the type', async () => {
      mockReadYearlyBreakdown.mockResolvedValueOnce([
        { count: 450, SK: 'NOU' },
        { count: 120, SK: 'NOME-B' },
      ])

      const result = await getYearlyBreakdown(2024, 'eventType')

      expect(mockReadYearlyBreakdown).toHaveBeenCalledWith(2024, 'eventType')
      expect(result).toEqual([
        { count: 450, entityId: 'NOU' },
        { count: 120, entityId: 'NOME-B' },
      ])
    })
  })

  describe('getBreedStartBreakdown', () => {
    it('reads starters/reserve per breed', async () => {
      mockReadBreedStarts.mockResolvedValueOnce([
        { reserve: 3, SK: '122', starters: 12 },
        { reserve: 1, SK: '111', starters: 5 },
      ])

      const result = await getBreedStartBreakdown(2024)

      expect(mockReadBreedStarts).toHaveBeenCalledWith(2024)
      expect(result).toEqual([
        { entityId: '122', reserve: 3, starters: 12 },
        { entityId: '111', reserve: 1, starters: 5 },
      ])
    })
  })

  describe('getJudgeWorkload', () => {
    const workload = (organizerId: string, judgeId: string, name: string, held: number, upcoming = 0) => ({
      held,
      judgeId,
      name,
      organizerId,
      PK: 'JUDGE#2024',
      SK: `${organizerId}#${judgeId}`,
      upcoming,
      updatedAt: '2025-01-01T00:00:00.000Z',
    })

    it('reads every organizer when none are given', async () => {
      mockReadJudgeWorkload.mockResolvedValueOnce([
        workload('org1', '1', 'Matti Meikäläinen', 12),
        workload('org1', 'Foreign Judge', 'Foreign Judge', 4),
      ])

      const result = await getJudgeWorkload(2024)

      expect(mockReadJudgeWorkload).toHaveBeenCalledWith(2024, undefined)
      expect(result).toEqual([
        { held: 12, judgeId: '1', name: 'Matti Meikäläinen', upcoming: 0 },
        { held: 4, judgeId: 'Foreign Judge', name: 'Foreign Judge', upcoming: 0 },
      ])
    })

    it('reads the organizers given and sums a judge who officiated for several of them', async () => {
      mockReadJudgeWorkload.mockResolvedValueOnce([
        workload('org1', '1', 'Matti Meikäläinen', 3),
        workload('org2', '1', 'Matti Meikäläinen', 2),
        workload('org2', '2', 'Maija Mallikas', 1),
      ])

      const result = await getJudgeWorkload(2024, ['org1', 'org2'])

      expect(mockReadJudgeWorkload).toHaveBeenCalledWith(2024, ['org1', 'org2'])
      expect(result).toEqual([
        { held: 5, judgeId: '1', name: 'Matti Meikäläinen', upcoming: 0 },
        { held: 1, judgeId: '2', name: 'Maija Mallikas', upcoming: 0 },
      ])
    })

    it('sums held and upcoming events separately for a judge of several organizers', async () => {
      mockReadJudgeWorkload.mockResolvedValueOnce([
        workload('org1', '1', 'Matti Meikäläinen', 2, 1),
        workload('org2', '1', 'Matti Meikäläinen', 1, 3),
      ])

      const result = await getJudgeWorkload(2024, ['org1', 'org2'])

      expect(result).toEqual([{ held: 3, judgeId: '1', name: 'Matti Meikäläinen', upcoming: 4 }])
    })

    it('returns nothing without reading for an explicit empty organizer list', async () => {
      const result = await getJudgeWorkload(2024, [])

      expect(result).toEqual([])
      expect(mockReadJudgeWorkload).not.toHaveBeenCalled()
    })
  })

  describe('getEventBreakdown', () => {
    it('reads events/places/starts/handlers per club + event type, zeroing missing counters', async () => {
      mockReadEventBreakdown.mockResolvedValueOnce([
        {
          eventCount: 5,
          eventType: 'NOU',
          handlerCount: 40,
          organizerId: 'organizer-1',
          PK: 'BREAKDOWN#2024',
          places: 100,
          SK: 'organizer-1#NOU',
          starters: 90,
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        {
          cancelledRegistrations: 4,
          eventCount: 8,
          eventType: 'ALL',
          handlerCount: 60,
          memberStarters: 50,
          organizerId: 'ALL',
          PK: 'BREAKDOWN#2024',
          places: 200,
          reserve: 6,
          SK: 'ALL#ALL',
          starters: 180,
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ])

      const result = await getEventBreakdown(2024)

      expect(mockReadEventBreakdown).toHaveBeenCalledWith(2024)
      expect(result).toEqual([
        {
          cancelledRegistrations: 0,
          eventCount: 5,
          eventType: 'NOU',
          handlerCount: 40,
          memberStarters: 0,
          organizerId: 'organizer-1',
          places: 100,
          reserve: 0,
          starters: 90,
        },
        {
          cancelledRegistrations: 4,
          eventCount: 8,
          eventType: 'ALL',
          handlerCount: 60,
          memberStarters: 50,
          organizerId: 'ALL',
          places: 200,
          reserve: 6,
          starters: 180,
        },
      ])
    })
  })

  describe('getCapacityStats', () => {
    const capacity = (eventType: string, organizerId: string, counts: Partial<JsonCapacityStatsItem>) => ({
      cancelledRegistrations: 0,
      eventCount: 0,
      organizerId,
      PK: `CAPACITY#${eventType}`,
      places: 0,
      reserve: 0,
      SK: `2025-06#ALO#${organizerId}`,
      starters: 0,
      updatedAt: '2025-07-01T00:00:00.000Z',
      ...counts,
    })

    it('returns an empty range without reading when from is after to', async () => {
      const result = await getCapacityStats('NOME-B', undefined, '2025-12', '2025-01')

      expect(result).toEqual([])
      expect(mockReadCapacityStats).not.toHaveBeenCalled()
    })

    it('reads every organizer without a range when from/to are omitted, summing them per month/class', async () => {
      mockReadCapacityStats.mockResolvedValueOnce([
        capacity('NOME-B', 'org-1', { cancelledRegistrations: 1, eventCount: 2, places: 20, reserve: 3, starters: 18 }),
        capacity('NOME-B', 'org-2', { eventCount: 1, places: 10, reserve: 1, starters: 9 }),
      ])

      const result = await getCapacityStats('NOME-B')

      expect(mockReadCapacityStats).toHaveBeenCalledWith('NOME-B', undefined, undefined, undefined)
      expect(result).toEqual([
        {
          cancelledRegistrations: 1,
          class: 'ALO',
          eventCount: 3,
          eventType: 'NOME-B',
          month: '2025-06',
          organizerId: '',
          places: 30,
          reserve: 4,
          starters: 27,
        },
      ])
    })

    it('reads one organizer and keeps its id on the result', async () => {
      mockReadCapacityStats.mockResolvedValueOnce([
        capacity('NOME-B', 'org-1', { cancelledRegistrations: 1, eventCount: 2, places: 20, reserve: 3, starters: 18 }),
      ])

      const result = await getCapacityStats('NOME-B', ['org-1'], '2025-01', '2025-06')

      expect(mockReadCapacityStats).toHaveBeenCalledWith('NOME-B', ['org-1'], '2025-01', '2025-06')
      expect(result).toEqual([
        {
          cancelledRegistrations: 1,
          class: 'ALO',
          eventCount: 2,
          eventType: 'NOME-B',
          month: '2025-06',
          organizerId: 'org-1',
          places: 20,
          reserve: 3,
          starters: 18,
        },
      ])
    })

    it('sums across several organizers and drops the now-meaningless organizer id', async () => {
      mockReadCapacityStats.mockResolvedValueOnce([
        capacity('NOME-B', 'org-1', { eventCount: 2, places: 20, starters: 18 }),
        capacity('NOME-B', 'org-2', { eventCount: 1, places: 10, starters: 9 }),
      ])

      const result = await getCapacityStats('NOME-B', ['org-1', 'org-2'])

      expect(result).toEqual([expect.objectContaining({ eventCount: 3, organizerId: '', places: 30, starters: 27 })])
    })

    it('returns nothing for an empty organizer list rather than reading every organizer', async () => {
      // A non-admin who belongs to no organization must not fall through to the nationwide total.
      const result = await getCapacityStats('NOME-B', [])

      expect(mockReadCapacityStats).not.toHaveBeenCalled()
      expect(result).toEqual([])
    })
  })

  describe('getCapacityStatsAllEventTypes', () => {
    const eventType = (eventType: string, active: boolean): JsonEventType => ({ active, eventType }) as JsonEventType

    it('sums capacity stats across every active event type, skipping inactive ones', async () => {
      mockReadEventTypes.mockResolvedValueOnce([
        eventType('NOME-A', true),
        eventType('NOME-B', true),
        eventType('RETIRED', false),
      ])
      const row = { cancelledRegistrations: 0, eventCount: 1, organizerId: 'org-1', reserve: 0 }
      const rest = { SK: '2025-06#ALO#org-1', updatedAt: '2025-07-01T00:00:00.000Z' }
      mockReadCapacityStats
        .mockResolvedValueOnce([{ ...row, ...rest, PK: 'CAPACITY#NOME-A', places: 20, starters: 18 }])
        .mockResolvedValueOnce([{ ...row, ...rest, PK: 'CAPACITY#NOME-B', places: 10, starters: 9 }])

      const result = await getCapacityStatsAllEventTypes()

      expect(mockReadEventTypes).toHaveBeenCalledTimes(1)
      expect(mockReadCapacityStats).toHaveBeenCalledTimes(2)
      expect(result).toEqual([
        expect.objectContaining({ eventType: 'NOME-A', places: 20, starters: 18 }),
        expect.objectContaining({ eventType: 'NOME-B', places: 10, starters: 9 }),
      ])
    })

    it('passes the from/to range through to each event type', async () => {
      mockReadEventTypes.mockResolvedValueOnce([eventType('NOU', true)])
      mockReadCapacityStats.mockResolvedValueOnce([])

      await getCapacityStatsAllEventTypes('2025-01', '2025-06')

      expect(mockReadCapacityStats).toHaveBeenCalledWith('NOU', undefined, '2025-01', '2025-06')
    })

    it('returns nothing when there are no active event types', async () => {
      mockReadEventTypes.mockResolvedValueOnce([eventType('RETIRED', false)])

      const result = await getCapacityStatsAllEventTypes()

      expect(mockReadCapacityStats).not.toHaveBeenCalled()
      expect(result).toEqual([])
    })
  })

  // Tests for previously untested functions
  describe('bucketForCount', () => {
    it('returns correct bucket for counts less than 5', () => {
      expect(bucketForCount(1)).toBe('1')
      expect(bucketForCount(2)).toBe('2')
      expect(bucketForCount(3)).toBe('3')
      expect(bucketForCount(4)).toBe('4')
    })

    it('returns 5-9 bucket for counts between 5 and 9', () => {
      expect(bucketForCount(5)).toBe('5-9')
      expect(bucketForCount(7)).toBe('5-9')
      expect(bucketForCount(9)).toBe('5-9')
    })

    it('returns 10+ bucket for counts 10 or greater', () => {
      expect(bucketForCount(10)).toBe('10+')
      expect(bucketForCount(15)).toBe('10+')
      expect(bucketForCount(100)).toBe('10+')
    })

    it('returns undefined for undefined input', () => {
      expect(bucketForCount(undefined)).toBeUndefined()
    })
  })

  describe('hashEmail', () => {
    it('should hash email addresses consistently', () => {
      const email = 'test@example.com'
      const hashed = hashStatValue(email)

      // Hash should be a base64 string (12 bytes of SHA-256)
      expect(hashed).toMatch(/^[A-Za-z0-9+/]{16}$/)

      // Same email should produce the same hash
      expect(hashStatValue(email)).toBe(hashed)
    })

    it('should normalize email addresses before hashing', () => {
      // Different casing and whitespace should produce the same hash
      const email1 = 'test@example.com'
      const email2 = 'TEST@example.com'
      const email3 = ' test@example.com '

      expect(hashStatValue(email1)).toBe(hashStatValue(email2))
      expect(hashStatValue(email1)).toBe(hashStatValue(email3))
    })

    it('should produce different hashes for different emails', () => {
      const email1 = 'test1@example.com'
      const email2 = 'test2@example.com'

      expect(hashStatValue(email1)).not.toBe(hashStatValue(email2))
    })
  })

  describe('participationIdentifiers', () => {
    it('composes all yearly statistic identifiers', () => {
      const dogRegNo = 'FI123'
      const handlerEmail = 'handler@example.com'
      const registration: RegistrationStatsInput = {
        cancelled: false,
        class: 'AVO',
        dog: { breedCode: '122', regNo: dogRegNo },
        eventId: 'event-id',
        eventType: 'NOU',
        handler: { email: handlerEmail, membership: false },
        id: 'registration-id',
        paidAmount: 0,
        refundAmount: 0,
      }
      const dog = hashStatValue(dogRegNo)
      const handler = hashStatValue(handlerEmail)

      expect(participationIdentifiers(registration)).toEqual({
        breed: '122',
        class: 'AVO',
        dog,
        'dog#handler': `${dog}#${handler}`,
        event: 'event-id',
        eventType: 'NOU',
        handler,
      })
    })

    it('uses stable fallback identifiers for missing participant details', () => {
      const registration = {
        cancelled: false,
        eventId: 'event-id',
        eventType: 'NOU',
        id: 'registration-id',
        paidAmount: 0,
        refundAmount: 0,
      }
      const emptyHash = hashStatValue()

      expect(participationIdentifiers(registration)).toEqual({
        breed: 'unknown',
        // No class on the registration: falls back to the event type, same as getRegistrationClass.
        class: 'NOU',
        dog: emptyHash,
        'dog#handler': `${emptyHash}#${emptyHash}`,
        event: 'event-id',
        eventType: 'NOU',
        handler: emptyHash,
      })
    })

    // A stored row can carry '' in breedCode, class or eventType from before those unions existed;
    // the types cannot express that, so the conversions below model the table row rather than
    // silence a real error.
    const storedRow = (row: object): RegistrationStatsInput => row as unknown as RegistrationStatsInput

    it('gives blank participant details the same bucket as missing ones, never an empty sort key', () => {
      const registration = storedRow({
        cancelled: false,
        class: ' ',
        dog: { breedCode: '', regNo: 'FI123' },
        eventId: 'event-id',
        eventType: '',
        id: 'registration-id',
        paidAmount: 0,
        refundAmount: 0,
      })

      const identifiers = participationIdentifiers(registration)

      expect(identifiers).toEqual(expect.objectContaining({ breed: 'unknown', class: 'unknown', eventType: 'unknown' }))
      expect(Object.values(identifiers)).not.toContain('')
    })

    it('falls back from a blank class to the event type', () => {
      const registration = storedRow({
        cancelled: false,
        class: '',
        eventId: 'e',
        eventType: 'NOU',
        id: 'r',
        paidAmount: 0,
        refundAmount: 0,
      })

      expect(participationIdentifiers(registration).class).toBe('NOU')
    })
  })

  describe('getRetentionStats', () => {
    it('reads the new/returning split for a year', async () => {
      mockReadRetention.mockResolvedValueOnce([
        { count: 40, SK: 'new' },
        { count: 160, SK: 'returning' },
      ])

      const result = await getRetentionStats(2025)

      expect(mockReadRetention).toHaveBeenCalledWith(2025)
      expect(result).toEqual({ new: 40, returning: 160, year: 2025 })
    })

    it('returns undefined when the year has no record, rather than a zeroed one', async () => {
      // The earliest year on record has nothing to compare against; zeros would read as
      // "nobody returned" instead of "unknown".
      mockReadRetention.mockResolvedValueOnce([])

      await expect(getRetentionStats(2019)).resolves.toBeUndefined()
    })

    it('counts a side the year has no row for as zero', async () => {
      mockReadRetention.mockResolvedValueOnce([{ count: 40, SK: 'new' }])

      await expect(getRetentionStats(2025)).resolves.toEqual({ new: 40, returning: 0, year: 2025 })
    })
  })
})
