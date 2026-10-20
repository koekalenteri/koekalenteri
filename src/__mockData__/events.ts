import type { ConfirmedEvent, DayKey } from '../types'
import { addDays, dayOf, TIME_ZONE } from '../lib/day'
import { emptyEvent } from './emptyEvent'

// "Today" is the Finnish day, as the app reads it, and the days around it are counted as Finnish days:
// keyed by the UTC day the fixtures flipped at 00:00Z, and stepped by 24 hours they drifted an hour
// across a change of time, onto the wrong Finnish day.
const todayKey = dayOf(new Date(), TIME_ZONE)
/** The Finnish day `days` days from today. */
const day = (days: number) => addDays(todayKey, days)
const parseDate = (iso: DayKey) => iso
const today = day(0)

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
  entryEndDate: parseDate('2021-02-07'),
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
  classes: [{ class: 'VOI', date: day(14), entries: 7 }],
  endDate: day(15),
  entries: 7,
  entryEndDate: day(8), // over week from today
  entryStartDate: today, // entry starts today
  eventType: 'NOWT',
  id: 'test3',
  judges: [{ id: 223, name: 'Tuomari 2' }],
  places: 10,
  startDate: day(14),
}

export const eventWithEntryOpenButNoEntries: ConfirmedEvent = {
  ...emptyEvent,
  classes: [{ class: 'VOI', date: day(14) }],
  endDate: day(15),
  entryEndDate: day(8), // over week from today
  entryStartDate: today, // entry starts today
  eventType: 'NOWT',
  id: 'test3',
  judges: [{ id: 223, name: 'Tuomari 2' }],
  places: 10,
  startDate: day(14),
}

export const eventWithEntryNotYetOpen: ConfirmedEvent = {
  ...emptyEvent,
  classes: [{ class: 'AVO', date: day(14), judge: { id: 223, name: 'Tuomari 2' } }],
  endDate: day(15),
  entries: undefined,
  entryEndDate: day(8),
  entryStartDate: day(1), // entry not open yet
  eventType: 'type4',
  id: 'test4',
  judges: [{ id: 223, name: 'Tuomari 2' }],
  places: 10,
  startDate: day(14),
}

export const eventWithEntryClosing: ConfirmedEvent = {
  ...emptyEvent,
  classes: [{ class: 'ALO', date: day(14) }],
  endDate: day(25),
  entries: 10,
  entryEndDate: day(6),
  entryStartDate: day(-1),
  eventType: 'type5',
  id: 'test5',
  judges: [{ id: 223, name: 'Tuomari 2' }],
  places: 10,
  startDate: day(24),
}

export const eventWithEntryClosed: ConfirmedEvent = {
  ...emptyEvent,
  classes: [
    { class: 'ALO', date: day(7), entries: 2, places: 3 },
    { class: 'AVO', date: day(7), entries: 2, places: 1 },
  ],
  endDate: day(7),
  entries: 4,
  entryEndDate: day(-28),
  entryStartDate: day(-14),
  eventType: 'NOME-B',
  id: 'testEntryClosed',
  judges: [
    { id: 123, name: 'Tuomari 1' },
    { id: 223, name: 'Tuomari 2' },
  ],
  places: 4,
  startDate: day(7),
}

export const eventWithParticipantsInvited: ConfirmedEvent = {
  ...emptyEvent,
  classes: [
    { class: 'ALO', date: day(7), entries: 2, members: 1, places: 3 },
    { class: 'AVO', date: day(7), entries: 2, places: 1 },
  ],
  endDate: day(7),
  entries: 4,
  entryEndDate: day(-28),
  entryStartDate: day(-14),
  eventType: 'NOME-B',
  id: 'testInvited',
  judges: [
    { id: 123, name: 'Tuomari 1' },
    { id: 223, name: 'Tuomari 2' },
  ],
  places: 4,
  startDate: day(7),
  state: 'invited',
}

export const eventWithALOClassInvited: ConfirmedEvent = {
  ...emptyEvent,
  classes: [
    { class: 'ALO', date: day(7), entries: 2, places: 3, state: 'invited' },
    { class: 'AVO', date: day(7), entries: 2, places: 1 },
  ],
  endDate: day(7),
  entries: 4,
  entryEndDate: day(-28),
  entryStartDate: day(-14),
  eventType: 'NOME-B',
  id: 'testALOInvited',
  judges: [
    { id: 123, name: 'Tuomari 1' },
    { id: 223, name: 'Tuomari 2' },
  ],
  places: 4,
  startDate: day(7),
  state: 'picked',
}
