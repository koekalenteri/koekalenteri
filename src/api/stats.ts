import type {
  CapacityStatsEntry,
  EventStatsItem,
  RetentionStats,
  YearlyBreakdownEntry,
  YearlyTotalStat,
} from '../types/Stats'
import http, { withToken } from './http'

const PATH = '/stats'
const ADMIN_PATH = '/admin/stats'

export interface YearlyStatsResponse {
  year: number
  totals: YearlyTotalStat[]
  dogHandlerBuckets: { bucket: string; count: number }[]
  // Optional: absent when talking to a backend deployed before these breakdowns were added.
  breedBreakdown?: YearlyBreakdownEntry[]
  eventTypeBreakdown?: YearlyBreakdownEntry[]
  // Absent for the earliest year on record, and for backends deployed before retention existed.
  retention?: RetentionStats
}

export interface AllYearlyStatsResponse {
  years: number[]
  stats: YearlyStatsResponse[]
}

export async function getAllYearlyStats(signal?: AbortSignal): Promise<AllYearlyStatsResponse> {
  return http.get<AllYearlyStatsResponse>(PATH, { signal })
}

const capacityParams = (eventType: string, organizerId?: string, from?: string, to?: string) => {
  const params = new URLSearchParams({ eventType })
  if (organizerId) params.set('organizerId', organizerId)
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  return params.toString()
}

/** Nationwide totals, summed across every organizer. Public: takes no organizer filter. */
export async function getCapacityStats(
  eventType: string,
  from?: string,
  to?: string,
  signal?: AbortSignal
): Promise<CapacityStatsEntry[]> {
  const result = await http.get<{ capacityStats?: CapacityStatsEntry[] }>(
    `${PATH}?${capacityParams(eventType, undefined, from, to)}`,
    { signal }
  )
  return result.capacityStats ?? []
}

/**
 * Capacity stats narrowed to organizers the caller may see. An empty organizerId means "every
 * organizer I'm a member of" (all of them for an admin), matching getOrganizerEventStats.
 */
export async function getAdminCapacityStats(
  token: string,
  eventType: string,
  organizerId?: string,
  from?: string,
  to?: string,
  signal?: AbortSignal
): Promise<CapacityStatsEntry[]> {
  const result = await http.get<{ capacityStats?: CapacityStatsEntry[] }>(
    `${ADMIN_PATH}?${capacityParams(eventType, organizerId, from, to)}`,
    withToken({ signal }, token)
  )
  return result.capacityStats ?? []
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
