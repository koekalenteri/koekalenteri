import type { CollectionResponse, IncrementalCollectionResponse, Judge } from '../types'
import http, { withToken } from './http'
import { getIncrementalCollection } from './incrementalCollection'

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
  return getIncrementalCollection(PATH, token, refresh, signal, since)
}

export async function putJudge(judge: Judge, token: string, signal?: AbortSignal): Promise<Judge> {
  return (await http.post<Judge, Judge>(PATH, judge, withToken({ signal }, token))).data
}
