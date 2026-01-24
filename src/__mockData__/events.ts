import type { ConfirmedEvent } from '../types'

import { addDays, parseISO } from 'date-fns'

import { zonedEndOfDay, zonedStartOfDay } from '../i18n/dates'

import { emptyEvent } from './emptyEvent'

const isoDay = new Date().toISOString().substring(0, 10)
const parseDate = (iso: string) => zonedStartOfDay(parseISO(`${iso}T12:00:00Z`))
const today = parseDate(isoDay)

export const eventWithStaticDates: ConfirmedEvent = {
  ...emptyEvent,
  id: 'test1',
  eventType: 'NOU',
  classes: [],
  dates: [
    { date: parseDate('2021-02-10'), time: 'ap' },
    { date: parseDate('2021-02-10'), time: 'ip' },
    { date: parseDate('2021-02-11'), time: 'ap' },
    { date: parseDate('2021-02-11'), time: 'ip' },
  ],
  startDate: parseDate('2021-02-10'),
  endDate: parseDate('2021-02-11'),
  entryStartDate: parseDate('2021-02-01'),
  entryEndDate: zonedEndOfDay(parseDate('2021-02-07')),
  judges: [{ id: 123, name: 'Tuomari 1' }],
  location: 'test location',
}

export const eventWithStaticDatesAndClass: ConfirmedEvent = {
  ...emptyEvent,
  id: 'test1-b',
  eventType: 'NOME-B',
  classes: [
    { class: 'ALO', date: parseDate('2021-02-10') },
    { class: 'ALO', date: parseDate('2021-02-11') },
  ],
  startDate: parseDate('2021-02-10'),
  endDate: parseDate('2021-02-11'),
  entryStartDate: parseDate('2021-02-01'),
  entryEndDate: parseDate('2021-02-07'),
  judges: [{ id: 123, name: 'Tuomari 1' }],
  location: 'test location',
}

export const eventWithStaticDatesAnd3Classes: ConfirmedEvent = {
  ...emptyEvent,
  id: 'test1-c',
  eventType: 'NOME-B',
  classes: [
    { class: 'ALO', date: parseDate('2021-02-10') },
    { class: 'AVO', date: parseDate('2021-02-10') },
    { class: 'VOI', date: parseDate('2021-02-11') },
  ],
  startDate: parseDate('2021-02-10'),
  endDate: parseDate('2021-02-11'),
  entryStartDate: parseDate('2021-02-01'),
  entryEndDate: parseDate('2021-02-07'),
  judges: [{ id: 123, name: 'Tuomari 1' }],
  location: 'test location',
}

export const eventWithEntryOpen: ConfirmedEvent = {
  ...emptyEvent,
  id: 'test3',
  eventType: 'NOWT',
  classes: [{ class: 'VOI', date: addDays(today, 14), entries: 7 }],
  startDate: addDays(today, 14),
  endDate: addDays(today, 15),
  entryStartDate: today, // entry starts today
  entryEndDate: addDays(today, 8), // over week from today
  judges: [{ id: 223, name: 'Tuomari 2' }],
  places: 10,
  entries: 7,
}

export const eventWithEntryOpenButNoEntries: ConfirmedEvent = {
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
}

export const eventWithEntryNotYetOpen: ConfirmedEvent = {
  ...emptyEvent,
  id: 'test4',
  eventType: 'type4',
  classes: [{ class: 'AVO', date: addDays(today, 14), judge: { id: 223, name: 'Tuomari 2' } }],
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
    { class: 'ALO', date: addDays(today, 7), places: 3, entries: 2, members: 1 },
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

export const eventWithALOClassInvited: ConfirmedEvent = {
  ...emptyEvent,
  id: 'testALOInvited',
  eventType: 'NOME-B',
  state: 'picked',
  classes: [
    { class: 'ALO', date: addDays(today, 7), places: 3, entries: 2, state: 'invited' },
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
