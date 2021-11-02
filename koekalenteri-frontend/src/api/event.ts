import http from './http';
import { Event } from "koekalenteri-shared";

const PATH = '/event/';

export async function getEvents() {
  return http.get<Array<Event>>(PATH);
}

export async function getEvent(id: string) {
  return http.get<Event>(`${PATH}?${id}`);
}
