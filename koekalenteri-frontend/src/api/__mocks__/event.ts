import { addDays, parseISO, startOfDay } from "date-fns";
import { Event } from "koekalenteri-shared";
import { emptyEvent } from "koekalenteri-shared/src/test-utils/emptyEvent";

const today = startOfDay(new Date());

const mockEvents: Event[] = [
  {
    ...emptyEvent,
    id: 'test1',
    eventType: 'type1',
    classes: ['class1'],
    startDate: parseISO('2021-02-10'),
    endDate: parseISO('2021-02-11'),
    entryStartDate: parseISO('2021-02-01'),
    entryEndDate: parseISO('2021-02-07'),
    judges: [123],
  },
  {
    ...emptyEvent,
    id: 'test2',
    organizer: {
      id: 2,
      name: 'Test org'
    },
    eventType: 'type2',
    classes: ['class2'],
    startDate: parseISO('2021-02-12'),
    endDate: parseISO('2021-02-13'),
    entryStartDate: parseISO('2021-02-01'),
    entryEndDate: parseISO('2021-02-12'),
    judges: [223],
  },
  {
    ...emptyEvent,
    id: 'test3',
    eventType: 'type3',
    classes: ['class3'],
    startDate: addDays(today, 14),
    endDate: addDays(today, 15),
    entryStartDate: today, // entry starts today
    entryEndDate: addDays(today, 8), // over week from today
    judges: [223],
    places: 10,
    entries: 10,
  },
  {
    ...emptyEvent,
    id: 'test4',
    eventType: 'type4',
    classes: ['class4'],
    startDate: addDays(today, 14),
    endDate: addDays(today, 15),
    entryStartDate: addDays(today, 1), // entry not open yet
    entryEndDate: addDays(today, 8),
    judges: [223],
    places: 10,
    entries: 0,
  },
  {
    ...emptyEvent,
    id: 'test5',
    eventType: 'type5',
    classes: ['class5'],
    startDate: addDays(today, 24),
    endDate: addDays(today, 25),
    entryStartDate: addDays(today, -1),
    entryEndDate: addDays(today, 6),
    judges: [223],
    places: 10,
    entries: 9,
  },
];

export async function getEvents() {
  return new Promise((resolve, reject) => {
    process.nextTick(() => resolve(mockEvents));
  });
}

export async function getEvent(eventType: string, id: string) {
  return new Promise((resolve, reject) => {
    process.nextTick(() => resolve(mockEvents.find(event => event.eventType === eventType && event.id === id)));
  });
}
