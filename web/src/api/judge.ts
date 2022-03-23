import http from './http';
import type { Judge } from 'shared';

const PATH = '/judge/';

export async function getJudges(signal?: AbortSignal) {
  return http.get<Array<Judge>>(PATH, {signal});
}
