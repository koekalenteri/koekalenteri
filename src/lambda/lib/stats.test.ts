import type { JsonEventType, JsonRegistration } from '../../types'
import type { JsonCapacityStatsItem, RegistrationStatsInput } from '../../types/Stats'
import type * as eventStatsRepository from './repositories/eventStatsRepository'
import type * as registrationRepository from './repositories/registrationRepository'
import { vi } from 'vitest'
import { legacyDayValue } from '../../test-utils/finnishDays'
import { asJsonConfirmedEvent, asJsonRegistration } from '../test-utils/helpers'

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
const mockAddOrganizerEventStats = vi.fn<typeof eventStatsRepository.addOrganizerEventStats>()
const mockReadOrganizerEventStatsRow = vi.fn<typeof eventStatsRepository.readOrganizerEventStatsRow>()
const mockMoveOrganizerEventStatsRow = vi.fn<typeof eventStatsRepository.moveOrganizerEventStatsRow>()
const mockCommitNewRegistrationStats = vi.fn<typeof eventStatsRepository.commitNewRegistrationStats>()
const mockReadRegistration = vi.fn<typeof registrationRepository.readRegistration>()

// The key builder is the real one; only the table access is replaced.
vi.doMock('./repositories/eventStatsRepository', async (importOriginal) => {
  const original = await importOriginal<typeof eventStatsRepository>()
  return {
    ...original,
    addOrganizerEventStats: mockAddOrganizerEventStats,
    commitNewRegistrationStats: mockCommitNewRegistrationStats,
    moveOrganizerEventStatsRow: mockMoveOrganizerEventStatsRow,
    // The move's retry as it is, with a jitter of nothing: the moves follow each other at once.
    ORGANIZER_STATS_MOVE_RETRY: original.organizerStatsMoveRetry(() => 0),
    readAllOrganizerEventStats: mockReadAllOrganizerEventStats,
    readBreedStarts: mockReadBreedStarts,
    readBuckets: mockReadBuckets,
    readCapacityStats: mockReadCapacityStats,
    readEventBreakdown: mockReadEventBreakdown,
    readJudgeWorkload: mockReadJudgeWorkload,
    readOrganizerEventStats: mockReadOrganizerEventStats,
    readOrganizerEventStatsRow: mockReadOrganizerEventStatsRow,
    readRetention: mockReadRetention,
    readStatsYears: mockReadStatsYears,
    readYearlyBreakdown: mockReadYearlyBreakdown,
    readYearlyTotals: mockReadYearlyTotals,
  }
})

vi.doMock('./repositories/registrationRepository', () => ({
  readRegistration: mockReadRegistration,
}))

const mockReadEventTypes = vi.fn<() => Promise<JsonEventType[]>>()
vi.doMock('./repositories/eventTypeRepository', () => ({
  readEventTypes: mockReadEventTypes,
}))

const {
  applyNewRegistrationStatsOnce,
  updateEventStatsForRegistration,
  getOrganizerStats,
  getYearlyTotalStats,
  getAvailableYears,
  getDogHandlerBuckets,
  getDogsPerHandlerBuckets,
  getYearlyBreakdown,
  getBreedStartBreakdown,
  calculateStatDeltas,
  sumNewRegistrationStatDeltas,
  bucketForCount,
  updateOrganizerEventStats,
  hashStatValue,
  participationIdentifiers,
  eventStatsYear,
  getCapacityStats,
  getCapacityStatsAllEventTypes,
  getRetentionStats,
  getJudgeWorkload,
  getEventBreakdown,
  moveOrganizerEventStats,
} = await import('./stats')

