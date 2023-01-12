import { addDays, parseISO, startOfDay } from "date-fns"

import { emptyEvent } from "../api/test-utils/emptyEvent"

const today = startOfDay(new Date())

export const eventWithStaticDates = {
  ...emptyEvent,
  id: 'test1',
  eventType: 'type1',
  classes: [{ class: 'class1' }],
  startDate: parseISO('2021-02-10'),
  endDate: parseISO('2021-02-11'),
  entryStartDate: parseISO('2021-02-01'),
  entryEndDate: parseISO('2021-02-07'),
  judges: [123],
  location: 'test location',
}

export const eventWithEntryOpen = {
  ...emptyEvent,
  id: 'test3',
  eventType: 'type3',
  classes: [{ class: 'class3' }],
  startDate: addDays(today, 14),
  endDate: addDays(today, 15),
  entryStartDate: today, // entry starts today
  entryEndDate: addDays(today, 8), // over week from today
  judges: [223],
  places: 10,
  entries: 7,
}

export const eventWithEntryNotYetOpen = {
  ...emptyEvent,
  id: 'test4',
  eventType: 'type4',
  classes: [{ class: 'class4' }],
  startDate: addDays(today, 14),
  endDate: addDays(today, 15),
  entryStartDate: addDays(today, 1), // entry not open yet
  entryEndDate: addDays(today, 8),
  judges: [223],
  places: 10,
  entries: undefined,
}

export const eventWithEntryClosing = {
  ...emptyEvent,
  id: 'test5',
  eventType: 'type5',
  classes: [{ class: 'class5' }],
  startDate: addDays(today, 24),
  endDate: addDays(today, 25),
  entryStartDate: addDays(today, -1),
  entryEndDate: addDays(today, 6),
  judges: [223],
  places: 10,
  entries: 10,
}
