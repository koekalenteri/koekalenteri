import type { ConfirmedEventEx, Event, EventEx, JsonEvent } from 'koekalenteri-shared/model';
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
  let isEntryClosed = false;
  let isEventUpcoming = false;
  let isEventOngoing = false;
  let isEventOver = false;

  if (event.state === 'confirmed') {
    const confirmedEvent = event as ConfirmedEventEx;
    isEventUpcoming = confirmedEvent.startDate > now;
    isEntryUpcoming = confirmedEvent.entryStartDate > now;
    isEntryOpen = startOfDay(confirmedEvent.entryStartDate) <= now &&
      endOfDay(confirmedEvent.entryEndDate) >= now;
    isEntryClosing = isEntryOpen && subDays(confirmedEvent.entryEndDate, 7) <= endOfDay(now);
    isEntryClosed = endOfDay(confirmedEvent.entryEndDate) < now &&
      startOfDay(confirmedEvent.startDate) > now;
    isEventOngoing = confirmedEvent.startDate <= now && confirmedEvent.endDate >= now;
    isEventOver = confirmedEvent.endDate < now;
  }

  let statusText: 'tentative' | 'cancelled' | 'extended' | undefined;
  if (event.state === 'tentative' || event.state === 'cancelled') {
    statusText = event.state;
  }
  if (event.entryOrigEndDate) {
    statusText = 'extended';
  }

  return {
    ...DEFAULT_EVENT,
    ...event as Partial<Event>,
    isEntryUpcoming,
    isEntryOpen,
    isEntryClosing,
    isEntryClosed,
    isEventUpcoming,
    isEventOngoing,
    isEventOver,
    statusText
  };
}
