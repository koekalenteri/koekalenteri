import type {
  EventResultsResponse,
  JsonEventResultsResponse,
  JsonPublicStationTurn,
  JsonStationEntry,
  JsonStationTurn,
  PublicStationTurn,
  StationEntry,
  StationTurn,
  StationTurnOp,
} from '../types'
import type { EventResultSubmission } from './registration'
import { toEventResultsResponse, toPublicStationTurn, toStationEntry, toStationTurn } from '../lib/wire'
import http, { withToken } from './http'

/** Live entry: the judge's secretary's view, authorized by the post's own link token instead of a login. */
export async function getStationEntry(
  eventId: string,
  stationId: string,
  token: string,
  signal?: AbortSignal
): Promise<StationEntry> {
  return toStationEntry(
    await http.get<JsonStationEntry>(`/station-entry/${eventId}/${stationId}`, withToken({ signal }, token))
  )
}

export async function putStationEntry(
  eventId: string,
  stationId: string,
  results: EventResultSubmission[],
  token: string,
  signal?: AbortSignal
): Promise<EventResultsResponse> {
  return toEventResultsResponse(
    (
      await http.post<EventResultSubmission[], JsonEventResultsResponse>(
        `/station-entry/${eventId}/${stationId}`,
        results,
        withToken({ signal }, token)
      )
    ).data
  )
}

/** The event secretary's turn writes (KOE-1259): one op against one post's live timeline. */
export async function putStationTurn(
  eventId: string,
  op: StationTurnOp & { stationId?: string },
  token: string,
  signal?: AbortSignal
): Promise<{ turns: StationTurn[] }> {
  const { turns } = await http.put<StationTurnOp & { stationId?: string }, { turns: JsonStationTurn[] }>(
    `/admin/turns/${eventId}`,
    op,
    withToken({ signal }, token)
  )
  return { turns: turns.map(toStationTurn) }
}

/** The same turn ops through the station's own tokenized link, scoped to the link's post. */
export async function putStationEntryTurn(
  eventId: string,
  stationId: string,
  op: StationTurnOp,
  token: string,
  signal?: AbortSignal
): Promise<{ turns: PublicStationTurn[] }> {
  const { turns } = (
    await http.post<StationTurnOp, { turns: JsonPublicStationTurn[] }>(
      `/station-entry/${eventId}/${stationId}/turn`,
      op,
      withToken({ signal }, token)
    )
  ).data
  return { turns: turns.map(toPublicStationTurn) }
}

/** The token behind a post's live entry link; the event secretary's side of the same mechanism. */
export async function getStationLink(
  eventId: string,
  stationId: string,
  token: string,
  signal?: AbortSignal
): Promise<{ token: string }> {
  return http.get<{ token: string }>(`/admin/station-link/${eventId}/${stationId}`, withToken({ signal }, token))
}
