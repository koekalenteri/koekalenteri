import type { Event, EventEx, JsonEvent } from 'shared';
import { endOfDay, startOfDay, subDays } from 'date-fns';
import { DEFAULT_EVENT } from './defaultEvent';

// https://stackoverflow.com/a/69756175/10359775
type PickByType<T, Value> = {
  [P in keyof T as T[P] extends Value ? P : never]: T[P]
}
type EventDates = keyof PickByType<Event, Date|undefined>;

const EVENT_DATE_PROPS: EventDates[] = ['startDate', 'endDate', 'entryStartDate', 'entryEndDate', 'createdAt', 'modifiedAt'];

export function toDate(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function rehydrateDate(value: string | number | Date | undefined) {
  if (value instanceof Date) {
    return value;
  }
  if (value) {
    return new Date(value);
  }
}

export function rehydrateEvent(event: Partial<JsonEvent> | Partial<Event>, now = new Date()): EventEx {
  for (const prop of EVENT_DATE_PROPS) {
    event[prop] = rehydrateDate(event[prop]);
  }
  if (event.deletedAt) {
    event.deletedAt = new Date(event.deletedAt);
  }

  for (const cls of event.classes || []) {
    if (typeof cls === 'string') {
      continue;
    }
    cls.date = rehydrateDate(cls.date || event.startDate);
  }

  let isEntryOpen = false;
  let isEntryClosing = false;
  let isEntryUpcoming = false;

  if (event.entryStartDate && event.entryEndDate) {
    isEntryOpen = event.state === 'confirmed' &&
      startOfDay(event.entryStartDate as Date) <= now &&
      endOfDay(event.entryEndDate as Date) >= now;
    isEntryClosing = isEntryOpen && subDays(event.entryEndDate as Date, 7) <= endOfDay(now);
    isEntryUpcoming = event.entryStartDate > now;
  }

  return {
    ...DEFAULT_EVENT,
    ...event as Partial<Event>,
    isEntryOpen,
    isEntryClosing,
    isEntryUpcoming
  };
}
