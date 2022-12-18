import type { Organizer } from 'koekalenteri-shared/model';

import http from './http';

const PATH = '/organizer/';

export async function getOrganizers(refresh?: boolean, signal?: AbortSignal) {
  const qs = refresh ? '?refresh' : '';
  return http.get<Array<Organizer>>(PATH + qs, {signal});
}
