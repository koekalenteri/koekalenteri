import type { CollectionResponse, IncrementalCollectionResponse, Judge } from '../types'
import http, { withToken } from './http'

const PATH = '/admin/judge/'

export function getJudges(token: string, refresh?: boolean, signal?: AbortSignal): Promise<Judge[]>
export function getJudges(
  token: string,
  refresh: boolean | undefined,
  signal: AbortSignal | undefined,
  since: Date
): Promise<IncrementalCollectionResponse<Judge>>
export async function getJudges(
  token: string,
  refresh?: boolean,
  signal?: AbortSignal,
  since?: Date
): Promise<CollectionResponse<Judge>> {
  const query = [refresh ? 'refresh' : '', since ? `since=${since.getTime()}` : ''].filter(Boolean).join('&')
  return http.get<CollectionResponse<Judge>>(PATH + (query ? `?${query}` : ''), withToken({ signal }, token))
}

export async function putJudge(judge: Judge, token: string, signal?: AbortSignal): Promise<Judge> {
  return (await http.post<Judge, Judge>(PATH, judge, withToken({ signal }, token))).data
}
