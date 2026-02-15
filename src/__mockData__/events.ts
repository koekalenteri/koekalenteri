import type { ConfirmedEvent } from '../types'
import { addDays, parseISO } from 'date-fns'
import { zonedDateString, zonedEndOfDay, zonedStartOfDay } from '../i18n/dates'
import { emptyEvent } from './emptyEvent'

// IMPORTANT: derive "today" using the app/event timezone (Europe/Helsinki).
// Using `Date.toISOString().slice(0, 10)` would key by *UTC day* and flips at 00:00Z,
// which makes entryOpen/entryUpcoming and snapshots change depending on the hour.
const isoDay = zonedDateString(new Date())
const parseDate = (iso: string) => zonedStartOfDay(parseISO(`${iso}T12:00:00Z`))
const today = parseDate(isoDay)

export const eventWithStaticDates: ConfirmedEvent = {
  ...emptyEvent,
  classes: [],
  dates: [
    { date: parseDate('2021-02-10'), time: 'ap' },
    { date: parseDate('2021-02-10'), time: 'ip' },
    { date: parseDate('2021-02-11'), time: 'ap' },
    { date: parseDate('2021-02-11'), time: 'ip' },
  ],
  endDate: parseDate('2021-02-11'),
  entryEndDate: zonedEndOfDay(parseDate('2021-02-07')),
  entryStartDate: parseDate('2021-02-01'),
  eventType: 'NOU',
  id: 'test1',
  judges: [{ id: 123, name: 'Tuomari 1' }],
  location: 'test location',
  startDate: parseDate('2021-02-10'),
}

export const eventWithStaticDatesAndClass: ConfirmedEvent = {
  ...emptyEvent,
  classes: [
    { class: 'ALO', date: parseDate('2021-02-10') },
    { class: 'ALO', date: parseDate('2021-02-11') },
  ],
  endDate: parseDate('2021-02-11'),
  entryEndDate: parseDate('2021-02-07'),
  entryStartDate: parseDate('2021-02-01'),
  eventType: 'NOME-B',
  id: 'test1-b',
  judges: [{ id: 123, name: 'Tuomari 1' }],
  location: 'test location',
  startDate: parseDate('2021-02-10'),
}

export const eventWithStaticDatesAnd3Classes: ConfirmedEvent = {
  ...emptyEvent,
  classes: [
    { class: 'ALO', date: parseDate('2021-02-10') },
    { class: 'AVO', date: parseDate('2021-02-10') },
    { class: 'VOI', date: parseDate('2021-02-11') },
  ],
  endDate: parseDate('2021-02-11'),
  entryEndDate: parseDate('2021-02-07'),
  entryStartDate: parseDate('2021-02-01'),
  eventType: 'NOME-B',
  id: 'test1-c',
  judges: [{ id: 123, name: 'Tuomari 1' }],
  location: 'test location',
  startDate: parseDate('2021-02-10'),
}

export const eventWithEntryOpen: ConfirmedEvent = {
  ...emptyEvent,
  classes: [{ class: 'VOI', date: addDays(today, 14), entries: 7 }],
  endDate: addDays(today, 15),
  entries: 7,
  entryEndDate: addDays(today, 8), // over week from today
  entryStartDate: today, // entry starts today
  eventType: 'NOWT',
  id: 'test3',
  judges: [{ id: 223, name: 'Tuomari 2' }],
  places: 10,
  startDate: addDays(today, 14),
}

export const eventWithEntryOpenButNoEntries: ConfirmedEvent = {
  ...emptyEvent,
  classes: [{ class: 'VOI', date: addDays(today, 14) }],
  endDate: addDays(today, 15),
  entryEndDate: addDays(today, 8), // over week from today
  entryStartDate: today, // entry starts today
  eventType: 'NOWT',
  id: 'test3',
  judges: [{ id: 223, name: 'Tuomari 2' }],
  places: 10,
  startDate: addDays(today, 14),
}

export const eventWithEntryNotYetOpen: ConfirmedEvent = {
  ...emptyEvent,
  classes: [{ class: 'AVO', date: addDays(today, 14), judge: { id: 223, name: 'Tuomari 2' } }],
  endDate: addDays(today, 15),
  entries: undefined,
  entryEndDate: addDays(today, 8),
  entryStartDate: addDays(today, 1), // entry not open yet
  eventType: 'type4',
  id: 'test4',
  judges: [{ id: 223, name: 'Tuomari 2' }],
  places: 10,
  startDate: addDays(today, 14),
}

export const eventWithEntryClosing: ConfirmedEvent = {
  ...emptyEvent,
  classes: [{ class: 'ALO', date: addDays(today, 14) }],
  endDate: addDays(today, 25),
  entries: 10,
  entryEndDate: addDays(today, 6),
  entryStartDate: addDays(today, -1),
  eventType: 'type5',
  id: 'test5',
  judges: [{ id: 223, name: 'Tuomari 2' }],
  places: 10,
  startDate: addDays(today, 24),
}

export const eventWithEntryClosed: ConfirmedEvent = {
  ...emptyEvent,
  classes: [
    { class: 'ALO', date: addDays(today, 7), entries: 2, places: 3 },
    { class: 'AVO', date: addDays(today, 7), entries: 2, places: 1 },
  ],
  endDate: addDays(today, 7),
  entries: 4,
  entryEndDate: addDays(today, -28),
  entryStartDate: addDays(today, -14),
  eventType: 'NOME-B',
  id: 'testEntryClosed',
  judges: [
    { id: 123, name: 'Tuomari 1' },
    { id: 223, name: 'Tuomari 2' },
  ],
  places: 4,
  startDate: addDays(today, 7),
}

export const eventWithParticipantsInvited: ConfirmedEvent = {
  ...emptyEvent,
  classes: [
    { class: 'ALO', date: addDays(today, 7), entries: 2, members: 1, places: 3 },
    { class: 'AVO', date: addDays(today, 7), entries: 2, places: 1 },
  ],
  endDate: addDays(today, 7),
  entries: 4,
  entryEndDate: addDays(today, -28),
  entryStartDate: addDays(today, -14),
  eventType: 'NOME-B',
  id: 'testInvited',
  judges: [
    { id: 123, name: 'Tuomari 1' },
    { id: 223, name: 'Tuomari 2' },
  ],
  places: 4,
  startDate: addDays(today, 7),
  state: 'invited',
}

export const eventWithALOClassInvited: ConfirmedEvent = {
  ...emptyEvent,
  classes: [
    { class: 'ALO', date: addDays(today, 7), entries: 2, places: 3, state: 'invited' },
    { class: 'AVO', date: addDays(today, 7), entries: 2, places: 1 },
  ],
  endDate: addDays(today, 7),
  entries: 4,
  entryEndDate: addDays(today, -28),
  entryStartDate: addDays(today, -14),
  eventType: 'NOME-B',
  id: 'testALOInvited',
  judges: [
    { id: 123, name: 'Tuomari 1' },
    { id: 223, name: 'Tuomari 2' },
  ],
  places: 4,
  startDate: addDays(today, 7),
  state: 'picked',
}
