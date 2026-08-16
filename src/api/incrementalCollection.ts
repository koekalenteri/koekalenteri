import type { CollectionResponse } from '../types'
import http, { withToken } from './http'

export const getIncrementalCollection = <T>(
  path: string,
  token: string,
  refresh?: boolean,
  signal?: AbortSignal,
  since?: Date
): Promise<CollectionResponse<T>> => {
  const query = [refresh ? 'refresh' : '', since ? `since=${since.getTime()}` : ''].filter(Boolean).join('&')
  return http.get<CollectionResponse<T>>(path + (query ? `?${query}` : ''), withToken({ signal }, token))
}
