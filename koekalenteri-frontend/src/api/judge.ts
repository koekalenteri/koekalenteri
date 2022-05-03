import http from './http';
import type { Judge } from 'koekalenteri-shared/model';

const PATH = '/judge/';

export async function getJudges(refresh?: boolean, signal?: AbortSignal) {
  const qs = refresh ? '?refresh' : '';
  return http.get<Array<Judge>>(PATH + qs, {signal});
}

export async function putJudge(judge: Judge): Promise<Judge> {
  return http.post<Judge, Judge>(PATH, judge);
}
