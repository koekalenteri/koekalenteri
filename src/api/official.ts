import type { CollectionResponse, IncrementalCollectionResponse, Official } from '../types'
import http, { withToken } from './http'

const PATH = '/admin/official/'

export function getOfficials(token: string, refresh?: boolean, signal?: AbortSignal): Promise<Official[]>
export function getOfficials(
  token: string,
  refresh: boolean | undefined,
  signal: AbortSignal | undefined,
  since: Date
): Promise<IncrementalCollectionResponse<Official>>
export async function getOfficials(
  token: string,
  refresh?: boolean,
  signal?: AbortSignal,
  since?: Date
): Promise<CollectionResponse<Official>> {
  const query = [refresh ? 'refresh' : '', since ? `since=${since.getTime()}` : ''].filter(Boolean).join('&')
  return http.get<CollectionResponse<Official>>(PATH + (query ? `?${query}` : ''), withToken({ signal }, token))
}
