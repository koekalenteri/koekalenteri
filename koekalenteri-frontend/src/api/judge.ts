import type { Judge } from 'koekalenteri-shared/model'

import http from './http'

const PATH = '/judge/'

export async function getJudges(refresh?: boolean, signal?: AbortSignal) {
  const qs = refresh ? '?refresh' : ''
  return http.get<Array<Judge>>(PATH + qs, {signal})
}

export async function putJudge(judge: Judge, token?: string): Promise<Judge> {
  return http.post<Judge, Judge>(PATH, judge, {
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
    },
  })
}
