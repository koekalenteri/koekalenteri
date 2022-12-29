import type { Official } from 'koekalenteri-shared/model'

import http from './http'

const PATH = '/official/'

export async function getOfficials(refresh?: boolean, signal?: AbortSignal) {
  const qs = refresh ? '?refresh' : ''
  return http.get<Array<Official>>(PATH + qs, {signal})
}
