import type { DayKey, RegistrationTime } from '../types'
import { legacyStoredDay, legacyStoredEventDay, TIME_ZONE } from './day'
import { isNoDay } from './dog'
import { groupKeyOf, isEventDateString } from './event'
import { isParticipantGroup } from './registration'

/**
 * The calendar days of a stored row as keys (KOE-1547). Every day an event, a registration or a dog
 * row holds is stored as a `DayKey`; rows written before held instants (a Finnish midnight, the end of
 * a Finnish day, a browser's local midnight or noon of a dog's date) or Kennelliitto's stamps. The
 * functions below put each day field of a row into a key in place, reading the old value with the
 * decoders they are given.
 *
 * Everything that puts a day into a key decodes by the migrations' rule, so a row written before its
 * migration has run holds the day the migration would write: the migrations, a copy, and a request
 * reading its stored row and what it receives. An event's or an entry's day was stored as the start or
 * the end of the day, some of them an hour off, and is the day it was stored for (`storedEventDayOf`);
 * a dog's birth date and a result's date carry a real time of day and are the day the instant falls on.
 * A browser on the bundle before KOE-1547 sends back the Dates it read: an unmigrated row's instant, a
 * key read as UTC midnight (02:00 or 03:00 in Finland) or a picker's Finnish midnight, and this rule
 * reads each as the day the migration writes. The readers that only show a day read the day an
 * instant falls on (`storedDayKey`), so an hour-off row shows its old day until its migration runs.
 *
 * A value with no day to read is left as it is and reported, so the migration can count it and a
 * request's own check can refuse it. Kennelliitto's empty date is no day rather than an unreadable
 * one: a birth date without a day is removed, and a result's date becomes '', which every reader
 * takes as none.
 */

/** How a stored or received value is read as a day; undefined for a value with no day. */
type DayDecode = (value: unknown) => DayKey | undefined

/**
 * The reading of a stored or received event or entry day that is to be written as a key: every form
 * rows were ever stored in, for good (`legacyStoredEventDay`, which says why it never narrows). The
 * migrations, a copy and every request decode with it, so they write the same day.
 */
export const legacyEventDay: DayDecode = (value) => legacyStoredEventDay(value, TIME_ZONE)

/**
 * The reading of a dog's stored date that is to be written as a key, for good (`legacyStoredDay`): the
 * day the instant falls on, the rule the readers use too (`calendarDayOf`).
 */
export const legacyDogDay: DayDecode = (value) => legacyStoredDay(value, TIME_ZONE)

/**
 * A day as a request may send it: a key, or, from a browser on the bundle before KOE-1547, the instant
 * of a Date it read, decoded as the migration decodes it (`legacyEventDay`). A stamp without a zone is
 * no day here, as a request's date never was.
 */
export const requestDay: DayDecode = (value) => (isEventDateString(value) ? legacyEventDay(value) : undefined)

/** How a registration's days are read: an entry's days and groups' days, and the dog's dates. */
interface RegistrationDecoders {
  eventDay: DayDecode
  dogDay: DayDecode
}

/**
 * The migrations' decoder of a kind of stored day: an event's or an entry's day (`legacyEventDay`), or
 * a dog's date (`legacyDogDay`). A migration names the kind in its body, so its hash names the rule.
 */
export const legacyDecoder = (kind: 'event' | 'dog'): DayDecode => (kind === 'event' ? legacyEventDay : legacyDogDay)

/** The reading of a registration's stored or received days that are to be written as keys. */
export const legacyRegistrationDays: RegistrationDecoders = { dogDay: legacyDogDay, eventDay: legacyEventDay }

/** What putting a row's days into keys came to. */
export interface DayRekeying {
  /** Whether any field was rewritten. */
  changed: boolean
  /** Whether a day field held a value with no day to read; it is left as it is. */
  unreadable: boolean
}

/** A field as a stored row, a request or a patch may hold it: a patch deletes a field with null. */
type OrNull<T> = T | null

/** An element of a list a patch holds, or an argument, which may also be absent. */
type Nullable<T> = OrNull<T> | undefined

/** A row part holding one day, as a stored row, a request or a patch has it. */
type DatedPart = Nullable<{ date?: OrNull<DayKey> }>

/** A published-days list as stored, or as a patch holds it. */
type DayList = Array<Nullable<string>>

