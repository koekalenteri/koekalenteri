import http from './http';
import type { Organizer } from 'koekalenteri-shared/model';

const PATH = '/organizer/';

export async function getOrganizers() {
  return http.get<Array<Organizer>>(PATH);
}
