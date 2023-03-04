import { Event } from 'koekalenteri-shared/model'

import http from './http'

export const PATH = '/event/'

export async function getEvents(signal?: AbortSignal): Promise<Event[]> {
  return http.get<Event[]>(PATH, { signal })
}

export async function getEvent(id: string, signal?: AbortSignal): Promise<Event> {
  return http.get<Event>(`${PATH}${id}`, { signal })
}

export async function putEvent(event: Partial<Event>, token?: string): Promise<Event> {
  return http.post<Partial<Event>, Event>(PATH, event, {
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
    },
  })
}
