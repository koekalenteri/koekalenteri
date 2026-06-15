import type { DogEvent, EventClass, Patch, PublicDogEvent } from '../types'
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

export type EventKcIdChoice = {
  id: number
  name: string
  eventType: string
  startDate: Date
  endDate: Date
  organizer: string
  location: string
}

export type SearchEventKcIdChoicesResponse = {
  choices: EventKcIdChoice[]
}

export type SearchEventKcIdChoicesRequest = Pick<
  DogEvent,
  'classes' | 'endDate' | 'eventType' | 'location' | 'name' | 'startDate'
> & {
  classes: Pick<EventClass, 'class' | 'date'>[]
  organizer: Pick<DogEvent['organizer'], 'id'>
}

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

export async function putEvent(event: Patch<DogEvent>, token?: string, signal?: AbortSignal): Promise<DogEvent> {
  const request = withToken({ signal }, token)
  return event.id
    ? (await http.patch<Patch<DogEvent>, DogEvent>(ADMIN_PATH, event, request)).data
    : (await http.post<Patch<DogEvent>, DogEvent>(ADMIN_PATH, event, request)).data
}

export async function searchEventKcIdChoices(
  request: SearchEventKcIdChoicesRequest,
  token?: string,
  signal?: AbortSignal
): Promise<SearchEventKcIdChoicesResponse> {
  return (
    await http.post<SearchEventKcIdChoicesRequest, SearchEventKcIdChoicesResponse>(
      `${ADMIN_PATH}kcId/choices`,
      request,
      withToken({ signal }, token)
    )
  ).data
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
