import type { Event } from 'koekalenteri-shared/model'

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
  data.append('file', file)

  return http.post<FormData, string>(
    `/admin/file/invitation/${eventId}`,
    data,
    withToken({ headers: { 'Content-Type': 'multipart/form-data' }, signal }, token)
  )
}
