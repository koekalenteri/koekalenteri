import http from './http';
import { Event } from "koekalenteri-shared/model/Event";

export async function getEvents() {
  return await http.get<Array<Event>>('event/');
}

export async function getEvent(id: string) {
  return await http.get<Event[]>(`event/?${id}`);
}