type DayScope = OrNull<boolean | DayList | Partial<Record<string, OrNull<boolean | DayList>>>>

/** The day fields of an event, as a stored row, a request body or a patch holds them. */
interface EventDays {
  startDate?: OrNull<DayKey>
  endDate?: OrNull<DayKey>
  entryStartDate?: OrNull<DayKey>
  entryEndDate?: OrNull<DayKey>
  entryOrigEndDate?: OrNull<DayKey>
  qualificationStartDate?: OrNull<DayKey>
  classes?: OrNull<DatedPart[]>
  dates?: OrNull<DatedPart[]>
  stations?: OrNull<DatedPart[]>
  kcEvent?: OrNull<{ startDate?: OrNull<DayKey>; endDate?: OrNull<DayKey> }>
  startNumbersPublished?: DayScope
  resultsPublished?: DayScope
}

type DatedGroup = OrNull<{ date?: OrNull<DayKey>; key?: OrNull<string>; time?: OrNull<RegistrationTime> }>

type DatedResult = Nullable<{ date?: OrNull<DayKey | ''> }>

/** The day fields of a dog, as the dog table and a registration's copy of it hold them. */
interface DogDays {
  dob?: OrNull<DayKey>
  results?: OrNull<DatedResult[]>
}

/** The day fields of a registration, as a stored row or a request body holds them. */
interface RegistrationDays {
  dates?: OrNull<DatedPart[]>
  group?: DatedGroup
  startGroup?: DatedGroup
  dog?: OrNull<DogDays>
  qualifyingResults?: OrNull<DatedResult[]>
  results?: OrNull<DatedResult[]>
}

/** The days every event has: one it cannot read stays as it is. */
const EVENT_DAY_FIELDS = ['startDate', 'endDate'] as const

/**
 * The days an event may be without. The entry days came from Kennelliitto's trial listing too, as the
 * Kennelliitto trial's own days did, and its empty date (year 1, the end of a one-day trial) is no day:
 * it removes the field.
 */
const OPTIONAL_EVENT_DAY_FIELDS = [
  'entryStartDate',
  'entryEndDate',
  'entryOrigEndDate',
  'qualificationStartDate',
] as const

const KC_EVENT_DAY_FIELDS = ['startDate', 'endDate'] as const

const newRekeying = (): DayRekeying => ({ changed: false, unreadable: false })

/** The key of a stored day, or the value as it is when it has no day. */
const rekeyDay = (value: DayKey, decode: DayDecode, state: DayRekeying): DayKey => {
  const day = decode(value)
  if (day === undefined) {
    state.unreadable = true
    return value
  }
  if (day !== value) state.changed = true
  return day
}

const rekeyParts = (parts: Nullable<DatedPart[]>, decode: DayDecode, state: DayRekeying) => {
  for (const part of parts ?? []) {
    if (part?.date) part.date = rekeyDay(part.date, decode, state)
  }
}

/** A published-days list: the instants an old list held become keys; a half day (`day/ap`) stays. */
const rekeyScopeList = (list: DayList, decode: DayDecode, state: DayRekeying) =>
  list.map((entry) => {
    if (!entry?.includes('T')) return entry
    const day = decode(entry)
    if (day === undefined) {
      state.unreadable = true
      return entry
    }
    state.changed = true
    return day
  })

const rekeyScope = (scope: DayScope, decode: DayDecode, state: DayRekeying): DayScope => {
  if (Array.isArray(scope)) return rekeyScopeList(scope, decode, state)
  if (!scope || typeof scope !== 'object') return scope
  const perClass: Partial<Record<string, OrNull<boolean | DayList>>> = {}
  for (const [eventClass, classScope] of Object.entries(scope)) {
    perClass[eventClass] = Array.isArray(classScope) ? rekeyScopeList(classScope, decode, state) : classScope
  }
  return perClass
}

