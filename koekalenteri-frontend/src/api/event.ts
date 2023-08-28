import type { Event } from 'koekalenteri-shared/model'

import { addDays, nextSaturday, startOfDay } from 'date-fns'

import http, { withToken } from './http'

const PATH = '/event/'
const ADMIN_PATH = '/admin/event/'

export async function getEvents(signal?: AbortSignal): Promise<Event[]> {
  return http.get<Event[]>(PATH, { signal })
}

export async function getEvent(id: string, signal?: AbortSignal): Promise<Event> {
  return http.get<Event>(`${PATH}${id}`, { signal })
}

export async function putEvent(event: Partial<Event>, token?: string, signal?: AbortSignal): Promise<Event> {
  return http.post<Partial<Event>, Event>(ADMIN_PATH, event, withToken({ signal }, token))
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
  return http.post<{ id: string; startDate: Date }, Event>(
    ADMIN_PATH + 'copy',
    { id: eventId, startDate: startOfDay(nextSaturday(addDays(Date.now(), 90))) },
    withToken({ signal }, token)
  )
}
