import http from './http';
import { Event } from "koekalenteri-shared";

const PATH = '/event/';

// https://stackoverflow.com/a/69756175/10359775
type PickByType<T, Value> = {
  [P in keyof T as T[P] extends Value | undefined ? P : never]: T[P]
}
type EventDates = keyof PickByType<Event, Date>;

const EVENT_DATE_PROPS: EventDates[] = ['startDate', 'endDate', 'entryStartDate', 'entryEndDate', 'createdAt', 'modifiedAt'];

function reviveDates(event: Event) {
  for (const prop of EVENT_DATE_PROPS) {
    event[prop] = event[prop] && new Date(event[prop]);
  }
  for (const cls of event.classes) {
    if (typeof cls === 'string') {
      continue;
    }
    cls.date = new Date(cls.date);
  }
  return event;
}

export async function getEvents() {
  const jsonedEvents = await http.get<Array<Event>>(PATH);
  return jsonedEvents.map(event => reviveDates(event));
}

export async function getEvent(eventType: string, id: string, signal?: AbortSignal) {
  const jsonedEvent = await http.get<Event>(`${PATH}${eventType}/${id}`, {signal});
  return reviveDates(jsonedEvent);
}
