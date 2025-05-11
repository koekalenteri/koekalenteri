import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import type CustomDynamoClient from '../utils/CustomDynamoClient'

import { jest } from '@jest/globals'

const mockQuery = jest.fn<any>()
const mockRead = jest.fn<any>()
const mockUpdate = jest.fn<CustomDynamoClient['update']>()
const mockWrite = jest.fn<any>()
const mockReadAll = jest.fn<any>()

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    query: mockQuery,
    read: mockRead,
    update: mockUpdate,
    write: mockWrite,
    readAll: mockReadAll,
  })),
}))

const {
  updateEventStatsForRegistration,
  getOrganizerStats,
  getYearlyTotalStats,
  getAvailableYears,
  getDogHandlerBuckets,
  calculateStatDeltas,
  bucketForCount,
  updateOrganizerEventStats,
  updateYearRecord,
  updateBucketStats,
  updateEntityStats,
  updateYearlyParticipationStats,
} = await import('./stats')

describe('lib/stats', () => {
  afterEach(() => jest.clearAllMocks())
  // Test moved from event.test.ts
  describe('updateEventStatsForRegistration', () => {
    it('calls update with correct keys and values', async () => {
      const reg = { paidAmount: 10, cancelled: false, refundAmount: 0 } as JsonRegistration
      const event = {
        organizer: { id: 'org1' },
        id: 'e5',
        startDate: '2024-01-01',
        endDate: '2024-01-02',
      } as JsonConfirmedEvent

      await updateEventStatsForRegistration(reg, undefined, event)

      // First call should update the organizer event stats
      expect(mockUpdate).toHaveBeenNthCalledWith(
        1,
        { PK: 'ORG#org1', SK: '2024-01-01#e5' },
        {
          set: {
            organizerId: 'org1',
            date: '2024-01-01',
            updatedAt: expect.any(String),
          },
          add: {
            count: 1,
            paidRegistrations: 1,
            cancelledRegistrations: 0,
            refundedRegistrations: 0,
            paidAmount: 10,
            refundedAmount: 0,
          },
        }
      )

      // Second call should add the year to the YEARS record
      expect(mockUpdate).toHaveBeenNthCalledWith(
        2,
        { PK: 'YEARS', SK: '2024' },
        {
          set: {
            updatedAt: expect.any(String),
          },
        }
      )
    })

    it('handles updates with existing registration', async () => {
      const existingReg = { paidAmount: 5, cancelled: false, refundAmount: 0 } as JsonRegistration
      const updatedReg = { paidAmount: 10, cancelled: true, refundAmount: 2 } as JsonRegistration
      const event = {
        organizer: { id: 'org1' },
        id: 'e5',
        startDate: '2024-01-01',
        endDate: '2024-01-02',
      } as JsonConfirmedEvent

      await updateEventStatsForRegistration(updatedReg, existingReg, event)

      // First call should update the organizer event stats
      expect(mockUpdate).toHaveBeenNthCalledWith(
        1,
        { PK: 'ORG#org1', SK: '2024-01-01#e5' },
        {
          set: {
            organizerId: 'org1',
            date: '2024-01-01',
            updatedAt: expect.any(String),
          },
          add: {
            count: 0,
            paidRegistrations: 0,
            cancelledRegistrations: 1,
            refundedRegistrations: 1,
            paidAmount: 5,
            refundedAmount: 2,
          },
        }
      )

      // Second call should add the year to the YEARS record
      expect(mockUpdate).toHaveBeenNthCalledWith(
        2,
        { PK: 'YEARS', SK: '2024' },
        {
          set: {
            updatedAt: expect.any(String),
          },
        }
      )
    })
  })
  describe('getOrganizerStats', () => {
    it('queries for specific organizer stats with date filters', async () => {
      const organizerIds = ['org1']
      const from = '2024-01-01'
      const to = '2024-12-31'

      mockQuery.mockResolvedValueOnce([{ organizerId: 'org1', eventId: 'e1', count: 10 }])

      const result = await getOrganizerStats(organizerIds, from, to)

      expect(mockQuery).toHaveBeenCalledWith(
        '#pk = :pk',
        { ':pk': 'ORG#org1', ':from': from, ':to': to },
        undefined,
        undefined,
        { '#pk': 'PK' },
        undefined,
        undefined,
        'SK >= :from AND SK <= :to'
      )

      expect(result).toHaveLength(1)
      expect(result[0].organizerId).toBe('org1')
    })

    it('gets all stats for admin users with date filters', async () => {
      const from = '2024-01-01'
      const to = '2024-12-31'

      const mockStats = [
        {
          PK: 'ORG#org1',
          SK: '2024-02-01#e1',
          organizerId: 'org1',
          count: 10,
        },
      ]

      // Mock the readAll response
      mockReadAll.mockResolvedValueOnce(mockStats)

      const result = await getOrganizerStats(undefined, from, to)

      // Verify readAll is called with the correct filter parameters
      expect(mockReadAll).toHaveBeenCalledWith(
        undefined,
        'begins_with(#pk, :orgPrefix) AND SK >= :from AND SK <= :to',
        {
          ':orgPrefix': 'ORG#',
          ':from': from,
          ':to': to,
        },
        { '#pk': 'PK' }
      )

      expect(result).toHaveLength(1)
      expect(result[0].organizerId).toBe('org1')
    })
  })
  describe('getYearlyTotalStats', () => {
    it('queries for yearly total stats with correct key', async () => {
      const year = 2024

      mockQuery.mockResolvedValueOnce([
        { SK: 'dog', count: 150 },
        { SK: 'handler', count: 100 },
        { SK: 'dog#handler', count: 200 },
      ])

      const result = await getYearlyTotalStats(year)

      expect(mockQuery).toHaveBeenCalledWith('PK = :pk', { ':pk': 'TOTALS#2024' })

      expect(result).toHaveLength(3)
      expect(result).toEqual([
        { year: 2024, type: 'dog', count: 150 },
        { year: 2024, type: 'handler', count: 100 },
        { year: 2024, type: 'dog#handler', count: 200 },
      ])
    })

    it('handles empty results', async () => {
      mockQuery.mockResolvedValueOnce(null)

      const result = await getYearlyTotalStats(2023)

      expect(result).toEqual([])
    })
  })

  describe('getAvailableYears', () => {
    it('queries for available years', async () => {
      mockQuery.mockResolvedValueOnce([
        { SK: '2022', updatedAt: '2022-12-31T23:59:59.999Z' },
        { SK: '2023', updatedAt: '2023-12-31T23:59:59.999Z' },
        { SK: '2024', updatedAt: '2024-05-11T12:00:00.000Z' },
      ])

      const result = await getAvailableYears()

      expect(mockQuery).toHaveBeenCalledWith('PK = :pk', { ':pk': 'YEARS' })

      expect(result).toHaveLength(3)
      expect(result).toEqual([2022, 2023, 2024])
    })

    it('handles empty results', async () => {
      mockQuery.mockResolvedValueOnce(null)

      const result = await getAvailableYears()

      expect(result).toEqual([])
    })
  })

  describe('getDogHandlerBuckets', () => {
    it('queries for dog#handler buckets with correct key', async () => {
      const year = 2024

      mockQuery.mockResolvedValueOnce([
        { SK: '1', count: 50 },
        { SK: '2', count: 30 },
        { SK: '3', count: 20 },
        { SK: '5-9', count: 15 },
        { SK: '10+', count: 5 },
      ])

      const result = await getDogHandlerBuckets(year)

      expect(mockQuery).toHaveBeenCalledWith('PK = :pk', { ':pk': 'BUCKETS#2024#dog#handler' })

      expect(result).toHaveLength(5)
      expect(result).toEqual([
        { bucket: '1', count: 50 },
        { bucket: '2', count: 30 },
        { bucket: '3', count: 20 },
        { bucket: '5-9', count: 15 },
        { bucket: '10+', count: 5 },
      ])
    })

    it('handles empty results', async () => {
      mockQuery.mockResolvedValueOnce(null)

      const result = await getDogHandlerBuckets(2023)

      expect(result).toEqual([])
    })
  })

  // Tests for previously untested functions
  describe('calculateStatDeltas', () => {
    it('calculates correct deltas for new registration', () => {
      const registration = {
        paidAmount: 50,
        cancelled: false,
        refundAmount: 0,
      } as JsonRegistration

      const deltas = calculateStatDeltas(registration, undefined)

      expect(deltas).toEqual({
        totalDelta: 1,
        paidDelta: 1,
        cancelledDelta: 0,
        refundedDelta: 0,
        paidAmountDelta: 50,
        refundedAmountDelta: 0,
      })
    })

    it('calculates correct deltas for updated registration', () => {
      const existingRegistration = {
        paidAmount: 50,
        cancelled: false,
        refundAmount: 0,
      } as JsonRegistration

      const updatedRegistration = {
        paidAmount: 50,
        cancelled: true,
        refundAmount: 25,
      } as JsonRegistration

      const deltas = calculateStatDeltas(updatedRegistration, existingRegistration)

      expect(deltas).toEqual({
        totalDelta: 0,
        paidDelta: 0,
        cancelledDelta: 1,
        refundedDelta: 1,
        paidAmountDelta: 0,
        refundedAmountDelta: 25,
      })
    })

    it('handles null values correctly', () => {
      const existingRegistration = {
        paidAmount: null,
        cancelled: false,
        refundAmount: null,
      } as unknown as JsonRegistration

      const updatedRegistration = {
        paidAmount: 50,
        cancelled: false,
        refundAmount: null,
      } as unknown as JsonRegistration

      const deltas = calculateStatDeltas(updatedRegistration, existingRegistration)

      expect(deltas).toEqual({
        totalDelta: 0,
        paidDelta: 1,
        cancelledDelta: 0,
        refundedDelta: 0,
        paidAmountDelta: 50,
        refundedAmountDelta: 0,
      })
    })
  })

  describe('updateOrganizerEventStats', () => {
    it('calls update with correct parameters', async () => {
      const event = {
        organizer: { id: 'org123' },
        id: 'event456',
        startDate: '2024-06-15',
      } as JsonConfirmedEvent

      const deltas = {
        totalDelta: 1,
        paidDelta: 1,
        cancelledDelta: 0,
        refundedDelta: 0,
        paidAmountDelta: 50,
        refundedAmountDelta: 0,
      }

      await updateOrganizerEventStats(event, deltas)

      expect(mockUpdate).toHaveBeenCalledWith(
        { PK: 'ORG#org123', SK: '2024-06-15#event456' },
        {
          set: {
            organizerId: 'org123',
            date: '2024-06-15',
            updatedAt: expect.any(String),
          },
          add: {
            count: 1,
            paidRegistrations: 1,
            cancelledRegistrations: 0,
            refundedRegistrations: 0,
            paidAmount: 50,
            refundedAmount: 0,
          },
        }
      )
    })
  })

  describe('updateYearRecord', () => {
    it('calls update with correct parameters', async () => {
      await updateYearRecord(2024)

      expect(mockUpdate).toHaveBeenCalledWith(
        { PK: 'YEARS', SK: '2024' },
        {
          set: {
            updatedAt: expect.any(String),
          },
        }
      )
    })
  })

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

  describe('updateBucketStats', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    it('decrements old bucket and increments new bucket when bucket changes', async () => {
      await updateBucketStats(2024, 2, 6)

      // Should decrement the '2' bucket
      expect(mockUpdate).toHaveBeenNthCalledWith(
        1,
        { PK: 'BUCKETS#2024#dog#handler', SK: '2' },
        {
          add: {
            count: -1,
          },
        }
      )

      // Should increment the '5-9' bucket
      expect(mockUpdate).toHaveBeenNthCalledWith(
        2,
        { PK: 'BUCKETS#2024#dog#handler', SK: '5-9' },
        {
          add: {
            count: 1,
          },
        }
      )
    })

    it('only increments new bucket when old count is undefined', async () => {
      // @ts-expect-error partoal return value
      mockUpdate.mockResolvedValueOnce({ Attributes: { count: undefined } })

      await updateBucketStats(2024, undefined, 3)

      // Should only increment the '3' bucket
      expect(mockUpdate).toHaveBeenCalledTimes(1)
      expect(mockUpdate).toHaveBeenCalledWith(
        { PK: 'BUCKETS#2024#dog#handler', SK: '3' },
        {
          add: {
            count: 1,
          },
        }
      )
    })

    it('does nothing when bucket does not change', async () => {
      await updateBucketStats(2024, 5, 6)

      // Both are in the same bucket, so no updates should happen
      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })

  describe('updateEntityStats', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    it('updates entity stats and increments total for new entity', async () => {
      await updateEntityStats(2024, 'dog', 'DOG123', false)

      // First call should update the entity count
      expect(mockUpdate).toHaveBeenNthCalledWith(
        1,
        { PK: 'STAT#2024#dog', SK: 'DOG123' },
        {
          add: {
            count: 1,
          },
        },
        undefined,
        'UPDATED_OLD'
      )

      // Second call should increment the total count for this type
      expect(mockUpdate).toHaveBeenNthCalledWith(
        2,
        { PK: 'TOTALS#2024', SK: 'dog' },
        {
          add: {
            count: 1,
          },
        }
      )
    })

    it('updates dog#handler entity stats and bucket stats', async () => {
      // Reset the mock implementation to simulate an existing entity
      // @ts-expect-error partoal return value
      mockUpdate.mockResolvedValueOnce({ Attributes: { count: 2 } })

      await updateEntityStats(2024, 'dog#handler', 'DOG123#HANDLER456', true)

      // First call should update the entity count
      expect(mockUpdate).toHaveBeenNthCalledWith(
        1,
        { PK: 'STAT#2024#dog#handler', SK: 'DOG123#HANDLER456' },
        {
          add: {
            count: 1,
          },
        },
        undefined,
        'UPDATED_OLD'
      )

      // Should call updateBucketStats with oldCount=2, newCount=3
      expect(mockUpdate).toHaveBeenNthCalledWith(
        2,
        { PK: 'BUCKETS#2024#dog#handler', SK: '2' },
        {
          add: {
            count: -1,
          },
        }
      )

      expect(mockUpdate).toHaveBeenNthCalledWith(
        3,
        { PK: 'BUCKETS#2024#dog#handler', SK: '3' },
        {
          add: {
            count: 1,
          },
        }
      )
    })

    it('does nothing when entityId is empty', async () => {
      await updateEntityStats(2024, 'dog', '', false)

      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })

  describe('updateYearlyParticipationStats', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    it('updates stats for all entity types', async () => {
      const registration = {
        eventType: 'NOME',
        dog: { regNo: 'DOG123', breedCode: 'BC' },
        handler: { email: 'handler@example.com' },
        owner: { email: 'owner@example.com' },
      } as unknown as JsonRegistration

      await updateYearlyParticipationStats(registration, 2024)

      // Should call updateEntityStats for each entity type
      expect(mockUpdate).toHaveBeenCalledTimes(13) // 6 entity types * 2 calls per type (entity + total) + handler#dog

      // Verify calls for each entity type
      const pkCalls = mockUpdate.mock.calls.map((call) => call[0].PK)

      expect(pkCalls).toContain('STAT#2024#eventType')
      expect(pkCalls).toContain('STAT#2024#dog')
      expect(pkCalls).toContain('STAT#2024#breed')
      expect(pkCalls).toContain('STAT#2024#handler')
      expect(pkCalls).toContain('STAT#2024#owner')
      expect(pkCalls).toContain('STAT#2024#dog#handler')

      // Verify the SK values for each entity type
      const skValues = mockUpdate.mock.calls.map((call) => call[0].SK)

      expect(skValues).toContain('NOME')
      expect(skValues).toContain('DOG123')
      expect(skValues).toContain('BC')
      expect(skValues).toContain('handler@example.com')
      expect(skValues).toContain('owner@example.com')
      expect(skValues).toContain('DOG123#handler@example.com')
    })

    it('uses "unknown" for missing breed code', async () => {
      const registration = {
        eventType: 'NOME',
        dog: { regNo: 'DOG123', breedCode: null },
        handler: { email: 'handler@example.com' },
        owner: { email: 'owner@example.com' },
      } as unknown as JsonRegistration

      await updateYearlyParticipationStats(registration, 2024)

      // Find the call for breed
      const breedCall = mockUpdate.mock.calls.find((call) => call[0].PK === 'STAT#2024#breed')

      expect(breedCall?.[0].SK).toBe('unknown')
    })
  })
})
