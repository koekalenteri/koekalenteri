import type { EventType } from '../types'

import http, { withToken } from './http'

const PATH = '/eventType/'

export async function getEventTypes(refresh?: boolean, signal?: AbortSignal) {
  const qs = refresh ? '?refresh' : ''
  return http.get<Array<EventType>>(PATH + qs, { signal })
}

export async function putEventType(eventType: EventType, token?: string, signal?: AbortSignal): Promise<EventType> {
  return http.post<EventType, EventType>(PATH, eventType, withToken({ signal }, token))
}
