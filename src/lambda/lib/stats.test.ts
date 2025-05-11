import type { JsonConfirmedEvent, JsonRegistration } from '../../types'

import { jest } from '@jest/globals'

const mockQuery = jest.fn<any>()
const mockRead = jest.fn<any>()
const mockUpdate = jest.fn<any>()
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
        expect.stringContaining('SET organizerId = :organizerId'),
        expect.any(Object),
        expect.objectContaining({
          ':eventStartDate': '2024-01-01',
          ':eventEndDate': '2024-01-02',
          ':totalDelta': 1,
          ':paidDelta': 1,
          ':cancelledDelta': 0,
          ':refundedDelta': 0,
          ':paidAmountDelta': 10,
          ':refundedAmountDelta': 0,
        })
      )

      // Second call should add the year to the YEARS record
      expect(mockUpdate).toHaveBeenNthCalledWith(
        2,
        { PK: 'YEARS', SK: '2024' },
        'SET updatedAt = :updatedAt',
        {},
        expect.objectContaining({
          ':updatedAt': expect.any(String),
        })
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
        expect.stringContaining('SET organizerId = :organizerId'),
        expect.any(Object),
        expect.objectContaining({
          ':totalDelta': 0,
          ':paidDelta': 0,
          ':cancelledDelta': 1,
          ':refundedDelta': 1,
          ':paidAmountDelta': 5,
          ':refundedAmountDelta': 2,
        })
      )

      // Second call should add the year to the YEARS record
      expect(mockUpdate).toHaveBeenNthCalledWith(
        2,
        { PK: 'YEARS', SK: '2024' },
        'SET updatedAt = :updatedAt',
        {},
        expect.objectContaining({
          ':updatedAt': expect.any(String),
        })
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
        'PK = :pk',
        { ':pk': 'ORG#org1', ':from': from, ':to': to },
        undefined,
        undefined,
        undefined,
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
          eventId: 'e1',
          eventStartDate: '2024-02-01',
          count: 10,
        },
      ]

      // Mock the readAll response
      mockReadAll.mockResolvedValueOnce(mockStats)

      const result = await getOrganizerStats(undefined, from, to)

      // Verify readAll is called with the correct filter parameters
      expect(mockReadAll).toHaveBeenCalledWith(
        undefined,
        'begins_with(PK, :orgPrefix) AND SK >= :from AND SK <= :to',
        {
          ':orgPrefix': 'ORG#',
          ':from': from,
          ':to': to,
        },
        {}
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
})
