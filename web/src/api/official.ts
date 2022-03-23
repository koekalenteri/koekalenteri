import http from './http';
import type { Official } from 'shared';

const PATH = '/official/';

export async function getOfficials(signal?: AbortSignal) {
  return http.get<Array<Official>>(PATH, {signal});
}
