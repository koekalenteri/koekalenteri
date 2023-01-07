import { addDays, startOfDay } from "date-fns"

import { emptyEvent } from "../api/test-utils/emptyEvent"

const today = startOfDay(new Date())

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
  entries: 0,
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
