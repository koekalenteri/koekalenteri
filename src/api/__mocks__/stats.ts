import type { EventStatsItem } from '../../types/Stats'
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

export async function getYearlyStats(_year: number, _signal?: AbortSignal): Promise<YearlyStatsResponse> {
  return new Promise((resolve) => {
    process.nextTick(() => resolve(mockYearStats))
  })
}

export async function getAllYearlyStats(_signal?: AbortSignal): Promise<AllYearlyStatsResponse> {
  return new Promise((resolve) => {
    process.nextTick(() => resolve(mockAllStats))
  })
}

export const getOrganizerEventStats = vi.fn(
  async (
    _token: string,
    _organizerId?: string,
    _from?: string,
    _to?: string,
    _signal?: AbortSignal
  ): Promise<EventStatsItem[]> => []
)
