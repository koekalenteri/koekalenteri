import http from './http';
import type { Organizer } from 'shared';

const PATH = '/organizer/';

export async function getOrganizers(signal?: AbortSignal) {
  return http.get<Array<Organizer>>(PATH, {signal});
}
