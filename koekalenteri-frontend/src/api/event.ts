import http from './http';
import { Event } from "koekalenteri-shared/model/Event";

const PATH = '/event/';

export async function getEvents() {
  return await http.get<Array<Event>>(PATH);
}

export async function getEvent(id: string) {
  return await http.get<Event>(`${PATH}?${id}`);
}
