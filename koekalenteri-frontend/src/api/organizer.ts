import type { Organizer } from 'koekalenteri-shared/model'

import http, { withToken } from './http'

const PATH = '/organizer/'

export async function getOrganizers(refresh?: boolean, token?: string, signal?: AbortSignal) {
  const qs = refresh ? '?refresh' : ''
  return http.get<Array<Organizer>>(PATH + qs, withToken({ signal }, token))
}
