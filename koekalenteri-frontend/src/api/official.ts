import type { Official } from 'koekalenteri-shared/model'

import http, { withToken } from './http'

const PATH = '/official/'

export async function getOfficials(token?: string, refresh?: boolean, signal?: AbortSignal) {
  const qs = refresh ? '?refresh' : ''
  return http.get<Array<Official>>(PATH + qs, withToken({ signal }, token))
}
