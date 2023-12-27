import type { ConfirmedEvent } from '../types'

import { addDays, parseISO, startOfDay } from 'date-fns'

import { emptyEvent } from '../api/test-utils/emptyEvent'

const today = startOfDay(new Date())

export const eventWithStaticDates: ConfirmedEvent = {
  ...emptyEvent,
  id: 'test1',
  eventType: 'NOU',
  classes: [],
  startDate: parseISO('2021-02-10'),
  endDate: parseISO('2021-02-11'),
  entryStartDate: parseISO('2021-02-01'),
  entryEndDate: parseISO('2021-02-07'),
  judges: [{ id: 123, name: 'Tuomari 1' }],
  location: 'test location',
}

export const eventWithStaticDatesAndClass: ConfirmedEvent = {
  ...emptyEvent,
  id: 'test1-b',
  eventType: 'NOME-B',
  classes: [
    { class: 'ALO', date: parseISO('2021-02-10') },
    { class: 'ALO', date: parseISO('2021-02-11') },
  ],
  startDate: parseISO('2021-02-10'),
  endDate: parseISO('2021-02-11'),
  entryStartDate: parseISO('2021-02-01'),
  entryEndDate: parseISO('2021-02-07'),
  judges: [{ id: 123, name: 'Tuomari 1' }],
  location: 'test location',
}

export const eventWithStaticDatesAnd3Classes: ConfirmedEvent = {
  ...emptyEvent,
  id: 'test1-c',
  eventType: 'NOME-B',
  classes: [
    { class: 'ALO', date: parseISO('2021-02-10') },
    { class: 'AVO', date: parseISO('2021-02-10') },
    { class: 'VOI', date: parseISO('2021-02-11') },
  ],
  startDate: parseISO('2021-02-10'),
  endDate: parseISO('2021-02-11'),
  entryStartDate: parseISO('2021-02-01'),
  entryEndDate: parseISO('2021-02-07'),
  judges: [{ id: 123, name: 'Tuomari 1' }],
  location: 'test location',
}

export const eventWithEntryOpen: ConfirmedEvent = {
  ...emptyEvent,
  id: 'test3',
  eventType: 'NOWT',
  classes: [{ class: 'VOI', date: addDays(today, 14) }],
  startDate: addDays(today, 14),
  endDate: addDays(today, 15),
  entryStartDate: today, // entry starts today
  entryEndDate: addDays(today, 8), // over week from today
  judges: [{ id: 223, name: 'Tuomari 2' }],
  places: 10,
  entries: 7,
}

export const eventWithEntryNotYetOpen: ConfirmedEvent = {
  ...emptyEvent,
  id: 'test4',
  eventType: 'type4',
  classes: [{ class: 'AVO', date: addDays(today, 14) }],
  startDate: addDays(today, 14),
  endDate: addDays(today, 15),
  entryStartDate: addDays(today, 1), // entry not open yet
  entryEndDate: addDays(today, 8),
  judges: [{ id: 223, name: 'Tuomari 2' }],
  places: 10,
  entries: undefined,
}

export const eventWithEntryClosing: ConfirmedEvent = {
  ...emptyEvent,
  id: 'test5',
  eventType: 'type5',
  classes: [{ class: 'ALO', date: addDays(today, 14) }],
  startDate: addDays(today, 24),
  endDate: addDays(today, 25),
  entryStartDate: addDays(today, -1),
  entryEndDate: addDays(today, 6),
  judges: [{ id: 223, name: 'Tuomari 2' }],
  places: 10,
  entries: 10,
}

export const eventWithEntryClosed: ConfirmedEvent = {
  ...emptyEvent,
  id: 'testEntryClosed',
  eventType: 'NOME-B',
  classes: [
    { class: 'ALO', date: addDays(today, 7), places: 3, entries: 2 },
    { class: 'AVO', date: addDays(today, 7), places: 1, entries: 2 },
  ],
  places: 4,
  entries: 4,
  startDate: addDays(today, 7),
  endDate: addDays(today, 7),
  entryStartDate: addDays(today, -14),
  entryEndDate: addDays(today, -28),
  judges: [
    { id: 123, name: 'Tuomari 1' },
    { id: 223, name: 'Tuomari 2' },
  ],
}

export const eventWithParticipantsInvited: ConfirmedEvent = {
  ...emptyEvent,
  id: 'testInvited',
  eventType: 'NOME-B',
  state: 'invited',
  classes: [
    { class: 'ALO', date: addDays(today, 7), places: 3, entries: 2 },
    { class: 'AVO', date: addDays(today, 7), places: 1, entries: 2 },
  ],
  places: 4,
  entries: 4,
  startDate: addDays(today, 7),
  endDate: addDays(today, 7),
  entryStartDate: addDays(today, -14),
  entryEndDate: addDays(today, -28),
  judges: [
    { id: 123, name: 'Tuomari 1' },
    { id: 223, name: 'Tuomari 2' },
  ],
}
