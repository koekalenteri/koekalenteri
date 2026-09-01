import type { PublicStationTurn, StationEntry, StationTurn, StationTurnOp } from '../types'
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

/** The event secretary's turn writes (KOE-1259): one op against one post's live timeline. */
export async function putStationTurn(
  eventId: string,
  op: StationTurnOp & { stationId?: string },
  token: string,
  signal?: AbortSignal
): Promise<{ turns: StationTurn[] }> {
  return http.put<StationTurnOp & { stationId?: string }, { turns: StationTurn[] }>(
    `/admin/turns/${eventId}`,
    op,
    withToken({ signal }, token)
  )
}

/** The same turn ops through the station's own tokenized link, scoped to the link's post. */
export async function putStationEntryTurn(
  eventId: string,
  stationId: string,
  op: StationTurnOp,
  token: string,
  signal?: AbortSignal
): Promise<{ turns: PublicStationTurn[] }> {
  return (
    await http.post<StationTurnOp, { turns: PublicStationTurn[] }>(
      `/station-entry/${eventId}/${stationId}/turn`,
      op,
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
