import type { CapacityStatsEntry, EventStatsItem } from '../../types/Stats'
import type { AllYearlyStatsResponse, YearlyStatsResponse } from '../stats'

const mockYearStats: YearlyStatsResponse = {
  breedBreakdown: [{ count: 10, entityId: '110' }],
  dogHandlerBuckets: [{ bucket: '1', count: 5 }],
  eventTypeBreakdown: [{ count: 20, entityId: 'NOU' }],
  totals: [
    { count: 15, type: 'dog', year: 2024 },
    { count: 8, type: 'handler', year: 2024 },
    { count: 3, type: 'breed', year: 2024 },
  ],
  year: 2024,
}

const mockAllStats: AllYearlyStatsResponse = {
  stats: [mockYearStats],
  years: [2024],
}

// vi.fn (not plain functions) so tests can assert these are *not* called; vitest is
// configured with clearMocks, which resets calls but keeps these implementations.
export const getAllYearlyStats = vi.fn(
  async (_signal?: AbortSignal): Promise<AllYearlyStatsResponse> =>
    new Promise((resolve) => {
      process.nextTick(() => resolve(mockAllStats))
    })
)

export const getOrganizerEventStats = vi.fn(
  async (
    _token: string,
    _organizerId?: string,
    _from?: string,
    _to?: string,
    _signal?: AbortSignal
  ): Promise<EventStatsItem[]> => []
)

export const getCapacityStats = vi.fn(
  async (_eventType: string, _from?: string, _to?: string, _signal?: AbortSignal): Promise<CapacityStatsEntry[]> => []
)
