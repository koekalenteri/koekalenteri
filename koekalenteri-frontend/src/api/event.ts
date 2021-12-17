import http from './http';
import type { Event, EventEx } from 'koekalenteri-shared/model';
import { rehydrateEvent } from './utils';

const PATH = '/event/';

export async function getEvents(): Promise<EventEx[]> {
  const jsonedEvents = await http.get<Array<Event>>(PATH);
  return jsonedEvents.map(event => rehydrateEvent(event));
}

export async function getEvent(eventType: string, id: string, signal?: AbortSignal): Promise<EventEx> {
  const jsonedEvent = await http.get<Event>(`${PATH}${eventType}/${id}`, {signal});
  return rehydrateEvent(jsonedEvent);
}
