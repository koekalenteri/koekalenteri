import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import type { RegistrationStatsInput } from './stats'
import { vi } from 'vitest'

const mockQuery = vi.fn()
const mockRead = vi.fn()
const updateResult: Awaited<ReturnType<CustomDynamoClient['update']>> = { $metadata: {} }
const updateCalls: Parameters<CustomDynamoClient['update']>[] = []
const mockUpdate = vi.fn<CustomDynamoClient['update']>((...args) => {
  updateCalls.push(args)
  return Promise.resolve(updateResult)
})
const mockWrite = vi.fn()
const mockReadAll = vi.fn()
const transactionResult: Awaited<ReturnType<CustomDynamoClient['documentTransaction']>> = { $metadata: {} }
let documentTransaction: Parameters<CustomDynamoClient['documentTransaction']>[0] | undefined
const mockDocumentTransaction = vi.fn<CustomDynamoClient['documentTransaction']>((transaction) => {
  documentTransaction = transaction
  return Promise.resolve(transactionResult)
})

vi.doMock('../utils/CustomDynamoClient', () => ({
  __esModule: true,
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      documentTransaction: mockDocumentTransaction,
      query: mockQuery,
      read: mockRead,
      readAll: mockReadAll,
      update: mockUpdate,
      write: mockWrite,
    }
  }),
}))

const {
  applyNewRegistrationStatsOnce,
  updateEventStatsForRegistration,
  getOrganizerStats,
  getYearlyTotalStats,
  getAvailableYears,
  getDogHandlerBuckets,
  getYearlyBreakdown,
  calculateStatDeltas,
  bucketForCount,
  updateOrganizerEventStats,
  hashStatValue,
  participationIdentifiers,
  eventStatsYear,
  getCapacityStats,
  getRetentionStats,
  getJudgeWorkload,
  eventStatsMonth,
  moveOrganizerEventStats,
} = await import('./stats')

