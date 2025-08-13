import type { Official } from '../types'

import http, { withToken } from './http'

const PATH = '/admin/official/'

export async function getOfficials(token: string, refresh?: boolean, signal?: AbortSignal) {
  const qs = refresh ? '?refresh' : ''
  return http.get<Array<Official>>(PATH + qs, withToken({ signal }, token))
}
