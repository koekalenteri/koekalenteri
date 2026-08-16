import type { CollectionResponse, IncrementalCollectionResponse, Official } from '../types'
import { getIncrementalCollection } from './incrementalCollection'

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
  return getIncrementalCollection(PATH, token, refresh, signal, since)
}
