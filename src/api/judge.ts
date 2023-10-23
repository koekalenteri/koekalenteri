import type { Judge } from '../types'

import http, { withToken } from './http'

const PATH = '/judge/'

export async function getJudges(refresh?: boolean, token?: string, signal?: AbortSignal) {
  const qs = refresh ? '?refresh' : ''
  return http.get<Array<Judge>>(PATH + qs, withToken({ signal }, token))
}

export async function putJudge(judge: Judge, token?: string, signal?: AbortSignal): Promise<Judge> {
  return http.post<Judge, Judge>(PATH, judge, withToken({ signal }, token))
}
