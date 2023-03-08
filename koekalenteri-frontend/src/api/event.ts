import { Event } from 'koekalenteri-shared/model'

import http, { withToken } from './http'

export const PATH = '/event/'

export async function getEvents(signal?: AbortSignal): Promise<Event[]> {
  return http.get<Event[]>(PATH, { signal })
}

export async function getEvent(id: string, signal?: AbortSignal): Promise<Event> {
  return http.get<Event>(`${PATH}${id}`, { signal })
}

export async function putEvent(event: Partial<Event>, token?: string, signal?: AbortSignal): Promise<Event> {
  return http.post<Partial<Event>, Event>(PATH, event, withToken({ signal }, token))
}
