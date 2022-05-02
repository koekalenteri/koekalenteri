import http from './http';
import type { EventType } from 'koekalenteri-shared/model';

const PATH = '/eventType/';

export async function getEventTypes(refresh?: boolean, signal?: AbortSignal) {
  const qs = refresh ? '?refresh' : '';
  return http.get<Array<EventType>>(PATH + qs, {signal});
}

export async function putEventType(eventType: EventType): Promise<EventType> {
  return http.post<EventType, EventType>(PATH, eventType);
}