/** Puts every day of an event (a stored row, a request or a patch) into a key, in place. */
export const rekeyEventDays = (event: EventDays, decode: DayDecode): DayRekeying => {
  const state = newRekeying()
  for (const field of EVENT_DAY_FIELDS) {
    const value = event[field]
    if (value) event[field] = rekeyDay(value, decode, state)
  }
  for (const field of OPTIONAL_EVENT_DAY_FIELDS) rekeyOptionalDay(event, field, decode, state)
  rekeyParts(event.classes, decode, state)
  rekeyParts(event.dates, decode, state)
  rekeyParts(event.stations, decode, state)
  const kcEvent = event.kcEvent
  if (kcEvent) {
    for (const field of KC_EVENT_DAY_FIELDS) rekeyOptionalDay(kcEvent, field, decode, state)
  }
  if (event.startNumbersPublished) event.startNumbersPublished = rekeyScope(event.startNumbersPublished, decode, state)
  if (event.resultsPublished) event.resultsPublished = rekeyScope(event.resultsPublished, decode, state)
  return state
}

/**
 * A group's day as a key, and a start's key named by that day and the time (KOE-1541): a row an older
 * copy wrote carries the UTC day in its key. Reserve and cancelled keep theirs.
 */
const rekeyGroup = (group: DatedGroup | undefined, decode: DayDecode, state: DayRekeying) => {
  if (!group?.date) return
  const day = decode(group.date)
  if (day === undefined) {
    state.unreadable = true
    return
  }
  if (day !== group.date) {
    group.date = day
    state.changed = true
  }
  if (!group.key || !isParticipantGroup(group.key) || !group.time) return
  const key = groupKeyOf(day, group.time)
  if (key === group.key) return
  group.key = key
  state.changed = true
}

/**
 * A day's key; `null` for Kennelliitto's empty date, which is no day at all; `undefined` for a value
 * with no day to read, which is left as it is.
 */
const rekeyDayOrNone = (value: string, decode: DayDecode, state: DayRekeying): DayKey | null | undefined => {
  const day = decode(value)
  if (day !== undefined) {
    if (day !== value) state.changed = true
    return day
  }
  if (isNoDay(value)) {
    state.changed = true
    return null
  }
  state.unreadable = true
  return undefined
}

/** A day a row may be without, as a key; Kennelliitto's empty date removes it. */
const rekeyOptionalDay = <K extends string>(
  holder: { [P in K]?: OrNull<DayKey> },
  field: K,
  decode: DayDecode,
  state: DayRekeying
) => {
  const value = holder[field]
  if (!value) return
  const day = rekeyDayOrNone(value, decode, state)
  if (day === null) delete holder[field]
  else if (day) holder[field] = day
}

/** A result's day as a key, or '' for Kennelliitto's empty date. */
const rekeyResults = (results: Nullable<DatedResult[]>, decode: DayDecode, state: DayRekeying) => {
  for (const result of results ?? []) {
    if (!result?.date) continue
    const day = rekeyDayOrNone(result.date, decode, state)
    if (day !== undefined) result.date = day ?? ''
  }
}

/** The birth date as a key, or none for Kennelliitto's empty date; and the results' days. */
const rekeyDogInto = (dog: DogDays, decode: DayDecode, state: DayRekeying) => {
  rekeyOptionalDay(dog, 'dob', decode, state)
  rekeyResults(dog.results, decode, state)
}

/** Puts the birth date and the results' days of a dog into keys, in place. */
export const rekeyDogDays = (dog: DogDays, decode: DayDecode): DayRekeying => {
  const state = newRekeying()
  rekeyDogInto(dog, decode, state)
  return state
}

/** Puts every day of a registration into a key, in place: its days, its groups, and the dog's dates. */
export const rekeyRegistrationDays = (
  registration: RegistrationDays,
  { dogDay, eventDay }: RegistrationDecoders
): DayRekeying => {
  const state = newRekeying()
  rekeyParts(registration.dates, eventDay, state)
  rekeyGroup(registration.group, eventDay, state)
  rekeyGroup(registration.startGroup, eventDay, state)
  if (registration.dog) rekeyDogInto(registration.dog, dogDay, state)
  rekeyResults(registration.qualifyingResults, dogDay, state)
  rekeyResults(registration.results, dogDay, state)
  return state
}

/**
 * A copy of the registration with its days as keys, decoded as a request decodes them: what a save is
 * compared by, so the same days in another form (a row stored before KOE-1547, an older browser's
 * instants) are no change, while a value with no day still differs from a day and from another one.
 */
export const withRegistrationDayKeys = <R extends RegistrationDays>(registration: R): R => {
  const copy = structuredClone(registration)
  rekeyRegistrationDays(copy, legacyRegistrationDays)
  return copy
}
