import type { CollectionResponse, EventType, EventTypeData, IncrementalCollectionResponse } from '../types'
import http, { withToken } from './http'

const PATH = '/admin/eventType/'

export function getEventTypes(token: string, refresh?: boolean, signal?: AbortSignal): Promise<EventType[]>
export function getEventTypes(
  token: string,
  refresh: boolean | undefined,
  signal: AbortSignal | undefined,
  since: Date
): Promise<IncrementalCollectionResponse<EventType>>
export async function getEventTypes(
  token: string,
  refresh?: boolean,
  signal?: AbortSignal,
  since?: Date
): Promise<CollectionResponse<EventType>> {
  const query = [refresh ? 'refresh' : '', since ? `since=${since.getTime()}` : ''].filter(Boolean).join('&')
  return http.get<CollectionResponse<EventType>>(PATH + (query ? `?${query}` : ''), withToken({ signal }, token))
}

export async function putEventType(eventType: EventTypeData, token?: string, signal?: AbortSignal): Promise<EventType> {
  return (await http.post<EventTypeData, EventType>(PATH, eventType, withToken({ signal }, token))).data
}