describe('lib/stats', () => {
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
    const event = asJsonConfirmedEvent({
      eventType: 'NOME-B',
      id: 'event-1',
      organizer: { id: 'organizer-1' },
      startDate: '2024-06-01',
    })
    const withLease = (token: string) =>
      asJsonRegistration({ ...registration, newRegistrationLease: { expiresAt: Date.now() + 1000, token } })

    it('commits the new registration deltas with its lease in one transaction', async () => {
      await applyNewRegistrationStatsOnce(registration, event, 'lease-token')

      expect(mockCommitNewRegistrationStats).toHaveBeenCalledTimes(1)
      // No group means the registration is not in a starting group, so it counts as reserve.
      expect(mockCommitNewRegistrationStats).toHaveBeenCalledWith(
        event,
        {
          cancelledDelta: 0,
          memberDelta: 0,
          paidAmountDelta: 0,
          paidDelta: 0,
          refundedAmountDelta: 0,
          refundedDelta: 0,
          reserveDelta: 1,
          totalDelta: 1,
        },
        registration,
        'lease-token',
        expect.any(String)
      )
      expect(mockReadRegistration).not.toHaveBeenCalled()
    })

    it('refuses an event without a stats year before writing anything', async () => {
      await expect(
        applyNewRegistrationStatsOnce(
          registration,
          { ...event, startDate: legacyDayValue('not-a-date') },
          'lease-token'
        )
      ).rejects.toThrow('Cannot derive stats year from event start date: not-a-date')

      expect(mockCommitNewRegistrationStats).not.toHaveBeenCalled()
    })

    it('treats an already committed marker as success after a cancelled transaction', async () => {
      mockCommitNewRegistrationStats.mockRejectedValueOnce({ name: 'TransactionCanceledException' })
      mockReadRegistration.mockResolvedValueOnce({
        ...registration,
        newRegistrationStatsAt: '2024-01-01T00:00:00.000Z',
      } as JsonRegistration)

      await expect(
        applyNewRegistrationStatsOnce(registration, { ...event, eventType: 'other' }, 'lease-token')
      ).resolves.toBe(undefined)

      expect(mockReadRegistration).toHaveBeenCalledWith('event-1', 'registration-1', true)
      expect(mockCommitNewRegistrationStats).toHaveBeenCalledTimes(1)
    })

    it('retries a cancelled transaction caused by contention on the shared organizer counters', async () => {
      // The ORG# item has no condition of its own, so a burst of registrations for the same
      // event can cancel each other's transactions with TransactionConflict, not just via the
      // registration's own condition. That's contention worth retrying, not a real failure.
      vi.useFakeTimers()
      mockCommitNewRegistrationStats
        .mockRejectedValueOnce({ name: 'TransactionCanceledException' })
        .mockResolvedValueOnce(undefined)
      mockReadRegistration.mockResolvedValue(withLease('lease-token'))

      // The jittered waits between the attempts pass at once.
      const applying = applyNewRegistrationStatsOnce(registration, event, 'lease-token')
      await vi.runAllTimersAsync()
      await applying

      expect(mockCommitNewRegistrationStats).toHaveBeenCalledTimes(2)
    })

    it('survives a burst of contention on the shared organizer counters', async () => {
      vi.useFakeTimers()
      for (let attempt = 0; attempt < 8; attempt++) {
        mockCommitNewRegistrationStats.mockRejectedValueOnce({ name: 'TransactionCanceledException' })
      }
      mockCommitNewRegistrationStats.mockResolvedValueOnce(undefined)
      mockReadRegistration.mockResolvedValue(withLease('lease-token'))

      const applying = applyNewRegistrationStatsOnce(registration, event, 'lease-token')
      await vi.runAllTimersAsync()
      await applying

      expect(mockCommitNewRegistrationStats).toHaveBeenCalledTimes(9)
    })

    it('gives up after the last attempt even while the lease is still its own', async () => {
      vi.useFakeTimers()
      mockCommitNewRegistrationStats.mockRejectedValue({ name: 'TransactionCanceledException' })
      mockReadRegistration.mockResolvedValue(withLease('lease-token'))

      const refused = expect(applyNewRegistrationStatsOnce(registration, event, 'lease-token')).rejects.toEqual({
        name: 'TransactionCanceledException',
      })
      await vi.runAllTimersAsync()
      await refused
      expect(mockCommitNewRegistrationStats).toHaveBeenCalledTimes(12)
    })

    it('gives up once the lease has moved on to another attempt', async () => {
      mockCommitNewRegistrationStats.mockRejectedValueOnce({ name: 'TransactionCanceledException' })
      mockReadRegistration.mockResolvedValueOnce(withLease('someone-elses-token'))

      await expect(applyNewRegistrationStatsOnce(registration, event, 'lease-token')).rejects.toEqual({
        name: 'TransactionCanceledException',
      })
      expect(mockCommitNewRegistrationStats).toHaveBeenCalledTimes(1)
    })

    it('rethrows a non-cancellation error untouched', async () => {
      const failure = new Error('boom')
      mockCommitNewRegistrationStats.mockRejectedValueOnce(failure)

      await expect(applyNewRegistrationStatsOnce(registration, event, 'lease-token')).rejects.toThrow(failure)
      expect(mockReadRegistration).not.toHaveBeenCalled()
    })
  })

  // Test moved from event.test.ts
  describe('updateEventStatsForRegistration', () => {
    const event = asJsonConfirmedEvent({
      endDate: '2024-01-02',
      id: 'e5',
      organizer: { id: 'org1' },
      startDate: '2024-01-01',
    })

    it('adds the deltas of a new registration to the organizer stats', async () => {
      const reg = { cancelled: false, paidAmount: 10, refundAmount: 0 } as JsonRegistration

      await updateEventStatsForRegistration(reg, undefined, event)

      // No group means the registration is not in a starting group, so it counts as reserve
      // rather than a starter. The YEARS marker is written by the nightly rebuild, not here.
      expect(mockAddOrganizerEventStats).toHaveBeenCalledTimes(1)
      expect(mockAddOrganizerEventStats).toHaveBeenCalledWith(
        event,
        {
          cancelledDelta: 0,
          memberDelta: 0,
          paidAmountDelta: 10,
          paidDelta: 1,
          refundedAmountDelta: 0,
          refundedDelta: 0,
          reserveDelta: 1,
          totalDelta: 1,
        },
        expect.any(String)
      )
    })

    it('validates the event year before writing organizer stats', async () => {
      const reg = { cancelled: false, paidAmount: 10, refundAmount: 0 } as JsonRegistration

      await expect(
        updateEventStatsForRegistration(reg, undefined, { ...event, startDate: legacyDayValue('not-a-date') })
      ).rejects.toThrow('Cannot derive stats year from event start date: not-a-date')

      expect(mockAddOrganizerEventStats).not.toHaveBeenCalled()
    })

    it('handles updates with existing registration', async () => {
      const existingReg = { cancelled: false, paidAmount: 5, refundAmount: 0 } as JsonRegistration
      const updatedReg = { cancelled: true, paidAmount: 10, refundAmount: 2 } as JsonRegistration

      await updateEventStatsForRegistration(updatedReg, existingReg, event)

      // The registration was reserve (no group) before the update and cancelled after, so
      // reserve drops by one.
      expect(mockAddOrganizerEventStats).toHaveBeenCalledTimes(1)
      expect(mockAddOrganizerEventStats).toHaveBeenCalledWith(
        event,
        {
          cancelledDelta: 1,
          memberDelta: 0,
          paidAmountDelta: 5,
          paidDelta: 0,
          refundedAmountDelta: 2,
          refundedDelta: 1,
          reserveDelta: -1,
          totalDelta: 0,
        },
        expect.any(String)
      )
    })

    it('writes only organizer stats, leaving participation to the nightly rebuild', async () => {
      const existingReg = asJsonRegistration({
        dog: { breedCode: '110', regNo: 'DOG123' },
        eventType: 'NOME',
        handler: { email: 'handler@example.com' },
        owner: { email: 'owner@example.com' },
      })
      const updatedReg = { ...existingReg, notes: 'Updated notes' } as JsonRegistration
      const nomeEvent = asJsonConfirmedEvent({
        eventType: 'NOME',
        id: 'e5',
        organizer: { id: 'org1' },
        startDate: '2024-01-01',
      })

      await updateEventStatsForRegistration(updatedReg, existingReg, nomeEvent)

      expect(mockAddOrganizerEventStats).toHaveBeenCalledTimes(1)
      expect(mockAddOrganizerEventStats).toHaveBeenCalledWith(nomeEvent, expect.any(Object), expect.any(String))
    })
  })
  describe('moveOrganizerEventStats', () => {
    const event = { id: 'e5', organizer: { id: 'org1' }, startDate: '2024-06-15T00:00:00.000Z' }
    const moved = { ...event, startDate: '2025-01-01T00:00:00.000Z' }
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

      expect(mockReadOrganizerEventStatsRow).not.toHaveBeenCalled()
      expect(mockMoveOrganizerEventStatsRow).not.toHaveBeenCalled()
    })

    it('does nothing when the event has no stats record yet', async () => {
      mockReadOrganizerEventStatsRow.mockResolvedValueOnce(undefined)

      await moveOrganizerEventStats(event, moved)

      expect(mockMoveOrganizerEventStatsRow).not.toHaveBeenCalled()
    })

    it('moves the row it read from the old key to the new start date', async () => {
      mockReadOrganizerEventStatsRow.mockResolvedValueOnce(stats)

      await moveOrganizerEventStats(event, moved)

      expect(mockReadOrganizerEventStatsRow).toHaveBeenCalledWith(event)
      expect(mockMoveOrganizerEventStatsRow).toHaveBeenCalledWith(event, moved, stats, expect.any(String))
    })

    // KOE-1547: the event's row and its stats rows are migrated to day keys one after the other, so
    // a save in between finds the stats row under the other form of the start.
    describe('while the start is migrated to a day key', () => {
      const keyed = { id: 'e5', organizer: { id: 'org1' }, startDate: '2024-06-15' }
      const instant = { ...keyed, startDate: '2024-06-14T21:00:00.000Z' }
      const later = { ...keyed, startDate: '2025-01-01' }

      it('moves the row still keyed by the instant the start was stored as', async () => {
        mockReadOrganizerEventStatsRow.mockResolvedValueOnce(undefined).mockResolvedValueOnce(stats)

        await moveOrganizerEventStats(keyed, later)

        expect(mockReadOrganizerEventStatsRow).toHaveBeenNthCalledWith(1, keyed)
        expect(mockReadOrganizerEventStatsRow).toHaveBeenNthCalledWith(2, instant)
        expect(mockMoveOrganizerEventStatsRow).toHaveBeenCalledWith(instant, later, stats, expect.any(String))
      })

      it('moves the row the stats migration keyed already when the stored start is still an instant', async () => {
        mockReadOrganizerEventStatsRow.mockResolvedValueOnce(undefined).mockResolvedValueOnce(stats)

        await moveOrganizerEventStats(instant, later)

        expect(mockReadOrganizerEventStatsRow).toHaveBeenNthCalledWith(2, keyed)
        expect(mockMoveOrganizerEventStatsRow).toHaveBeenCalledWith(keyed, later, stats, expect.any(String))
      })

      // The stats migration keys a row by the day its start was stored for: Fri 23:00 is Saturday there,
      // though a request reads it as Friday.
      it('moves the row the stats migration keyed by the day an hour-off start was stored for', async () => {
        const offHour = { ...keyed, startDate: '2026-11-06T21:00:00.000Z' }
        mockReadOrganizerEventStatsRow.mockResolvedValueOnce(undefined).mockResolvedValueOnce(stats)

        await moveOrganizerEventStats(offHour, later)

        expect(mockReadOrganizerEventStatsRow).toHaveBeenNthCalledWith(2, { ...keyed, startDate: '2026-11-07' })
        expect(mockMoveOrganizerEventStatsRow).toHaveBeenCalledWith(
          { ...keyed, startDate: '2026-11-07' },
          later,
          stats,
          expect.any(String)
        )
      })

      it('leaves a row already keyed by the day the save keeps', async () => {
        mockReadOrganizerEventStatsRow.mockResolvedValueOnce(undefined).mockResolvedValueOnce(stats)

        await moveOrganizerEventStats(instant, keyed)

        expect(mockMoveOrganizerEventStatsRow).not.toHaveBeenCalled()
      })

      // A start worked out with the other season's offset was stored an hour off the Finnish midnight.
      it.each([
        ['an hour before', '2026-11-07', '2026-11-06T22:00:00.000Z', '2026-11-06T21:00:00.000Z'],
        ['an hour after', '2026-06-15', '2026-06-14T21:00:00.000Z', '2026-06-14T22:00:00.000Z'],
      ])('moves the row keyed by a start stored %s its day', async (_name, day, midnight, offHour) => {
        const offKeyed = { ...keyed, startDate: day }
        mockReadOrganizerEventStatsRow.mockImplementation(async (source) =>
          source.startDate === offHour ? stats : undefined
        )

        await moveOrganizerEventStats(offKeyed, later)

        expect(mockReadOrganizerEventStatsRow).toHaveBeenNthCalledWith(1, offKeyed)
        expect(mockReadOrganizerEventStatsRow).toHaveBeenNthCalledWith(2, { ...keyed, startDate: midnight })
        expect(mockReadOrganizerEventStatsRow).toHaveBeenCalledWith({ ...keyed, startDate: offHour })
        expect(mockMoveOrganizerEventStatsRow).toHaveBeenCalledWith(
          { ...keyed, startDate: offHour },
          later,
          stats,
          expect.any(String)
        )
      })

      it('picks up no row an unrelated instant of the same day keys, only the forms a start was stored in', async () => {
        const offKeyed = { ...keyed, startDate: '2026-11-07' }
        mockReadOrganizerEventStatsRow.mockImplementation(async (source) =>
          source.startDate === '2026-11-07T00:00:00.000Z' ? stats : undefined
        )

        await moveOrganizerEventStats(offKeyed, later)

        expect(mockReadOrganizerEventStatsRow).toHaveBeenCalledTimes(4)
        expect(mockMoveOrganizerEventStatsRow).not.toHaveBeenCalled()
      })

      // Dev holds starts in offset form, as e2e runs wrote them: the row is found under the start as stored.
      it.each(['2026-09-02T00:00:00.000+03:00', '2026-02-01T00:00:00.000+02:00'])(
        'reads a start stored in offset form %s first, as the row stores it',
        async (startDate) => {
          const offset = { ...keyed, startDate }
          mockReadOrganizerEventStatsRow.mockResolvedValueOnce({ ...stats, SK: `${startDate}#e5` })

          await moveOrganizerEventStats(offset, later)

          expect(mockReadOrganizerEventStatsRow).toHaveBeenCalledTimes(1)
          expect(mockReadOrganizerEventStatsRow).toHaveBeenCalledWith(offset)
          expect(mockMoveOrganizerEventStatsRow).toHaveBeenCalledWith(
            offset,
            later,
            { ...stats, SK: `${startDate}#e5` },
            expect.any(String)
          )
        }
      )

      it('reads the start an hour off first, as the row stores it, before its day key', async () => {
        const offHour = { ...keyed, startDate: '2026-11-06T21:00:00.000Z' }
        mockReadOrganizerEventStatsRow.mockResolvedValueOnce(stats)

        await moveOrganizerEventStats(offHour, later)

        expect(mockReadOrganizerEventStatsRow).toHaveBeenCalledTimes(1)
        expect(mockReadOrganizerEventStatsRow).toHaveBeenCalledWith(offHour)
        expect(mockMoveOrganizerEventStatsRow).toHaveBeenCalledWith(offHour, later, stats, expect.any(String))
      })

      it('reads no other form of a start with no day', async () => {
        mockReadOrganizerEventStatsRow.mockResolvedValueOnce(undefined)

        await moveOrganizerEventStats({ ...keyed, startDate: 'not-a-date' }, later)

        expect(mockReadOrganizerEventStatsRow).toHaveBeenCalledTimes(1)
        expect(mockMoveOrganizerEventStatsRow).not.toHaveBeenCalled()
      })
    })

    it('also moves the record across partitions when the organizer changes', async () => {
      mockReadOrganizerEventStatsRow.mockResolvedValueOnce(stats)
      const otherOrganizer = { ...event, organizer: { id: 'org2' } }

      await moveOrganizerEventStats(event, otherOrganizer)

      expect(mockMoveOrganizerEventStatsRow).toHaveBeenCalledWith(event, otherOrganizer, stats, expect.any(String))
    })

    it('re-reads and retries when a concurrent registration write races the move', async () => {
      // A registration write landing on the old key between the read and the delete bumps its
      // updatedAt, failing the delete's condition; the move must pick up that fresh increment
      // instead of silently discarding it.
      const fresh = { ...stats, count: 8, updatedAt: '2024-06-20T00:05:00.000Z' }
      mockReadOrganizerEventStatsRow
        .mockResolvedValueOnce({ ...stats, count: 7, updatedAt: '2024-06-20T00:00:00.000Z' })
        .mockResolvedValueOnce(fresh)
      mockMoveOrganizerEventStatsRow
        .mockRejectedValueOnce({ name: 'TransactionCanceledException' })
        .mockResolvedValueOnce(undefined)

      await moveOrganizerEventStats(event, moved)

      expect(mockReadOrganizerEventStatsRow).toHaveBeenCalledTimes(2)
      expect(mockMoveOrganizerEventStatsRow).toHaveBeenCalledTimes(2)
      expect(mockMoveOrganizerEventStatsRow).toHaveBeenLastCalledWith(event, moved, fresh, expect.any(String))
    })

    it('gives up after exhausting the retry budget', async () => {
      mockReadOrganizerEventStatsRow.mockResolvedValue({ ...stats, updatedAt: '2024-06-20T00:00:00.000Z' })
      mockMoveOrganizerEventStatsRow.mockRejectedValue({ name: 'TransactionCanceledException' })

      await expect(moveOrganizerEventStats(event, moved)).rejects.toEqual({ name: 'TransactionCanceledException' })
      expect(mockMoveOrganizerEventStatsRow).toHaveBeenCalledTimes(8)
    })

    it('rethrows a non-cancellation error untouched', async () => {
      mockReadOrganizerEventStatsRow.mockResolvedValueOnce({ ...stats, updatedAt: '2024-06-20T00:00:00.000Z' })
      const failure = new Error('boom')
      mockMoveOrganizerEventStatsRow.mockRejectedValueOnce(failure)

      await expect(moveOrganizerEventStats(event, moved)).rejects.toThrow(failure)
      expect(mockReadOrganizerEventStatsRow).toHaveBeenCalledTimes(1)
    })
  })

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
    const workload = (organizerId: string, judgeId: string, name: string, count: number) => ({
      count,
      judgeId,
      name,
      organizerId,
      PK: 'JUDGE#2024',
      SK: `${organizerId}#${judgeId}`,
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
        { count: 12, judgeId: '1', name: 'Matti Meikäläinen' },
        { count: 4, judgeId: 'Foreign Judge', name: 'Foreign Judge' },
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
        { count: 5, judgeId: '1', name: 'Matti Meikäläinen' },
        { count: 1, judgeId: '2', name: 'Maija Mallikas' },
      ])
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
  describe('sumNewRegistrationStatDeltas', () => {
    const base = { eventId: 'e1', eventType: 'NOME-B' }

    it('adds up registrations that are all new to the event (KOE-1471)', () => {
      expect(
        sumNewRegistrationStatDeltas([
          { ...base, id: 'r1', paidAmount: 50 },
          { ...base, cancelled: true, id: 'r2', paidAmount: 40, refundAmount: 40 },
          { ...base, group: { key: 'reserve', number: 1 }, id: 'r3' },
        ])
      ).toEqual({
        cancelledDelta: 1,
        memberDelta: 0,
        paidAmountDelta: 90,
        paidDelta: 2,
        refundedAmountDelta: 40,
        refundedDelta: 1,
        // A cancelled registration is no longer on the reserve list
        reserveDelta: 2,
        totalDelta: 3,
      })
    })

    it('is all zeros without registrations', () => {
      expect(Object.values(sumNewRegistrationStatDeltas([]))).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    })
  })

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
        memberDelta: 0,
        paidAmountDelta: 50,
        paidDelta: 1,
        refundedAmountDelta: 0,
        refundedDelta: 0,
        reserveDelta: 1,
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
        memberDelta: 0,
        paidAmountDelta: 0,
        paidDelta: 0,
        refundedAmountDelta: 25,
        refundedDelta: 1,
        reserveDelta: -1,
        totalDelta: 0,
      })
    })

    it('handles null values correctly', () => {
      // Legacy rows can hold nulls where the type says number | undefined
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
        memberDelta: 0,
        paidAmountDelta: 50,
        paidDelta: 1,
        refundedAmountDelta: 0,
        refundedDelta: 0,
        reserveDelta: 0,
        totalDelta: 0,
      })
    })
  })

  describe('updateOrganizerEventStats', () => {
    it('adds the deltas to the organizer stats of the event', async () => {
      const event = asJsonConfirmedEvent({
        id: 'event456',
        organizer: { id: 'org123' },
        startDate: '2024-06-15',
      })

      const deltas = {
        cancelledDelta: 0,
        memberDelta: 1,
        paidAmountDelta: 50,
        paidDelta: 1,
        refundedAmountDelta: 0,
        refundedDelta: 0,
        reserveDelta: 0,
        totalDelta: 1,
      }

      await updateOrganizerEventStats(event, deltas)

      expect(mockAddOrganizerEventStats).toHaveBeenCalledWith(event, deltas, expect.any(String))
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
