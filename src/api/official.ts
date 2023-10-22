import type { Official } from '../types'

import http, { withToken } from './http'

const PATH = '/official/'

export async function getOfficials(refresh?: boolean, token?: string, signal?: AbortSignal) {
  const qs = refresh ? '?refresh' : ''
  return http.get<Array<Official>>(PATH + qs, withToken({ signal }, token))
}
