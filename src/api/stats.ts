import type { EventStatsItem, YearlyBreakdownEntry, YearlyTotalStat } from '../types/Stats'
import http, { withToken } from './http'

const PATH = '/yearly-stats'
const ADMIN_PATH = '/admin/organizer-event-stats'

export interface YearlyStatsResponse {
  year: number
  totals: YearlyTotalStat[]
  dogHandlerBuckets: { bucket: string; count: number }[]
  // Optional: absent when talking to a backend deployed before these breakdowns were added.
  breedBreakdown?: YearlyBreakdownEntry[]
  eventTypeBreakdown?: YearlyBreakdownEntry[]
}

export interface AllYearlyStatsResponse {
  years: number[]
  stats: YearlyStatsResponse[]
}

export async function getYearlyStats(year: number, signal?: AbortSignal): Promise<YearlyStatsResponse> {
  return http.get<YearlyStatsResponse>(`${PATH}?year=${year}`, { signal })
}

export async function getAllYearlyStats(signal?: AbortSignal): Promise<AllYearlyStatsResponse> {
  return http.get<AllYearlyStatsResponse>(PATH, { signal })
}

export async function getOrganizerEventStats(
  token: string,
  organizerId?: string,
  from?: string,
  to?: string,
  signal?: AbortSignal
): Promise<EventStatsItem[]> {
  const params = new URLSearchParams()
  if (organizerId) params.set('organizerId', organizerId)
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return http.get<EventStatsItem[]>(ADMIN_PATH + qs, withToken({ signal }, token))
}