describe('lib/stats', () => {
  afterEach(() => {
    documentTransaction = undefined
    updateCalls.length = 0
    vi.clearAllMocks()
    vi.restoreAllMocks()
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

  describe('eventStatsMonth', () => {
    it('derives the month for a regular event date', () => {
      expect(eventStatsMonth('2025-06-15')).toBe('2025-06')
    })

    it('derives the month in the Finnish timezone', () => {
      // 2025-06-01 00:00 Europe/Helsinki, stored as the previous day in UTC
      expect(eventStatsMonth('2025-05-31T21:00:00.000Z')).toBe('2025-06')
    })

    it('returns undefined for an invalid date', () => {
      expect(eventStatsMonth('not-a-date')).toBeUndefined()
    })
  })

  describe('applyNewRegistrationStatsOnce', () => {
    const registration = {
      cancelled: false,
      dog: { breedCode: '122', regNo: 'FI12345' },
      eventId: 'event-1',
      eventType: 'NOME-B',
      handler: { email: 'handler@example.com' },
      id: 'registration-1',
      owner: { email: 'owner@example.com' },
    } as JsonRegistration
    const event = {
      eventType: 'NOME-B',
      id: 'event-1',
      organizer: { id: 'organizer-1' },
      startDate: '2024-06-01',
    } as JsonConfirmedEvent

    it('commits counters and the registration marker in one transaction', async () => {
      mockRead.mockResolvedValue(undefined)

      await applyNewRegistrationStatsOnce(registration, event, 'lease-token')

      expect(mockDocumentTransaction).toHaveBeenCalledTimes(1)
      expect(mockDocumentTransaction).toHaveBeenCalledWith(expect.any(Array))
      if (!documentTransaction) throw new Error('Expected a transaction')
      const transaction = documentTransaction
      // Only organizer stats and the marker: participation counters moved to the nightly
      // rebuild, so nothing in this transaction contends with a concurrent registration.
      expect(transaction).toHaveLength(2)
      expect(transaction[0]).toEqual(
        expect.objectContaining({
          Update: expect.objectContaining({
            Key: { PK: 'ORG#organizer-1', SK: '2024-06-01#event-1' },
            TableName: 'event-stats-table-not-found-in-env',
          }),
        })
      )
      const partitionKeys = transaction.map((item) => String(item.Update?.Key?.PK))
      expect(partitionKeys.some((pk) => /^(?:STAT|TOTALS|BUCKETS)#/.test(pk))).toBe(false)
      expect(partitionKeys).not.toContain('YEARS')
      expect(transaction.at(-1)).toEqual({
        Update: expect.objectContaining({
          ConditionExpression:
            'attribute_exists(#id) AND attribute_not_exists(#statsAt) AND #lease.#token = :leaseToken',
          ExpressionAttributeValues: expect.objectContaining({ ':leaseToken': 'lease-token' }),
          Key: { eventId: 'event-1', id: 'registration-1' },
          TableName: 'registration-table-not-found-in-env',
          UpdateExpression: 'SET #statsAt = :statsAt',
        }),
      })
    })

    it('treats an already committed marker as success after a cancelled transaction', async () => {
      mockDocumentTransaction.mockRejectedValueOnce({ name: 'TransactionCanceledException' })
      mockRead.mockImplementation(async (_key: unknown, table?: string) =>
        table === 'registration-table-not-found-in-env'
          ? ({ ...registration, newRegistrationStatsAt: '2024-01-01T00:00:00.000Z' } as JsonRegistration)
          : undefined
      )

      await expect(
        applyNewRegistrationStatsOnce(registration, { ...event, eventType: 'other' }, 'lease-token')
      ).resolves.toBe(undefined)

      expect(mockDocumentTransaction).toHaveBeenCalledTimes(1)
    })

    it('retries a cancelled transaction caused by contention on the shared organizer counters', async () => {
      // The ORG# item has no condition of its own, so a burst of registrations for the same
      // event can cancel each other's transactions with TransactionConflict, not just via the
      // registration's own condition. That's contention worth retrying, not a real failure.
      vi.spyOn(Math, 'random').mockReturnValue(0)
      mockDocumentTransaction
        .mockRejectedValueOnce({ name: 'TransactionCanceledException' })
        .mockResolvedValueOnce(undefined as never)
      mockRead.mockImplementation(async (_key: unknown, table?: string) =>
        table === 'registration-table-not-found-in-env'
          ? ({
              ...registration,
              newRegistrationLease: { expiresAt: Date.now() + 1000, token: 'lease-token' },
            } as JsonRegistration)
          : undefined
      )

      await applyNewRegistrationStatsOnce(registration, event, 'lease-token')

      expect(mockDocumentTransaction).toHaveBeenCalledTimes(2)
    })

    it('survives a burst of contention on the shared organizer counters', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      for (let attempt = 0; attempt < 8; attempt++) {
        mockDocumentTransaction.mockRejectedValueOnce({ name: 'TransactionCanceledException' })
      }
      mockDocumentTransaction.mockResolvedValueOnce(undefined as never)
      mockRead.mockImplementation(async (_key: unknown, table?: string) =>
        table === 'registration-table-not-found-in-env'
          ? ({
              ...registration,
              newRegistrationLease: { expiresAt: Date.now() + 1000, token: 'lease-token' },
            } as JsonRegistration)
          : undefined
      )

      await applyNewRegistrationStatsOnce(registration, event, 'lease-token')

      expect(mockDocumentTransaction).toHaveBeenCalledTimes(9)
    })

    it('gives up once the lease has moved on to another attempt', async () => {
      mockDocumentTransaction.mockRejectedValueOnce({ name: 'TransactionCanceledException' })
      mockRead.mockImplementation(async (_key: unknown, table?: string) =>
        table === 'registration-table-not-found-in-env'
          ? ({
              ...registration,
              newRegistrationLease: { expiresAt: Date.now() + 1000, token: 'someone-elses-token' },
            } as JsonRegistration)
          : undefined
      )

      await expect(applyNewRegistrationStatsOnce(registration, event, 'lease-token')).rejects.toEqual({
        name: 'TransactionCanceledException',
      })
      expect(mockDocumentTransaction).toHaveBeenCalledTimes(1)
    })

    it('rethrows a non-cancellation error untouched', async () => {
      const failure = new Error('boom')
      mockDocumentTransaction.mockRejectedValueOnce(failure)

      await expect(applyNewRegistrationStatsOnce(registration, event, 'lease-token')).rejects.toThrow(failure)
      expect(mockRead).not.toHaveBeenCalled()
    })
  })

  // Test moved from event.test.ts
  describe('updateEventStatsForRegistration', () => {
    it('calls update with correct keys and values', async () => {
      const reg = { cancelled: false, paidAmount: 10, refundAmount: 0 } as JsonRegistration
      const event = {
        endDate: '2024-01-02',
        id: 'e5',
        organizer: { id: 'org1' },
        startDate: '2024-01-01',
      } as JsonConfirmedEvent

      await updateEventStatsForRegistration(reg, undefined, event)

      // First call should update the organizer event stats
      expect(mockUpdate).toHaveBeenNthCalledWith(
        1,
        { PK: 'ORG#org1', SK: '2024-01-01#e5' },
        {
          add: {
            cancelledRegistrations: 0,
            count: 1,
            paidAmount: 10,
            paidRegistrations: 1,
            refundedAmount: 0,
            refundedRegistrations: 0,
          },
          set: {
            date: '2024-01-01',
            organizerId: 'org1',
            updatedAt: expect.any(String),
          },
        }
      )

      // The YEARS marker is written by the nightly rebuild, not on the registration path.
      expect(mockUpdate).toHaveBeenCalledTimes(1)
    })

    it('validates the event year before writing organizer stats', async () => {
      const reg = { cancelled: false, paidAmount: 10, refundAmount: 0 } as JsonRegistration
      const invalidEvent = {
        endDate: '2024-01-02',
        id: 'e5',
        organizer: { id: 'org1' },
        startDate: 'not-a-date',
      } as JsonConfirmedEvent

      await expect(updateEventStatsForRegistration(reg, undefined, invalidEvent)).rejects.toThrow(
        'Cannot derive stats year from event start date: not-a-date'
      )

      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('handles updates with existing registration', async () => {
      const existingReg = { cancelled: false, paidAmount: 5, refundAmount: 0 } as JsonRegistration
      const updatedReg = { cancelled: true, paidAmount: 10, refundAmount: 2 } as JsonRegistration
      const event = {
        endDate: '2024-01-02',
        id: 'e5',
        organizer: { id: 'org1' },
        startDate: '2024-01-01',
      } as JsonConfirmedEvent

      await updateEventStatsForRegistration(updatedReg, existingReg, event)

      // First call should update the organizer event stats
      expect(mockUpdate).toHaveBeenNthCalledWith(
        1,
        { PK: 'ORG#org1', SK: '2024-01-01#e5' },
        {
          add: {
            cancelledRegistrations: 1,
            count: 0,
            paidAmount: 5,
            paidRegistrations: 0,
            refundedAmount: 2,
            refundedRegistrations: 1,
          },
          set: {
            date: '2024-01-01',
            organizerId: 'org1',
            updatedAt: expect.any(String),
          },
        }
      )

      expect(mockUpdate).toHaveBeenCalledTimes(1)
    })

    it('writes only organizer stats, leaving participation to the nightly rebuild', async () => {
      const existingReg = {
        dog: { breedCode: 'BC', regNo: 'DOG123' },
        eventType: 'NOME',
        handler: { email: 'handler@example.com' },
        owner: { email: 'owner@example.com' },
      } as unknown as JsonRegistration
      const updatedReg = { ...existingReg, notes: 'Updated notes' } as JsonRegistration
      const event = {
        eventType: 'NOME',
        id: 'e5',
        organizer: { id: 'org1' },
        startDate: '2024-01-01',
      } as JsonConfirmedEvent

      await updateEventStatsForRegistration(updatedReg, existingReg, event)

      expect(mockUpdate).toHaveBeenCalledTimes(1)
      expect(mockUpdate).toHaveBeenNthCalledWith(1, { PK: 'ORG#org1', SK: '2024-01-01#e5' }, expect.any(Object))
    })
  })
  describe('moveOrganizerEventStats', () => {
    const event = { id: 'e5', organizer: { id: 'org1' }, startDate: '2024-06-15T00:00:00.000Z' }
    const stats = {
      count: 7,
      date: '2024-06-15T00:00:00.000Z',
      organizerId: 'org1',
      PK: 'ORG#org1',
      paidAmount: 350,
      SK: '2024-06-15T00:00:00.000Z#e5',
    }

    it('does nothing when neither the organizer nor the start date changed', async () => {
      await moveOrganizerEventStats(event, { ...event })

      expect(mockRead).not.toHaveBeenCalled()
      expect(mockDocumentTransaction).not.toHaveBeenCalled()
    })

    it('does nothing when the event has no stats record yet', async () => {
      mockRead.mockResolvedValueOnce(undefined)

      await moveOrganizerEventStats(event, { ...event, startDate: '2025-01-01T00:00:00.000Z' })

      expect(mockDocumentTransaction).not.toHaveBeenCalled()
    })

    it('carries the counters to the new start date and removes the old record', async () => {
      mockRead.mockResolvedValueOnce(stats)

      await moveOrganizerEventStats(event, { ...event, startDate: '2025-01-01T00:00:00.000Z' })

      expect(mockDocumentTransaction).toHaveBeenCalledWith([
        {
          Update: expect.objectContaining({
            ExpressionAttributeValues: expect.objectContaining({
              ':count': 7,
              ':date': '2025-01-01T00:00:00.000Z',
              ':organizerId': 'org1',
              ':paidAmount': 350,
            }),
            Key: { PK: 'ORG#org1', SK: '2025-01-01T00:00:00.000Z#e5' },
          }),
        },
        { Delete: expect.objectContaining({ Key: { PK: 'ORG#org1', SK: '2024-06-15T00:00:00.000Z#e5' } }) },
      ])
    })

    it('accumulates into the destination instead of overwriting a concurrent registration there', async () => {
      // A registration saved after the event's new key took effect applies a blind ADD to that
      // key; a Put would drop it, so the move has to ADD its carried-over counters on top.
      mockRead.mockResolvedValueOnce(stats)

      await moveOrganizerEventStats(event, { ...event, startDate: '2025-01-01T00:00:00.000Z' })

      const update = mockDocumentTransaction.mock.calls[0][0][0].Update
      expect(update?.UpdateExpression).toMatch(/^ADD #cancelledRegistrations :cancelledRegistrations, #count :count,/)
      expect(update?.UpdateExpression).toContain('SET #date = :date')
      expect(update).not.toHaveProperty('ConditionExpression')
    })

    it('also moves the record across partitions when the organizer changes', async () => {
      mockRead.mockResolvedValueOnce(stats)

      await moveOrganizerEventStats(event, { ...event, organizer: { id: 'org2' } })

      expect(mockDocumentTransaction).toHaveBeenCalledWith([
        {
          Update: expect.objectContaining({
            ExpressionAttributeValues: expect.objectContaining({ ':count': 7, ':organizerId': 'org2' }),
            Key: { PK: 'ORG#org2', SK: '2024-06-15T00:00:00.000Z#e5' },
          }),
        },
        { Delete: expect.objectContaining({ Key: { PK: 'ORG#org1', SK: '2024-06-15T00:00:00.000Z#e5' } }) },
      ])
    })

    it('reads the old record consistently so a just-counted registration is not missed', async () => {
      mockRead.mockResolvedValueOnce(stats)

      await moveOrganizerEventStats(event, { ...event, startDate: '2025-01-01T00:00:00.000Z' })

      expect(mockRead).toHaveBeenCalledWith({ PK: 'ORG#org1', SK: '2024-06-15T00:00:00.000Z#e5' }, undefined, true)
    })

    it('conditions the delete on the updatedAt it just read', async () => {
      mockRead.mockResolvedValueOnce({ ...stats, updatedAt: '2024-06-20T00:00:00.000Z' })

      await moveOrganizerEventStats(event, { ...event, startDate: '2025-01-01T00:00:00.000Z' })

      expect(mockDocumentTransaction).toHaveBeenCalledWith([
        expect.anything(),
        {
          Delete: expect.objectContaining({
            ConditionExpression: '#updatedAt = :expectedUpdatedAt',
            ExpressionAttributeValues: { ':expectedUpdatedAt': '2024-06-20T00:00:00.000Z' },
            Key: { PK: 'ORG#org1', SK: '2024-06-15T00:00:00.000Z#e5' },
          }),
        },
      ])
    })

    it('re-reads and retries when a concurrent registration write races the move', async () => {
      // A registration write landing on the old key between the read and the delete bumps its
      // updatedAt, failing the delete's condition; the move must pick up that fresh increment
      // instead of silently discarding it.
      vi.spyOn(Math, 'random').mockReturnValue(0)
      mockRead
        .mockResolvedValueOnce({ ...stats, count: 7, updatedAt: '2024-06-20T00:00:00.000Z' })
        .mockResolvedValueOnce({ ...stats, count: 8, updatedAt: '2024-06-20T00:05:00.000Z' })
      mockDocumentTransaction
        .mockRejectedValueOnce({ name: 'TransactionCanceledException' })
        .mockResolvedValueOnce(undefined as never)

      await moveOrganizerEventStats(event, { ...event, startDate: '2025-01-01T00:00:00.000Z' })

      expect(mockRead).toHaveBeenCalledTimes(2)
      expect(mockDocumentTransaction).toHaveBeenCalledTimes(2)
      expect(mockDocumentTransaction).toHaveBeenLastCalledWith([
        expect.objectContaining({
          Update: expect.objectContaining({
            ExpressionAttributeValues: expect.objectContaining({ ':count': 8 }),
          }),
        }),
        expect.objectContaining({
          Delete: expect.objectContaining({
            ExpressionAttributeValues: { ':expectedUpdatedAt': '2024-06-20T00:05:00.000Z' },
          }),
        }),
      ])
    })

    it('gives up after exhausting the retry budget', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      mockRead.mockResolvedValue({ ...stats, updatedAt: '2024-06-20T00:00:00.000Z' })
      mockDocumentTransaction.mockRejectedValue({ name: 'TransactionCanceledException' })

      await expect(moveOrganizerEventStats(event, { ...event, startDate: '2025-01-01T00:00:00.000Z' })).rejects.toEqual(
        { name: 'TransactionCanceledException' }
      )
      expect(mockDocumentTransaction).toHaveBeenCalledTimes(8)
    })

    it('rethrows a non-cancellation error untouched', async () => {
      mockRead.mockResolvedValueOnce({ ...stats, updatedAt: '2024-06-20T00:00:00.000Z' })
      const failure = new Error('boom')
      mockDocumentTransaction.mockRejectedValueOnce(failure)

      await expect(moveOrganizerEventStats(event, { ...event, startDate: '2025-01-01T00:00:00.000Z' })).rejects.toThrow(
        failure
      )
      expect(mockRead).toHaveBeenCalledTimes(1)
    })
  })

  describe('getOrganizerStats', () => {
    it('queries for specific organizer stats with date filters', async () => {
      const organizerIds = ['org1']
      const from = '2024-01-01'
      const to = '2024-12-31'

      mockQuery.mockResolvedValueOnce([{ count: 10, eventId: 'e1', organizerId: 'org1' }])

      const result = await getOrganizerStats(organizerIds, from, to)

      expect(mockQuery).toHaveBeenCalledWith({
        filterExpression: 'SK >= :from AND SK <= :to',
        key: '#pk = :pk',
        names: { '#pk': 'PK' },
        values: { ':from': from, ':pk': 'ORG#org1', ':to': to },
      })

      expect(result).toHaveLength(1)
      expect(result[0].organizerId).toBe('org1')
    })

    it('gets all stats for admin users with date filters', async () => {
      const from = '2024-01-01'
      const to = '2024-12-31'

      const mockStats = [
        {
          count: 10,
          organizerId: 'org1',
          PK: 'ORG#org1',
          SK: '2024-02-01#e1',
        },
      ]

      // Mock the readAll response
      mockReadAll.mockResolvedValueOnce(mockStats)

      const result = await getOrganizerStats(undefined, from, to)

      // Verify readAll is called with the correct filter parameters
      expect(mockReadAll).toHaveBeenCalledWith({
        filter: 'begins_with(#pk, :orgPrefix) AND SK >= :from AND SK <= :to',
        names: { '#pk': 'PK' },
        values: {
          ':from': from,
          ':orgPrefix': 'ORG#',
          ':to': to,
        },
      })

      expect(result).toHaveLength(1)
      expect(result[0].organizerId).toBe('org1')
    })
  })
  describe('getYearlyTotalStats', () => {
    it('queries for yearly total stats with correct key', async () => {
      const year = 2024

      mockQuery.mockResolvedValueOnce([
        { count: 150, SK: 'dog' },
        { count: 100, SK: 'handler' },
        { count: 200, SK: 'dog#handler' },
      ])

      const result = await getYearlyTotalStats(year)

      expect(mockQuery).toHaveBeenCalledWith({
        key: 'PK = :pk',
        values: { ':pk': 'TOTALS#2024' },
      })

      expect(result).toHaveLength(3)
      expect(result).toEqual([
        { count: 150, type: 'dog', year: 2024 },
        { count: 100, type: 'handler', year: 2024 },
        { count: 200, type: 'dog#handler', year: 2024 },
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

      expect(mockQuery).toHaveBeenCalledWith({
        key: 'PK = :pk',
        values: { ':pk': 'YEARS' },
      })

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
        { count: 50, SK: '1' },
        { count: 30, SK: '2' },
        { count: 20, SK: '3' },
        { count: 15, SK: '5-9' },
        { count: 5, SK: '10+' },
      ])

      const result = await getDogHandlerBuckets(year)

      expect(mockQuery).toHaveBeenCalledWith({
        key: 'PK = :pk',
        values: { ':pk': 'BUCKETS#2024#dog#handler' },
      })

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

  describe('getYearlyBreakdown', () => {
    it('queries for the per-entity breakdown with correct key', async () => {
      const year = 2024

      mockQuery.mockResolvedValueOnce([
        { count: 450, SK: 'NOU' },
        { count: 120, SK: 'NOME-B' },
      ])

      const result = await getYearlyBreakdown(year, 'eventType')

      expect(mockQuery).toHaveBeenCalledWith({
        key: 'PK = :pk',
        values: { ':pk': 'STAT#2024#eventType' },
      })

      expect(result).toEqual([
        { count: 450, entityId: 'NOU' },
        { count: 120, entityId: 'NOME-B' },
      ])
    })

    it('handles empty results', async () => {
      mockQuery.mockResolvedValueOnce(null)

      const result = await getYearlyBreakdown(2023, 'breed')

      expect(result).toEqual([])
    })
  })

  describe('getJudgeWorkload', () => {
    it('queries per-judge event counts with correct key', async () => {
      mockQuery.mockResolvedValueOnce([
        { count: 12, name: 'Matti Meikäläinen', SK: '1' },
        { count: 4, name: 'Foreign Judge', SK: 'Foreign Judge' },
      ])

      const result = await getJudgeWorkload(2024)

      expect(mockQuery).toHaveBeenCalledWith({
        key: 'PK = :pk',
        values: { ':pk': 'JUDGE#2024' },
      })
      expect(result).toEqual([
        { count: 12, judgeId: '1', name: 'Matti Meikäläinen' },
        { count: 4, judgeId: 'Foreign Judge', name: 'Foreign Judge' },
      ])
    })

    it('handles empty results', async () => {
      mockQuery.mockResolvedValueOnce(null)

      const result = await getJudgeWorkload(2023)

      expect(result).toEqual([])
    })
  })

  describe('getCapacityStats', () => {
    it('returns an empty range without querying when from is after to', async () => {
      const result = await getCapacityStats('NOME-B', undefined, '2025-12', '2025-01')

      expect(result).toEqual([])
      expect(mockQuery).not.toHaveBeenCalled()
    })

    it('queries by event type with no range when from/to are omitted, summing every organizer per month/class', async () => {
      mockQuery.mockResolvedValueOnce([
        {
          cancelledRegistrations: 1,
          eventCount: 2,
          organizerId: 'org-1',
          PK: 'CAPACITY#NOME-B',
          places: 20,
          reserve: 3,
          SK: '2025-06#ALO#org-1',
          starters: 18,
        },
        {
          cancelledRegistrations: 0,
          eventCount: 1,
          organizerId: 'org-2',
          PK: 'CAPACITY#NOME-B',
          places: 10,
          reserve: 1,
          SK: '2025-06#ALO#org-2',
          starters: 9,
        },
      ])

      const result = await getCapacityStats('NOME-B')

      expect(mockQuery).toHaveBeenCalledWith({
        filterExpression: undefined,
        key: '#pk = :pk',
        names: { '#pk': 'PK' },
        values: { ':pk': 'CAPACITY#NOME-B' },
      })
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

    it('filters to one organizer and keeps its id on the result', async () => {
      mockQuery.mockResolvedValueOnce([
        {
          cancelledRegistrations: 1,
          eventCount: 2,
          organizerId: 'org-1',
          PK: 'CAPACITY#NOME-B',
          places: 20,
          reserve: 3,
          SK: '2025-06#ALO#org-1',
          starters: 18,
        },
      ])

      const result = await getCapacityStats('NOME-B', ['org-1'])

      expect(mockQuery).toHaveBeenCalledWith({
        filterExpression: '#organizerId IN (:organizerId0)',
        key: '#pk = :pk',
        names: { '#organizerId': 'organizerId', '#pk': 'PK' },
        values: { ':organizerId0': 'org-1', ':pk': 'CAPACITY#NOME-B' },
      })
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
      mockQuery.mockResolvedValueOnce([
        {
          eventCount: 2,
          organizerId: 'org-1',
          PK: 'CAPACITY#NOME-B',
          places: 20,
          SK: '2025-06#ALO#org-1',
          starters: 18,
        },
        {
          eventCount: 1,
          organizerId: 'org-2',
          PK: 'CAPACITY#NOME-B',
          places: 10,
          SK: '2025-06#ALO#org-2',
          starters: 9,
        },
      ])

      const result = await getCapacityStats('NOME-B', ['org-1', 'org-2'])

      expect(mockQuery).toHaveBeenCalledWith({
        filterExpression: '#organizerId IN (:organizerId0, :organizerId1)',
        key: '#pk = :pk',
        names: { '#organizerId': 'organizerId', '#pk': 'PK' },
        values: { ':organizerId0': 'org-1', ':organizerId1': 'org-2', ':pk': 'CAPACITY#NOME-B' },
      })
      expect(result).toEqual([expect.objectContaining({ eventCount: 3, organizerId: '', places: 30, starters: 27 })])
    })

    it('returns nothing for an empty organizer list rather than querying every organizer', async () => {
      // A non-admin who belongs to no organization must not fall through to the nationwide total.
      const result = await getCapacityStats('NOME-B', [])

      expect(mockQuery).not.toHaveBeenCalled()
      expect(result).toEqual([])
    })

    it('bounds the query with a padded upper bound so the whole "to" month is included', async () => {
      mockQuery.mockResolvedValueOnce([])

      await getCapacityStats('NOU', undefined, '2025-01', '2025-06')

      expect(mockQuery).toHaveBeenCalledWith({
        filterExpression: undefined,
        key: '#pk = :pk AND SK BETWEEN :from AND :to',
        names: { '#pk': 'PK' },
        values: { ':from': '2025-01', ':pk': 'CAPACITY#NOU', ':to': '2025-06#￿' },
      })
    })

    it('supports an open-ended lower or upper bound', async () => {
      mockQuery.mockResolvedValueOnce([])
      await getCapacityStats('NOU', undefined, '2025-01')
      expect(mockQuery).toHaveBeenCalledWith({
        filterExpression: undefined,
        key: '#pk = :pk AND SK >= :from',
        names: { '#pk': 'PK' },
        values: { ':from': '2025-01', ':pk': 'CAPACITY#NOU' },
      })

      mockQuery.mockResolvedValueOnce([])
      await getCapacityStats('NOU', undefined, undefined, '2025-06')
      expect(mockQuery).toHaveBeenCalledWith({
        filterExpression: undefined,
        key: '#pk = :pk AND SK <= :to',
        names: { '#pk': 'PK' },
        values: { ':pk': 'CAPACITY#NOU', ':to': '2025-06#￿' },
      })
    })

    it('handles empty results', async () => {
      mockQuery.mockResolvedValueOnce(null)

      const result = await getCapacityStats('NOME-B')

      expect(result).toEqual([])
    })
  })

  // Tests for previously untested functions
  describe('calculateStatDeltas', () => {
    it('calculates correct deltas for new registration', () => {
      const registration: RegistrationStatsInput = {
        cancelled: false,
        paidAmount: 50,
        refundAmount: 0,
      } as JsonRegistration

      const deltas = calculateStatDeltas(registration, undefined)

      expect(deltas).toEqual({
        cancelledDelta: 0,
        paidAmountDelta: 50,
        paidDelta: 1,
        refundedAmountDelta: 0,
        refundedDelta: 0,
        totalDelta: 1,
      })
    })

    it('calculates correct deltas for updated registration', () => {
      const existingRegistration = {
        cancelled: false,
        paidAmount: 50,
        refundAmount: 0,
      } as JsonRegistration

      const updatedRegistration = {
        cancelled: true,
        paidAmount: 50,
        refundAmount: 25,
      } as JsonRegistration

      const deltas = calculateStatDeltas(updatedRegistration, existingRegistration)

      expect(deltas).toEqual({
        cancelledDelta: 1,
        paidAmountDelta: 0,
        paidDelta: 0,
        refundedAmountDelta: 25,
        refundedDelta: 1,
        totalDelta: 0,
      })
    })

    it('handles null values correctly', () => {
      const existingRegistration = {
        cancelled: false,
        paidAmount: null,
        refundAmount: null,
      } as unknown as JsonRegistration

      const updatedRegistration = {
        cancelled: false,
        paidAmount: 50,
        refundAmount: null,
      } as unknown as JsonRegistration

      const deltas = calculateStatDeltas(updatedRegistration, existingRegistration)

      expect(deltas).toEqual({
        cancelledDelta: 0,
        paidAmountDelta: 50,
        paidDelta: 1,
        refundedAmountDelta: 0,
        refundedDelta: 0,
        totalDelta: 0,
      })
    })
  })

  describe('updateOrganizerEventStats', () => {
    it('calls update with correct parameters', async () => {
      const event = {
        id: 'event456',
        organizer: { id: 'org123' },
        startDate: '2024-06-15',
      } as JsonConfirmedEvent

      const deltas = {
        cancelledDelta: 0,
        paidAmountDelta: 50,
        paidDelta: 1,
        refundedAmountDelta: 0,
        refundedDelta: 0,
        totalDelta: 1,
      }

      await updateOrganizerEventStats(event, deltas)

      expect(mockUpdate).toHaveBeenCalledWith(
        { PK: 'ORG#org123', SK: '2024-06-15#event456' },
        {
          add: {
            cancelledRegistrations: 0,
            count: 1,
            paidAmount: 50,
            paidRegistrations: 1,
            refundedAmount: 0,
            refundedRegistrations: 0,
          },
          set: {
            date: '2024-06-15',
            organizerId: 'org123',
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
      const ownerEmail = 'owner@example.com'
      const registration: RegistrationStatsInput = {
        cancelled: false,
        class: 'AVO',
        dog: { breedCode: '122', regNo: dogRegNo },
        eventId: 'event-id',
        eventType: 'NOU',
        handler: { email: handlerEmail },
        id: 'registration-id',
        owner: { email: ownerEmail },
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
        owner: hashStatValue(ownerEmail),
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
        owner: emptyHash,
      })
    })
  })

  describe('getRetentionStats', () => {
    it('reads the new/returning split for a year', async () => {
      mockQuery.mockResolvedValueOnce([
        { count: 40, SK: 'new' },
        { count: 160, SK: 'returning' },
      ])

      const result = await getRetentionStats(2025)

      expect(mockQuery).toHaveBeenCalledWith({ key: 'PK = :pk', values: { ':pk': 'RETENTION#2025' } })
      expect(result).toEqual({ new: 40, returning: 160, year: 2025 })
    })

    it('returns undefined when the year has no record, rather than a zeroed one', async () => {
      // The earliest year on record has nothing to compare against; zeros would read as
      // "nobody returned" instead of "unknown".
      mockQuery.mockResolvedValueOnce([])

      await expect(getRetentionStats(2019)).resolves.toBeUndefined()
    })
  })
})
