import http from './http';
import type { Judge } from 'koekalenteri-shared/model';

const PATH = '/judge/';

export async function getJudges() {
  return http.get<Array<Judge>>(PATH);
}
