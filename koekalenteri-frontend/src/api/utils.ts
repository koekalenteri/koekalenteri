import type { Event, EventEx } from 'koekalenteri-shared/model';
import { endOfDay, startOfDay, subDays } from 'date-fns';

// https://stackoverflow.com/a/69756175/10359775
type PickByType<T, Value> = {
  [P in keyof T as T[P] extends Value | undefined ? P : never]: T[P]
}
type EventDates = keyof PickByType<Event, Date>;

const EVENT_DATE_PROPS: EventDates[] = ['startDate', 'endDate', 'entryStartDate', 'entryEndDate', 'createdAt', 'modifiedAt'];

export function rehydrateEvent(event: Event, now = new Date()): EventEx {

  for (const prop of EVENT_DATE_PROPS) {
    event[prop] = event[prop] && new Date(event[prop]);
  }

  for (const cls of event.classes) {
    if (typeof cls === 'string') {
      continue;
    }
    cls.date = new Date(cls.date);
  }

  const isEntryOpen = startOfDay(event.entryStartDate) <= now && endOfDay(event.entryEndDate) >= now;
  return {
    ...event,
    isEntryOpen,
    isEntryClosing: isEntryOpen && subDays(event.entryEndDate, 7) <= endOfDay(now),
    isEntryUpcoming: event.entryStartDate > now
  };
}
