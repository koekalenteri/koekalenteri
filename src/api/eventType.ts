import type { EventType, EventTypeData } from '../types'
import http, { withToken } from './http'

const PATH = '/admin/eventType/'

export async function getEventTypes(token: string, refresh?: boolean, signal?: AbortSignal) {
  const qs = refresh ? '?refresh' : ''
  return http.get<Array<EventType>>(PATH + qs, withToken({ signal }, token))
}

export async function putEventType(eventType: EventTypeData, token?: string, signal?: AbortSignal): Promise<EventType> {
  return http.post<EventTypeData, EventType>(PATH, eventType, withToken({ signal }, token))
}
