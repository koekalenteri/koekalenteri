import { Event, EventEx, JsonEvent } from 'koekalenteri-shared/model'

import http from './http'
import { rehydrateEvent } from './utils'

export const PATH = '/event/'

export async function getEvents(signal?: AbortSignal): Promise<EventEx[]> {
  const jsonEvents = await http.get<Array<JsonEvent>>(PATH, {signal})
  return jsonEvents.map(item => rehydrateEvent(item))
}

export async function getEvent(id: string, signal?: AbortSignal): Promise<EventEx> {
  const jsonEvent = await http.get<JsonEvent>(`${PATH}${id}`, {signal})
  return rehydrateEvent(jsonEvent)
}

export async function putEvent(event: Partial<Event>, token?: string): Promise<EventEx> {
  return rehydrateEvent(await http.post<Partial<Event>, JsonEvent>(PATH, event, {
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
    },
  }))
}


