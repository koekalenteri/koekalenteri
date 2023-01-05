import type { EventType } from 'koekalenteri-shared/model'

import http from './http'

const PATH = '/eventType/'

export async function getEventTypes(refresh?: boolean, signal?: AbortSignal) {
  const qs = refresh ? '?refresh' : ''
  return http.get<Array<EventType>>(PATH + qs, {signal})
}

export async function putEventType(eventType: EventType, token?: string): Promise<EventType> {
  return http.post<EventType, EventType>(PATH, eventType, {
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
    },
  })
}
