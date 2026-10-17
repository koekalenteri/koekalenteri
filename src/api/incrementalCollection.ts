import type { CollectionResponse } from '../types'
import { toCollection } from '../lib/wire'
import http, { withToken } from './http'

/** A collection as the server lists it; `convert` builds each item's model from its wire shape. */
export function getIncrementalCollection<T>(
  path: string,
  token: string,
  refresh?: boolean,
  signal?: AbortSignal,
  since?: Date
): Promise<CollectionResponse<T>>
export function getIncrementalCollection<J, M>(
  path: string,
  token: string,
  refresh: boolean | undefined,
  signal: AbortSignal | undefined,
  since: Date | undefined,
  convert: (item: J) => M
): Promise<CollectionResponse<M>>
export async function getIncrementalCollection<J, M>(
  path: string,
  token: string,
  refresh?: boolean,
  signal?: AbortSignal,
  since?: Date,
  convert?: (item: J) => M
): Promise<CollectionResponse<J | M>> {
  const query = [refresh ? 'refresh' : '', since ? `since=${since.getTime()}` : ''].filter(Boolean).join('&')
  const response = await http.get<CollectionResponse<J>>(
    path + (query ? `?${query}` : ''),
    withToken({ signal }, token)
  )
  return convert ? toCollection(response, convert) : response
}
