import http from './http';
import type { Official } from 'koekalenteri-shared/model';

const PATH = '/official/';

export async function getOfficials() {
  return http.get<Array<Official>>(PATH);
}
