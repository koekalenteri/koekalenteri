import type {
  CollectionResponse,
  EventType,
  EventTypeData,
  IncrementalCollectionResponse,
  JsonEventType,
} from '../types'
import { toEventType } from '../lib/wire'
import http, { withToken } from './http'
import { getIncrementalCollection } from './incrementalCollection'

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
  return getIncrementalCollection<JsonEventType, EventType>(PATH, token, refresh, signal, since, toEventType)
}

export async function putEventType(eventType: EventTypeData, token?: string, signal?: AbortSignal): Promise<EventType> {
  return toEventType(
    (await http.post<EventTypeData, JsonEventType>(PATH, eventType, withToken({ signal }, token))).data
  )
}
