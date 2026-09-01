import type { StationEntry } from '../types'
import type { EventResultSubmission, EventResultsResponse } from './registration'
import http, { withToken } from './http'

/** The station secretary's view, authorized by the station's own link token instead of a login. */
export async function getStationEntry(
  eventId: string,
  stationId: string,
  token: string,
  signal?: AbortSignal
): Promise<StationEntry> {
  return http.get<StationEntry>(`/station-entry/${eventId}/${stationId}`, withToken({ signal }, token))
}

export async function putStationEntry(
  eventId: string,
  stationId: string,
  results: EventResultSubmission[],
  token: string,
  signal?: AbortSignal
): Promise<EventResultsResponse> {
  return (
    await http.post<EventResultSubmission[], EventResultsResponse>(
      `/station-entry/${eventId}/${stationId}`,
      results,
      withToken({ signal }, token)
    )
  ).data
}

/** The token behind a station's shareable link; the secretary side of the same mechanism. */
export async function getStationLink(
  eventId: string,
  stationId: string,
  token: string,
  signal?: AbortSignal
): Promise<{ token: string }> {
  return http.get<{ token: string }>(`/admin/station-link/${eventId}/${stationId}`, withToken({ signal }, token))
}
