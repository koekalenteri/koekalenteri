import type { DogEvent, PublicDogEvent } from '../types'
import { addDays, nextSaturday } from 'date-fns'
import { zonedStartOfDay } from '../i18n/dates'
import http, { withToken } from './http'

const PATH = '/event/'
const ADMIN_PATH = '/admin/event/'

export async function getEvents(
  start?: Date,
  end?: Date,
  since?: number,
  signal?: AbortSignal
): Promise<PublicDogEvent[]> {
  const params = new URLSearchParams()

  if (start) params.append('start', start.toISOString())
  if (end) params.append('end', end.toISOString())
  if (since) params.append('since', since.toString())

  const query = params.toString()
  const url = query ? `${PATH}?${query}` : PATH

  return http.get<PublicDogEvent[]>(url, { signal })
}

export async function getAdminEvents(token?: string, lastModified?: number, signal?: AbortSignal): Promise<DogEvent[]> {
  const qs = lastModified ? `?since=${lastModified}` : ''
  return http.get<DogEvent[]>(ADMIN_PATH + qs, withToken({ signal }, token))
}

export async function getEvent(id: string, signal?: AbortSignal): Promise<DogEvent> {
  return http.get<DogEvent>(`${PATH}${id}`, { signal })
}

export async function getAdminEvent(id: string, token?: string, signal?: AbortSignal): Promise<DogEvent> {
  return http.get<DogEvent>(`${ADMIN_PATH}${id}`, withToken({ signal }, token))
}

export async function putEvent(event: Partial<DogEvent>, token?: string, signal?: AbortSignal): Promise<DogEvent> {
  return http.post<Partial<DogEvent>, DogEvent>(ADMIN_PATH, event, withToken({ signal }, token))
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
  return http.post<{ id: string; startDate: Date }, DogEvent>(
    `${ADMIN_PATH}copy`,
    { id: eventId, startDate: zonedStartOfDay(nextSaturday(addDays(Date.now(), 90))) },
    withToken({ signal }, token)
  )
}
