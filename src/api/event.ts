import type { DogEvent, PublicDogEvent } from '../types'
import { addDays, nextSaturday } from 'date-fns'
import { zonedStartOfDay } from '../i18n/dates'
import { dedupeInFlight } from './dedupeInFlight'
import http, { withToken } from './http'

const PATH = '/event/'
const ADMIN_PATH = '/admin/event/'

export type PublicEventsDeltaResponse = {
  events: PublicDogEvent[]
  unchangedIds: string[]
}

export type PublicEventsResponse = PublicDogEvent[] | PublicEventsDeltaResponse

function isPublicEventsDeltaResponse(response: PublicEventsResponse): response is PublicEventsDeltaResponse {
  return !Array.isArray(response)
}

export const getEvents = dedupeInFlight(
  (start?: Date, end?: Date, since?: number, _signal?: AbortSignal) =>
    [start?.getTime() ?? 'none', end?.getTime() ?? 'none', since ?? 'none'].join(':'),
  async (start?: Date, end?: Date, since?: number, signal?: AbortSignal): Promise<PublicEventsDeltaResponse> => {
    const params = new URLSearchParams()

    if (start) params.append('start', start.getTime().toString())
    if (end) params.append('end', end.getTime().toString())
    if (since) params.append('since', since.toString())

    const query = params.toString()
    const url = query ? `${PATH}?${query}` : PATH

    const response = await http.get<PublicEventsResponse>(url, { signal })

    if (isPublicEventsDeltaResponse(response)) return response

    return { events: response, unchangedIds: [] }
  }
)

export const getEvent = dedupeInFlight(
  (id: string, _signal?: AbortSignal) => id,
  async (id: string, signal?: AbortSignal) => http.get<DogEvent>(`${PATH}${id}`, { signal })
)

export async function getAdminEvents(token?: string, lastModified?: number, signal?: AbortSignal): Promise<DogEvent[]> {
  const qs = lastModified ? `?since=${lastModified}` : ''
  return http.get<DogEvent[]>(ADMIN_PATH + qs, withToken({ signal }, token))
}

export async function getAdminEvent(id: string, token?: string, signal?: AbortSignal): Promise<DogEvent> {
  return http.get<DogEvent>(`${ADMIN_PATH}${id}`, withToken({ signal }, token))
}

export async function putEvent(event: Partial<DogEvent>, token?: string, signal?: AbortSignal): Promise<DogEvent> {
  return (await http.post<Partial<DogEvent>, DogEvent>(ADMIN_PATH, event, withToken({ signal }, token))).data
}

export async function putInvitationAttachment(
  eventId: string,
  file: File,
  token?: string,
  signal?: AbortSignal
): Promise<string> {
  const data = new FormData()
  data.append('file', file, file.name)

  return http.postRaw<FormData, string>(`/admin/file/invitation/${eventId}`, data, withToken({ signal }, token))
}

export async function copyEventWithRegistrations(eventId: string, token?: string, signal?: AbortSignal) {
  return (
    await http.post<{ id: string; startDate: Date }, DogEvent>(
      `${ADMIN_PATH}copy`,
      { id: eventId, startDate: zonedStartOfDay(nextSaturday(addDays(Date.now(), 90))) },
      withToken({ signal }, token)
    )
  ).data
}
