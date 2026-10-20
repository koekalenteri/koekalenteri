import type { TFunction } from 'i18next'
import type {
  ClassOrNone,
  ConfirmedEvent,
  ConfirmedEventStates,
  DayKey,
  DeepPartial,
  DogEvent,
  EventClass,
  EventClassState,
  EventState,
  JsonDogEvent,
  JsonPublicDogEvent,
  Language,
  Patch,
  PublicDogEvent,
  RegistrationClass,
  RegistrationDate,
  RegistrationTime,
  ResultsDayScope,
  ResultsPublishedState,
  SanitizedJsonPublicDogEvent,
  SanitizedPublicConfirmedDogEvent,
  SanitizedPublicDogEvent,
  StartNumbersDayScope,
} from '../types'
import { LANGUAGES } from '../types'
import {
  addDays,
  calendarDayOf,
  dayOf,
  dayOfWeek,
  dayParts,
  dayStart,
  daysBetween,
  eachDay,
  hasCalendarDay,
  isDayKey,
  isInstantString,
  monthKeyOf,
  TIME_ZONE,
} from './day'
import { isLiveNow, isStoredStationTurn, toPublicStationTurn } from './stationTurns'
import { isConfirmedEvent } from './typeGuards'
import { isObject, unique } from './utils'

export const isValidForEntry = (state?: EventState) => !['draft', 'tentative', 'cancelled'].includes(state ?? '')

/** A day as stored (a yyyy-MM-dd key or an ISO instant), or as the typed boundary hands an instant over (a Date). */
type StoredDay = Date | string

/** A stored day, or not known. */
type DayInput = StoredDay | undefined

/**
 * What the entry and progress questions read of an event: its days in any form a reader may hold them
 * (a stored key, an instant on a row stored before KOE-1547, the browser's Date), and its state.
 */
export type EventVitals = {
  startDate?: StoredDay
  endDate?: StoredDay
  entryStartDate?: StoredDay
  entryEndDate?: StoredDay
  state?: EventState
}

/**
 * The Finnish day of a stored date. A day key passes through unchanged: parsed, it would be read as
 * midnight where the browser is, which east of Finland falls on the day before (KOE-1510). An instant,
 * as a Date or the ISO string the stored form is, is read in the trial's zone, and a stamp without a
 * zone as the day it names, as every reader of a stored day reads them (`calendarDayOf`). The one
 * bridge for the `Date | string` fields until they are typed as days (KOE-1544).
 */
export const eventDayKey = (date: Date | string): DayKey => {
  if (isDayKey(date)) return date
  return (typeof date === 'string' && calendarDayOf(date, TIME_ZONE)) || dayOf(toInstant(date), TIME_ZONE)
}

/** A stored instant as a Date: the ISO string the stored form is, or the Date the client's typed boundary made of it. */
const toInstant = (date: Date | string): Date => (typeof date === 'string' ? new Date(date) : date)

/**
 * The Finnish day of a stored date that may be missing or unreadable: undefined for no date and for
 * one that reads as neither a day nor an instant. The listings and the vitals read rows as they are,
 * and a bad or absent date must not turn a read into a 500.
 */
export const storedDayKey = (date: DayInput): DayKey | undefined => {
  if (!date) return undefined
  // The day the instant falls on, and a stamp without a zone the day it names, as every display
  // reader of a stored day reads it (`eventDayKey`, the group keys, the wire): a string goes through
  // the one reader, `calendarDayOf`, never the host's zone. A day a row not yet migrated holds an hour
  // off shows as the day before or after until its migration, which runs right after the deploy,
  // writes the day it was stored for (`storedEventDayOf`, as every decode to a key reads it).
  if (typeof date === 'string') return calendarDayOf(date, TIME_ZONE)
  return hasCalendarDay(date, TIME_ZONE) ? dayOf(date, TIME_ZONE) : undefined
}

/**
 * Whether a request's date is an ISO instant with an explicit zone, or a day key, with a calendar day:
 * what PutEvent, CopyEvent and the Kennel Club search accept, and answer 400 to anything else.
 */
export const isEventDateString = (value: unknown): value is string =>
  (isInstantString(value) || isDayKey(value)) && hasCalendarDay(new Date(value), TIME_ZONE)

/** The Finnish year of a stored date; undefined without a calendar day. */
export const storedYear = (date: DayInput): number | undefined => {
  const day = storedDayKey(date)
  return day ? dayParts(day).year : undefined
}

/** The Finnish month of a stored date as `yyyy-MM`, the key the statistics bucket by; undefined without a day. */
export const storedMonthKey = (date: DayInput): string | undefined => {
  const day = storedDayKey(date)
  return day ? monthKeyOf(day) : undefined
}

/**
 * A span of Finnish days as keys, `2026-06-28 - 2026-06-29`, or one key for a one-day span, as the
 * Kennel Club lookup shows a trial's days; '' without a start day, and an end without a day is the start.
 */
export const finnishDaySpan = (start?: DayKey, end?: DayKey): string => {
  const first = storedDayKey(start)
  if (!first) return ''
  const last = storedDayKey(end) ?? first
  return first === last ? first : `${first} - ${last}`
}

/** Whether a stored date passes `test` as its Finnish day; a missing or unreadable date passes nothing. */
const dayPasses = (date: DayInput, test: (day: DayKey) => boolean): boolean => {
  const day = storedDayKey(date)
  return day !== undefined && test(day)
}

/** The Finnish day `now` falls on: what every "has it started yet" question compares against. */
const today = (now: Date) => dayOf(now, TIME_ZONE)

type EventDateSortKey = { id: string; startDate?: Date | string; endDate?: Date | string }

/** A day as it sorts: its key, or '' (first) for none. */
const sortDay = (date: DayInput) => storedDayKey(date) ?? ''

/**
 * The calendar's order: start day, then end day, with the id as a stable tiebreaker. Days compare as
 * keys, so a stored key and the instant of the same Finnish day sort as one (KOE-1547).
 */
export const compareEventsByDate = (a: EventDateSortKey, b: EventDateSortKey): number => {
  const aStart = sortDay(a.startDate)
  const bStart = sortDay(b.startDate)
  if (aStart !== bStart) return aStart.localeCompare(bStart)

  const aEnd = sortDay(a.endDate)
  const bEnd = sortDay(b.endDate)
  if (aEnd !== bEnd) return aEnd.localeCompare(bEnd)

  return a.id.localeCompare(b.id)
}

/** The languages an event's texts can be translated into (KOE-1263): every app language but Finnish. */
export const EVENT_TRANSLATION_LANGUAGES = LANGUAGES.filter((language) => language !== 'fi')

/**
 * The event name as it should read in the given language (KOE-1263). Finnish is the canonical name
 * every event has; the `names` map carries the translations and falls back to it, like the cost
 * descriptions do.
 */
export const localizedEventName = (
  event: Pick<PublicDogEvent | JsonPublicDogEvent, 'name' | 'names'>,
  language: Language
): string => event.names?.[language] || event.name

/** The additional info in the given language (KOE-1263), with the same Finnish fallback as the name. */
export const localizedEventDescription = (
  event: Pick<PublicDogEvent | JsonPublicDogEvent, 'description' | 'descriptions'>,
  language: Language
): string => event.descriptions?.[language] || event.description

/**
 * The line a tokenized link's screen heads its sheet with (KOE-1258, KOE-1267): when the trial runs,
 * what and where it is, and its name. The link has no navigation to say which trial it opened, so
 * this line is the whole answer — and it reads the same on every such screen.
 */
export const linkedEventSubtitle = (
  event: Pick<PublicDogEvent, 'endDate' | 'eventType' | 'location' | 'name' | 'names' | 'startDate'>,
  language: Language,
  t: TFunction
): string =>
  [
    t('dateFormat.datespan', { end: event.endDate, start: event.startDate }),
    event.eventType,
    event.location,
    localizedEventName(event, language),
  ]
    .filter(Boolean)
    .join(' ')

export const isEntryUpcoming = ({ entryStartDate, state }: EventVitals, now = new Date()) =>
  dayPasses(entryStartDate, (day) => day > today(now)) && (isValidForEntry(state) || state === 'tentative')

// The vitals compare Finnish days: a day has started once today is it or later, and is over once
// today is after it, whatever the hour and wherever the browser is.

export const hasEntryStarted = ({ entryStartDate }: EventVitals, now = new Date()) =>
  dayPasses(entryStartDate, (day) => day <= today(now))

export const hasEntryEnded = ({ entryEndDate }: EventVitals, now = new Date()) =>
  dayPasses(entryEndDate, (day) => day < today(now))

export const isEntryOpen = ({ entryStartDate, entryEndDate, state }: EventVitals, now = new Date()) =>
  dayPasses(entryStartDate, (day) => day <= today(now)) &&
  dayPasses(entryEndDate, (day) => day >= today(now)) &&
  isValidForEntry(state)

/** The entry is in its last week: the seventh Finnish day before the closing day has begun. */
export const isEntryClosing = (event: EventVitals, now = new Date()) =>
  isEntryOpen(event, now) &&
  dayPasses(event.entryEndDate, (day) => addDays(day, -7) <= today(now)) &&
  isValidForEntry(event.state)

export const isEntryClosed = ({ startDate, entryEndDate }: EventVitals, now = new Date()) =>
  dayPasses(entryEndDate, (day) => day < today(now)) && dayPasses(startDate, (day) => day > today(now))

export const isEventOngoing = ({ startDate, endDate, state }: EventVitals, now = new Date()) =>
  dayPasses(startDate, (day) => day <= today(now)) &&
  dayPasses(endDate, (day) => day >= today(now)) &&
  isValidForEntry(state) &&
  state !== 'confirmed'

export const isEventOver = ({ endDate }: EventVitals, now = new Date()) => dayPasses(endDate, (day) => day < today(now))

/**
 * Whether an entry is past changing: the trial's day has gone, or this class has been judged. The
 * entries stay readable either way - only editing, cancelling, moving and messaging close (KOE-1388).
 */
export const isEntryEditingClosed = (
  event: EventVitals,
  state?: EventClassState | EventState,
  now = new Date()
): boolean => isEventOver(event, now) || state === 'ended' || state === 'completed'

export const eventDates = (event?: Pick<PublicDogEvent, 'classes' | 'startDate' | 'endDate'> | null) => {
  if (!event) return []
  const classes = Array.isArray(event.classes) ? event.classes : []
  return classes.length ? unique(classes.map((eventClass) => eventClass.date ?? event.startDate)) : getEventDays(event)
}

/** Only `class` is read, so this accepts both the `Date`- and `string`-dated event shapes. */
export const uniqueClasses = (event?: { classes?: Array<Pick<EventClass, 'class'>> | null } | null) => {
  const classes = event?.classes
  return Array.isArray(classes) ? unique(classes.map((eventClass) => eventClass.class)) : []
}

const classAndDayTotals = (
  event: DeepPartial<Pick<PublicDogEvent, 'classes' | 'placesPerDay'>>,
  eventClass: string
) => {
  const classItems = (Array.isArray(event.classes) ? event.classes : []).filter((item) => item.class === eventClass)
  const classTotal = classItems.reduce((total, item) => total + (Number(item.places) || 0), 0)

  const placesPerDay = event.placesPerDay
  const dayTotal = placesPerDay
    ? classItems.reduce((total, item) => {
        const day = item.date ? eventDayKey(item.date) : undefined
        return total + (day ? Number(placesPerDay[day]) || 0 : 0)
      }, 0)
    : 0

  return { classTotal, dayTotal }
}

/** Whether this class has its own places, rather than inheriting the event-wide total. */
export const hasExplicitPlacesForClass = (
  event: DeepPartial<Pick<PublicDogEvent, 'classes' | 'placesPerDay'>> | undefined | null,
  eventClass: string
) => {
  if (!event) return false
  const { classTotal, dayTotal } = classAndDayTotals(event, eventClass)
  return classTotal > 0 || dayTotal > 0
}

export const placesForClass = (
  event: DeepPartial<Pick<PublicDogEvent, 'places' | 'classes' | 'placesPerDay'>> | undefined | null,
  eventClass: string
) => {
  if (!event) return 0

  const { classTotal, dayTotal } = classAndDayTotals(event, eventClass)
  if (classTotal) return classTotal
  if (dayTotal) return dayTotal

  // The event-wide total is only this class's total when the event has a single class —
  // otherwise it's a shared pool, not per-class capacity, so showing it per class would be misleading.
  const distinctClasses = new Set(
    (Array.isArray(event.classes) ? event.classes : []).map((item) => item.class).filter(Boolean)
  )
  return distinctClasses.size <= 1 ? Number(event.places) || 0 : 0
}

export const uniqueClassDates = (event: PublicDogEvent, eventClass: string) => {
  if (eventClass === event.eventType) return eventDates(event)
  const classes = Array.isArray(event.classes) ? event.classes : []
  return unique(classes.filter((item) => item.class === eventClass).map((item) => item.date ?? event.startDate))
}

/**
 * The registration's dates that don't fall on any day its class runs on — or, when the event has
 * no classes for it, on any day of the event. Days are compared in the event time zone; accepts
 * both the Date- and string-dated shapes.
 */
export const registrationDatesOutsideClass = <T extends { date: Date | string }>(
  event: {
    classes?: Array<{ class: string; date?: Date | string }> | null
    endDate: Date | string
    startDate: Date | string
  },
  regClass: string | undefined | null,
  dates: readonly T[] | undefined
): T[] => {
  if (!dates?.length) return []
  const classes = Array.isArray(event.classes) ? event.classes : []
  const classItems = regClass ? classes.filter((item) => item.class === regClass) : classes
  if (classItems.length) {
    const classDays = new Set(classItems.map((item) => eventDayKey(item.date ?? event.startDate)))
    return dates.filter((rd) => !classDays.has(eventDayKey(rd.date)))
  }
  const firstDay = eventDayKey(event.startDate)
  const lastDay = eventDayKey(event.endDate)
  return dates.filter((rd) => {
    const day = eventDayKey(rd.date)
    return day < firstDay || day > lastDay
  })
}

export const registrationDates = (event: PublicDogEvent, times: RegistrationTime[], eventClass?: string | null) =>
  (eventClass ? uniqueClassDates(event, eventClass) : eventDates(event)).flatMap<RegistrationDate>((date) =>
    times.map((time) => ({ date, time }))
  )

export const OFFICIAL_EVENT_TYPES = ['NOU', 'NOME-B', 'NOME-B SM', 'NOME-A', 'NOME-A SM', 'NOWT', 'NOWT SM', 'NKM']

/** The event types that choose between game and dummies (KOE-439): the B-trials. */
const RETRIEVE_TYPE_EVENT_TYPES = new Set(['NOME-B', 'NOME-B SM'])

export const hasRetrieveTypeChoice = (eventType?: string | null) =>
  !!eventType && RETRIEVE_TYPE_EVENT_TYPES.has(eventType)

/** The NOWT is the format that can be a Mock trial (KOE-308); its championship cannot. */
export const hasMockTrialChoice = (eventType?: string | null) => eventType === 'NOWT'

/** The classes a Mock trial runs (KOE-308): AVO and VOI, never ALO. */
const MOCK_TRIAL_CLASSES = new Set<RegistrationClass>(['AVO', 'VOI'])

export const isMockTrialClass = (eventClass: RegistrationClass) => MOCK_TRIAL_CLASSES.has(eventClass)

/** The trial's type as people read it: the event type, marked "(Mock trial)" where the NOWT is one (KOE-308). */
export const eventTypeLabel = (event: { eventType: string; mockTrial?: boolean }) =>
  event.mockTrial ? `${event.eventType} (Mock trial)` : event.eventType

/**
 * The event types whose reserve list belongs to the whole trial rather than to each class (KOE-912):
 * the WT trials. A dog waits for a place in the trial, so the position it is told has to count every
 * class's reserves, and the secretary picks from one list instead of keeping a per-class tally.
 */
const SHARED_RESERVE_EVENT_TYPES = new Set(['NOWT', 'NOWT SM'])

export const hasSharedReserveList = (eventType?: string | null) =>
  !!eventType && SHARED_RESERVE_EVENT_TYPES.has(eventType)

/**
 * Event types are official when the Kennel Club knows them, which the event type sync records in
 * `official`. Rows predating that flag - and the SM types, which have no Kennel Club counterpart of
 * their own - fall back to the list above, so that stays the source of truth for the event types
 * Koekalenteri itself supports.
 */
export const isOfficialEventType = (eventType?: string | null, official?: boolean) =>
  !!eventType && (official === true || OFFICIAL_EVENT_TYPES.includes(eventType))

const EntryStartWeeks = 6
const EntryEndWeeks = 3

/** The day whole weeks before the event's start (KOE-1539). */
const weeksBefore = (eventStartDate: DayKey, weeks: number) => addDays(eventStartDate, -7 * weeks)

export const defaultEntryStartDate = (eventStartDate: DayKey) => weeksBefore(eventStartDate, EntryStartWeeks)
export const defaultEntryEndDate = (eventStartDate: DayKey) => weeksBefore(eventStartDate, EntryEndWeeks)

const SATURDAY = 6
const DAYS_IN_WEEK = 7
const NEW_EVENT_LEAD_DAYS = 90

/**
 * The day a new event is offered: the first Saturday after ninety days from `now`, counted in the
 * trial's zone. Late in the evening west of Finland the browser's own day, and so its weekday, is
 * already another one, which used to offer a Saturday a week off (KOE-1545).
 */
export const newEventStartDay = (now: Date, zone: string): DayKey => {
  const base = addDays(dayOf(now, zone), NEW_EVENT_LEAD_DAYS)
  const untilSaturday = (SATURDAY - dayOfWeek(base) + DAYS_IN_WEEK) % DAYS_IN_WEEK || DAYS_IN_WEEK
  return addDays(base, untilSaturday)
}

/** The dates a new event starts with: its day, and the default entry period before it. */
export const newEventDates = (now: Date) => {
  const startDate = newEventStartDay(now, TIME_ZONE)
  return {
    endDate: startDate,
    entryEndDate: defaultEntryEndDate(startDate),
    entryStartDate: defaultEntryStartDate(startDate),
    startDate,
  }
}

/**
 * The dates the event-wide gates (isStartListAvailable, isStartNumbersAvailable,
 * isResultsAvailableForRegistration, hasAvailableResults) fall back on when the workflow state has not
 * caught up: whether the event is under way or over. Both keys are required there, so an object literal
 * that leaves them out does not compile and cannot silently shut the date path (KOE-1504). The per-class
 * gates still take optional dates.
 */
type EventDates = { [K in 'startDate' | 'endDate']: EventVitals[K] }

export type StartListAvailabilityEvent = Pick<JsonDogEvent, 'state' | 'startListPublished'> &
  EventDates & {
    /** The day too, where the caller has it: the results of each day are published on their own (KOE-1510). */
    classes?: Array<Pick<JsonDogEvent['classes'][number], 'class' | 'state'> & { date?: Date | string }>
  }

/** What a per-class results gate reads besides the dates. */
type ResultsGateFlags = Pick<JsonDogEvent, 'state' | 'resultsPublished' | 'startListPublished'>

/** The event-wide results gates: the start list's own reading plus the results flag. */
type ResultsAvailabilityEvent = StartListAvailabilityEvent & Pick<JsonDogEvent, 'resultsPublished'>

export const isStartListAvailable = (event: StartListAvailabilityEvent) => {
  const { classes, state, startListPublished } = event

  if (classes?.length) {
    return classes.some((eventClass) => isStartListAvailableForClass(event, eventClass))
  }

  if (!canPublishStartList(state, event)) return false
  if (isStartListPublishedClassMap(startListPublished)) {
    return Object.values(startListPublished).some(Boolean)
  }

  // The legacy default applies only to a workflow-published event; see isStartListAvailableForClass.
  return canPublishStartList(state) ? startListPublished !== false : startListPublished === true
}

/**
 * Whether the event's own dates have carried it to `phase`, regardless of the workflow state it was
 * left in.
 *
 * The stored state cannot be relied on to get there: the event form offers only draft/tentative/
 * confirmed/cancelled, and the backend advances a class no further than 'picked' or 'invited', as the
 * side effect of sending those emails. Nothing anywhere sets 'started', so a gate reading the state
 * alone stays shut for every event whose secretary never sends them.
 *
 * The phase comes from getTemporalPhaseIndex — the same derivation the progress stepper shows — so a
 * gate cannot disagree with the step the secretary is looking at. The state is still consulted for
 * whether the event counts at all: the temporal reading ignores it, and without this check a cancelled
 * event would come open merely by growing old.
 */
const hasReachedPhaseByDate = (event: EventVitals | undefined, phase: EventProgressPhase, now: Date) =>
  !!event && isValidForEntry(event.state) && getTemporalPhaseIndex(event, now) >= getProgressPhaseIndex(phase)

export const canPublishStartList = (
  state: JsonDogEvent['state'] | JsonDogEvent['classes'][number]['state'],
  event?: EventVitals,
  now = new Date()
) =>
  state === 'invited' ||
  state === 'started' ||
  state === 'ended' ||
  state === 'completed' ||
  hasReachedPhaseByDate(event, 'invited', now)

/** Nothing to publish before the dogs have run, unlike a start list, which exists beforehand. */
export const canPublishResults = (
  state: JsonDogEvent['state'] | JsonDogEvent['classes'][number]['state'],
  event?: EventVitals,
  now = new Date()
) => state === 'started' || state === 'ended' || state === 'completed' || hasReachedPhaseByDate(event, 'started', now)

/** Whether the day has begun in the event's zone: before it, none of its dogs has run (KOE-1510). */
export const hasDayStarted = (day: DayInput, now = new Date()) =>
  dayPasses(day, (key) => dayStart(key, TIME_ZONE) <= now)

export const isResultsPublishedClassMap = (
  resultsPublished: JsonDogEvent['resultsPublished']
): resultsPublished is Partial<Record<RegistrationClass, ResultsDayScope>> =>
  typeof resultsPublished === 'object' && resultsPublished !== null && !Array.isArray(resultsPublished)

/**
 * The days whose results are out, for the class or, given none, for a classless event (NOU, NOME-A),
 * whose one scope covers the whole event (KOE-1464, KOE-1510). A class map names classes, so it has
 * nothing to say about an event without one.
 *
 * Publishing is explicit. Where the start list treats an absent flag as published (its records
 * predate the flag), an absent results flag means not published: a result nobody released must not
 * leak.
 */
const getResultsDayScope = (
  { resultsPublished }: Pick<JsonDogEvent, 'resultsPublished'>,
  eventClass?: RegistrationClass
): ResultsDayScope => {
  if (!isResultsPublishedClassMap(resultsPublished)) return resultsPublished ?? false
  return eventClass ? (resultsPublished[eventClass] ?? false) : false
}

/** Whether one day's results of the class, or of a classless event, are out (KOE-1510). */
export const isResultsPublishedForDay = (
  event: Pick<JsonDogEvent, 'resultsPublished'>,
  eventClass: ClassOrNone,
  date: DayInput
) => scopeHasDay(getResultsDayScope(event, eventClass), date)

type ResultsDaysEvent = Pick<JsonDogEvent, 'resultsPublished'> & ClassDaysEvent

/** Whether the results of every day the class runs, or the classless event does, are out. */
export const isResultsPublished = (event: ResultsDaysEvent, eventClass?: RegistrationClass) =>
  scopeHasEveryDay(getResultsDayScope(event, eventClass), getClassDays(event, eventClass))

/** Every day of every class has its results out: the public list is no longer just participants (KOE-1285). */
export const hasAllResultsPublished = (event: ResultsDaysEvent): boolean => {
  const classes = uniqueClasses(event)
  if (classes.length === 0) return isResultsPublished(event)
  return classes.every((eventClass) => isResultsPublished(event, eventClass))
}

/**
 * Whether today's results are all out: those of every class entry dated today in the event's zone,
 * or a classless event's today (KOE-1510). A trial whose entries name no day today falls back on the
 * whole trial being published.
 */
const isTodaysResultsPublished = (event: ResultsDaysEvent, now: Date) => {
  const classes = event.classes ?? []
  if (classes.length === 0) return isResultsPublishedForDay(event, undefined, now)

  const today = eventDayKey(now)
  const todays = classes.filter((item) => {
    const date = item.date ?? event.startDate
    return !!date && eventDayKey(date) === today
  })
  if (todays.length === 0) return hasAllResultsPublished(event)
  return todays.every((item) => isResultsPublishedForDay(event, item.class, today))
}

/**
 * Whether the event is live: a post has been run today (or a span is still open) and the day's
 * results are not yet all out. The one rule for the calendar's chip and the start list's live section
 * alike: it holds to the end of the day, or to the publication of the day's results if that comes
 * first, and a two-day trial lights up again with the next morning's first turn.
 */
export const isEventLive = (
  event: ResultsDaysEvent & {
    liveTurns?: readonly { startedAt: string | Date; endedAt?: string | Date }[]
  },
  now: Date = new Date()
): boolean => !isTodaysResultsPublished(event, now) && isLiveNow(event.liveTurns ?? [], now)

/**
 * A result reaches the public on the start list's rows, so a published result on an unpublished list
 * is invisible. Requiring the list here keeps the two from disagreeing, and means hiding a list hides
 * the results riding on it. The entry's own day decides, because each day of a class is published on
 * its own (KOE-1510).
 */
export const isResultsAvailableForClass = (
  event: ResultsGateFlags & EventVitals,
  eventClass: Pick<JsonDogEvent['classes'][number], 'class' | 'state'> & { date?: Date | string }
) =>
  isStartListAvailableForClass(event, eventClass) &&
  canPublishResults(eventClass.state ?? event.state, event) &&
  isResultsPublishedForDay(event, eventClass.class, eventClass.date ?? event.startDate)

type ResultsFoldEvent = Pick<JsonDogEvent, 'resultsPublished'> & ClassDaysEvent

type ResultsDayChange = { day: string; published: boolean }

/** A list of day keys as stored: none is `false`. */
const keysOrNone = (keys: string[]): ResultsDayScope => (keys.length ? keys : false)

/**
 * A class's results scope, or a classless event's, as it is stored after an optional change of one day
 * (KOE-1510). Unlike the start numbers, a list never collapses to `true`: `true` means every day, so a
 * day the event form adds later would be published as its results were entered. A stored plain flag
 * is kept as it is, `true` keeping its meaning for a day added later, and publishing a day on it
 * changes nothing; hiding a day of it lists the days that stay out.
 */
const foldResultsScope = (event: ResultsFoldEvent, eventClass: ClassOrNone, change?: ResultsDayChange) => {
  const scope = getResultsDayScope(event, eventClass)
  if (!change) return typeof scope === 'boolean' ? scope : keysOrNone(sortedDayKeys(scopeSlotKeys(scope)))
  if (scope === true && change.published) return true

  const keys = scopeKeys(scope, getClassDays(event, eventClass))
  return keysOrNone(sortedDayKeys(withDayKey(keys, change.day, change.published)))
}

/**
 * The stored flag once one day of the class, or of a classless event, is published or hidden
 * (KOE-1510). Only the named day changes, whatever the clock says about the others. Every list is
 * written back as day keys, so no date an earlier write let in survives the next.
 */
export const withResultsDay = (
  event: ResultsFoldEvent,
  eventClass: ClassOrNone,
  day: string,
  published: boolean
): ResultsPublishedState => {
  const change = { day, published }
  if (!eventClass) return foldResultsScope(event, undefined, change)

  const result: Partial<Record<RegistrationClass, ResultsDayScope>> = {}
  for (const item of uniqueClasses(event)) {
    result[item] = foldResultsScope(event, item, item === eventClass ? change : undefined)
  }
  return result
}

/** One entry of a stored day list: a day key, or a day key and a time. */
export const isDayEntry = (entry: unknown): entry is string => typeof entry === 'string'

/** A scope as a client sent it; anything not shaped like one publishes nothing. */
const toDayScope = (value: unknown): ResultsDayScope => {
  if (typeof value === 'boolean') return value
  return Array.isArray(value) ? value.filter(isDayEntry) : false
}

/** The scope a sent flag gives the class, or the classless event: a class map has nothing for the latter. */
const sentDayScope = (sent: unknown, eventClass: ClassOrNone): ResultsDayScope => {
  if (!isObject(sent)) return toDayScope(sent)
  return eventClass ? toDayScope(sent[eventClass]) : false
}

/** The days a scope publishes, in order: `true` is every day of the class. */
const publishedKeys = (scope: ResultsDayScope, days: string[]) => sortedDayKeys(scopeKeys(scope, days))

/**
 * Whether a results flag publishes the same days of the event's classes, or of a classless event, as
 * the stored one (KOE-1510). Read through the day keys, so a client's copy whose days went back out as
 * timestamps (as an older client's did) still compares equal to what is stored, and
 * `true` equals the list of every day.
 */
export const isSameResultsPublished = (event: ResultsFoldEvent, sent: unknown): boolean => {
  const classes = uniqueClasses(event)
  const scopes: ClassOrNone[] = classes.length ? classes : [undefined]
  return scopes.every((eventClass) => {
    const days = getClassDays(event, eventClass)
    const stored = publishedKeys(getResultsDayScope(event, eventClass), days)
    const theirs = publishedKeys(sentDayScope(sent, eventClass), days)
    return stored.length === theirs.length && stored.every((key, index) => key === theirs[index])
  })
}

export type EventProgressStep =
  | Exclude<ConfirmedEventStates, 'completed'>
  | 'confirmed_entryOpen'
  | 'startListPublished'
  | 'startNumbersPublished'
  | 'resultsPublished'
  | 'resultsHandedOver'
type EventProgressPhase = Exclude<EventProgressStep, 'resultsHandedOver'> | 'confirmed_entryClosed'

export const EVENT_PROGRESS_PHASES: readonly EventProgressStep[] = [
  'confirmed',
  'confirmed_entryOpen',
  'picked',
  'invited',
  'startListPublished',
  'startNumbersPublished',
  'started',
  'ended',
  'resultsPublished',
  'resultsHandedOver',
]

/** The steps of a trial whose results never go to Kennelliitto: all but the hand-over, which is last. */
const PHASES_WITHOUT_KENNELLIITTO = EVENT_PROGRESS_PHASES.filter((phase) => phase !== 'resultsHandedOver')

/**
 * Where a trial stands with Kennelliitto, for a trial whose results go there. The caller answers it,
 * because whether the event type is official is read from the event types the browser has loaded, and
 * the lock from `isResultsLocked`, which lives with the rest of the Kennelliitto rules.
 */
interface KennelliittoProgressInput {
  /** The trial is with the chief judge, or done: Kennelliitto's state says so (KOE-1579). */
  readonly handedOver: boolean
}

const getProgressPhaseIndex = (phase: EventProgressPhase | 'completed'): number => {
  if (phase === 'completed') return EVENT_PROGRESS_PHASES.indexOf('ended')
  if (phase === 'confirmed_entryClosed') return EVENT_PROGRESS_PHASES.indexOf('confirmed_entryOpen')
  return EVENT_PROGRESS_PHASES.indexOf(phase)
}

const getStateProgressPhaseIndex = (state: ConfirmedEventStates, entryStarted: boolean): number => {
  if (state === 'confirmed') return getProgressPhaseIndex(entryStarted ? 'confirmed_entryOpen' : 'confirmed')
  return getProgressPhaseIndex(state)
}

const getTemporalPhaseIndex = (event: EventVitals, now: Date): number => {
  if (isEventOver(event, now)) return getProgressPhaseIndex('ended')
  if (isEventOngoing(event, now)) return getProgressPhaseIndex('started')
  return -1
}

/**
 * The classes whose list is published. An absent flag counts only where the workflow carried the class
 * to 'invited', the rule the public list and the publishing panel read it by: a trial whose date merely
 * went by, its invitations never sent, has to be published on purpose (KOE-1465).
 */
const getPublishedStartListClasses = (event: ConfirmedEvent, startListClasses: string[]): string[] =>
  startListClasses.filter((eventClass) => {
    const state = event.classes.find((item) => item.class === eventClass)?.state ?? event.state
    const explicitlyPublished =
      event.startListPublished === true || isStartListPublishedClassMap(event.startListPublished)
    return isStartListPublishedForClass(event, eventClass) && (explicitlyPublished || canPublishStartList(state))
  })

/**
 * The phase a computed index names: the highest step it has reached. Only the two halves of `confirmed`
 * need the event itself, because they share one index and are told apart by whether entry is open.
 */
const getProgressPhaseAtIndex = (event: ConfirmedEvent, phaseIndex: number, now: Date): EventProgressPhase => {
  if (phaseIndex >= getProgressPhaseIndex('resultsPublished')) return 'resultsPublished'
  if (phaseIndex >= getProgressPhaseIndex('ended')) return 'ended'
  if (phaseIndex >= getProgressPhaseIndex('started')) return 'started'
  if (phaseIndex >= getProgressPhaseIndex('startNumbersPublished')) return 'startNumbersPublished'
  if (phaseIndex >= getProgressPhaseIndex('startListPublished')) return 'startListPublished'
  if (phaseIndex >= getProgressPhaseIndex('invited')) return 'invited'
  if (phaseIndex >= getProgressPhaseIndex('picked')) return 'picked'
  if (phaseIndex >= getProgressPhaseIndex('confirmed_entryOpen')) {
    return isEntryOpen(event, now) ? 'confirmed_entryOpen' : 'confirmed_entryClosed'
  }
  return 'confirmed'
}

/**
 * How far the trial has got, step by step. `kennelliitto` is given for a trial whose results go to
 * Kennelliitto, and adds the hand-over as the last step. That step is the stepper's only: handing over
 * and publishing the results happen in either order, so it never moves `phase`, which the event list
 * reads, past a step still undone (KOE-1579).
 */
export const getEventProgress = (event: ConfirmedEvent, now = new Date(), kennelliitto?: KennelliittoProgressInput) => {
  const entryStarted = hasEntryStarted(event, now)
  const eventClasses = [...new Set(event.classes.map(({ class: eventClass }) => eventClass))]
  const classPhases = eventClasses.map((eventClass) => {
    const state = event.classes.find((item) => item.class === eventClass)?.state ?? event.state
    return { eventClass, phaseIndex: getStateProgressPhaseIndex(state, entryStarted) }
  })
  const statePhaseIndex = classPhases.length
    ? Math.min(...classPhases.map(({ phaseIndex }) => phaseIndex))
    : getStateProgressPhaseIndex(event.state, entryStarted)
  const startListClasses = eventClasses.length ? eventClasses : [event.eventType]
  const temporalPhaseIndex = getTemporalPhaseIndex(event, now)
  const publishableStartListClasses = startListClasses.filter((eventClass) => {
    const state = event.classes.find((item) => item.class === eventClass)?.state ?? event.state
    return canPublishStartList(state, event, now)
  })
  const publishedStartListClasses = getPublishedStartListClasses(event, startListClasses)
  const startListActionable = publishableStartListClasses.length > 0 || publishedStartListClasses.length > 0
  const startListCompleted = startListActionable && publishedStartListClasses.length === startListClasses.length

  // Start numbers step right behind the list's: numbers ride a published list, so only published
  // list classes count, and their own absent-means-published legacy default completes the step there.
  const publishedStartNumbersClasses = publishedStartListClasses.filter((eventClass) =>
    isStartNumbersPublishedForClass(event, eventClass)
  )
  const startNumbersActionable = publishedStartListClasses.length > 0
  const startNumbersCompleted = startListCompleted && publishedStartNumbersClasses.length === startListClasses.length

  // The results step, mirroring the start list's. Unlike it there is no legacy default: a result is
  // published only where something says so, so an event that never gets here simply stops at 'ended'.
  const resultsActionable = startListClasses.some((eventClass) =>
    canPublishResults(event.classes.find((item) => item.class === eventClass)?.state ?? event.state, event, now)
  )
  const resultsCompleted = resultsActionable && hasAllResultsPublished(event)

  // Sent dogs alone do not finish it: the step is done when the trial is handed to the chief judge.
  const kennelliittoCompleted = kennelliitto?.handedOver === true
  const kennelliittoActionable = !!kennelliitto && resultsActionable && !kennelliittoCompleted

  const phaseIndex = Math.max(
    statePhaseIndex,
    startListCompleted ? getProgressPhaseIndex('startListPublished') : -1,
    startNumbersCompleted ? getProgressPhaseIndex('startNumbersPublished') : -1,
    resultsCompleted ? getProgressPhaseIndex('resultsPublished') : -1,
    temporalPhaseIndex
  )
  const reachedPhaseIndex = Math.max(
    getStateProgressPhaseIndex(event.state, entryStarted),
    temporalPhaseIndex,
    ...classPhases.map(({ phaseIndex }) => phaseIndex)
  )

  return {
    classPhases,
    entryStarted,
    eventClasses,
    kennelliittoActionable,
    kennelliittoCompleted,
    phase: getProgressPhaseAtIndex(event, phaseIndex, now),
    phases: kennelliitto ? EVENT_PROGRESS_PHASES : PHASES_WITHOUT_KENNELLIITTO,
    publishedStartListClasses,
    publishedStartNumbersClasses,
    reachedPhaseIndex,
    resultsActionable,
    resultsCompleted,
    startListActionable,
    startListClasses,
    startListCompleted,
    startNumbersActionable,
    startNumbersCompleted,
    temporalPhaseIndex,
  }
}

export const getEventProgressPhase = (event: ConfirmedEvent, now = new Date()): EventProgressPhase =>
  getEventProgress(event, now).phase

/**
 * How far the selection has got, read the way the stepper reads it: the lowest class state, the event's
 * own where a class has none. Sending the invitations moves a class past 'picked', and a reading that
 * looked for `event.state === 'picked'` alone lost the participants again at that moment, so the calendar
 * fell back to "entry closed" until the start list came out (KOE-1296).
 */
export const getParticipantsPhase = (
  event: Pick<DogEvent, 'state' | 'classes'>
): Extract<EventProgressStep, 'picked' | 'invited'> | undefined => {
  if (!isConfirmedEvent(event)) return undefined

  const states = event.classes.length ? event.classes.map((item) => item.state ?? event.state) : [event.state]
  const phaseIndex = Math.min(...states.map((state) => getProgressPhaseIndex(state)))

  if (phaseIndex >= getProgressPhaseIndex('invited')) return 'invited'
  if (phaseIndex >= getProgressPhaseIndex('picked')) return 'picked'
  return undefined
}

export function getEventTitle(event: DogEvent, t: TFunction<'translation'>, now = new Date()): string {
  if (isConfirmedEvent(event)) {
    return t(`event.states.${getEventProgressPhase(event, now)}`)
  }

  return t(`event.states.${event.state || 'draft'}`)
}

/**
 * What the secretary is told after saving an event. Where saving did something worth naming, the
 * state says it itself — the event was published, taken back to a draft, cancelled. A state with
 * no message of its own reports only that the changes were saved.
 *
 * The `_save` key is named outright rather than asked for as i18next's `context`, which falls back
 * to the state's own name when the contextual key is missing: saving an edit to an invited event
 * announced "Koekutsut lähetetty", reading as though invitations had just gone out (KOE-1421).
 */
export const getEventSavedMessage = (state: EventState | undefined, t: TFunction<'translation'>): string =>
  t(`event.states.${state ?? 'draft'}_save`, { defaultValue: t('event.saved') })

export const getEventStateForClass = (
  event: Pick<JsonDogEvent, 'state'> & {
    classes?: Array<Pick<JsonDogEvent['classes'][number], 'class' | 'state'>>
  },
  eventClass?: string
) => event.classes?.find((item) => item.class === eventClass)?.state ?? event.state

type StartListClassEvent = Pick<JsonDogEvent, 'state' | 'startListPublished'> &
  EventVitals & {
    classes?: Array<Pick<JsonDogEvent['classes'][number], 'class' | 'state'>>
  }

/**
 * A class left at 'picked' never had its invitations sent, and once the trial is over they no longer
 * can be: the publishing panel stops waiting on them then (getStartListBlocker reads the same
 * isEntryEditingClosed), so the public list follows the secretary's publish from that point on, or
 * the class and its results would stay off the web for good (KOE-1509).
 *
 * Only the class's own entry in the per-class map counts. The panel always writes the map; an
 * event-wide `true` is the old flag, and reading it here would put picked classes of old trials on
 * the web at deploy. And where another day of the class was invited, the flag was meant for that
 * day: it cannot tell the days apart, so the picked one stays hidden.
 */
const isPickedClassPublishedAfterTrial = (
  event: StartListClassEvent,
  eventClass: Pick<JsonDogEvent['classes'][number], 'class' | 'state'>
) =>
  isEntryEditingClosed(event, eventClass.state) &&
  isValidForEntry(event.state) &&
  isStartListPublishedClassMap(event.startListPublished) &&
  isStartListPublishedForClass(event, eventClass.class) &&
  !(event.classes ?? []).some(
    (item) => item.class === eventClass.class && canPublishStartList(item.state ?? event.state)
  )

/**
 * An absent flag counts as published only for an event the workflow actually carried to 'invited' —
 * those records predate the flag. An event that reaches the gate on its dates alone must have been
 * published on purpose, or confirming an event and waiting for its date to pass would put its start
 * list on the web by itself.
 */
export const isStartListAvailableForClass = (
  event: StartListClassEvent,
  eventClass: Pick<JsonDogEvent['classes'][number], 'class' | 'state'>
) => {
  if (canPublishStartList(eventClass.state ?? event.state)) return isStartListPublishedForClass(event, eventClass.class)

  // A class carrying its own state below 'invited' says this day is not ready, and the calendar must
  // not overrule it: that is how one day of a class stays hidden while another is public, since the
  // published flag is per class name and cannot tell the days apart. Past the trial it yields to an
  // explicit publish (above). Only a class with no state of its own falls through to what the event's
  // dates say.
  if (eventClass.state !== undefined) return isPickedClassPublishedAfterTrial(event, eventClass)
  if (!canPublishStartList(event.state, event)) return false

  return isStartListPublishedClassMap(event.startListPublished)
    ? event.startListPublished[eventClass.class as RegistrationClass] === true
    : event.startListPublished === true
}

type AvailabilityEvent = {
  classes?: Array<Pick<JsonDogEvent['classes'][number], 'class' | 'state'> & { date?: Date | string }>
  startDate: Date | string
}
type AvailabilityRegistration = { class?: string | null; group: { date?: Date | string; time?: RegistrationTime } }

/**
 * The class entry a registration belongs to, matched on the day it runs.
 *
 * A multi-day event has one entry per class per day and they can be in different states, so the day
 * decides which one governs. Shared by the start list and the results so the two cannot disagree about
 * which class a dog is in.
 */
const findRegistrationClass = (event: AvailabilityEvent, registration: AvailabilityRegistration) => {
  const classes = event.classes ?? []
  if (!registration.class || classes.length === 0) return undefined

  // A stored event without a start date has no day to match on; the class stands alone then, as before.
  const registrationDate = storedDayKey(registration.group.date ?? event.startDate)
  const eventClasses = classes.filter((eventClass) => eventClass.class === registration.class)
  const onTheDay = eventClasses.find((item) => storedDayKey(item.date ?? event.startDate) === registrationDate)

  return onTheDay ?? (eventClasses.length === 1 ? eventClasses[0] : undefined)
}

export const isStartListAvailableForRegistration = (
  event: Pick<JsonDogEvent, 'state' | 'startListPublished'> & AvailabilityEvent,
  registration: AvailabilityRegistration
) => {
  const classes = event.classes ?? []
  if (!registration.class || classes.length === 0) return classes.length === 0

  const eventClass = findRegistrationClass(event, registration)

  return eventClass ? isStartListAvailableForClass(event, eventClass) : false
}

/** What reading the days a class runs needs: its entries, or the event's own span where it has none. */
type ClassDaysEvent = {
  classes?: Array<Pick<JsonDogEvent['classes'][number], 'class'> & { date?: Date | string }>
  startDate?: Date | string
  endDate?: Date | string
}

type StartNumbersDaysEvent = Pick<JsonDogEvent, 'startNumbersPublished'> & ClassDaysEvent

/**
 * The days a class runs, as day keys: one class entry per day, or the event's own days when it has
 * none. A classless span is capped: no trial runs longer, and an open-ended fixture (an end date
 * decades away) must not turn a render into a loop over ten thousand days.
 */
const CLASS_MAX_DAYS = 14

export const getClassDays = (event: ClassDaysEvent, eventClass?: string): DayKey[] => {
  const classes = event.classes ?? []
  const classDates = eventClass
    ? classes.filter((item) => item.class === eventClass).map((item) => item.date ?? event.startDate)
    : []
  if (classDates.length || !event.startDate) {
    return [...new Set(classDates.filter((date): date is Date | string => !!date).map(eventDayKey))]
  }

  const first = eventDayKey(event.startDate)
  const capped = addDays(first, CLASS_MAX_DAYS - 1)
  // An end before the start is still the one day; an end past the cap is cut at it.
  let last = eventDayKey(event.endDate ?? event.startDate)
  if (last < first) last = first
  if (last > capped) last = capped
  return eachDay(first, last)
}

const isStartNumbersPublishedClassMap = (
  startNumbersPublished: JsonDogEvent['startNumbersPublished']
): startNumbersPublished is Partial<Record<RegistrationClass, StartNumbersDayScope>> =>
  typeof startNumbersPublished === 'object' && startNumbersPublished !== null && !Array.isArray(startNumbersPublished)

/**
 * Start numbers ride the start list but publish separately (KOE-1006). A wholly absent flag means
 * published — every event before the flag put its numbers out with the list, and a deploy must not
 * pull them. But a class *missing from an existing map* was added after the flag existed, so it has
 * no legacy claim and stays unpublished until the secretary releases it (KOE-1266).
 */
export const getStartNumbersDayScope = (
  { startNumbersPublished }: Pick<JsonDogEvent, 'startNumbersPublished'>,
  eventClass?: string
): StartNumbersDayScope =>
  isStartNumbersPublishedClassMap(startNumbersPublished)
    ? (startNumbersPublished[eventClass as RegistrationClass] ?? false)
    : (startNumbersPublished ?? true)

/** The half of a day that draws on its own (KOE-1430): the morning or the afternoon, never a whole day. */
export type StartNumbersTime = Extract<RegistrationTime, 'ap' | 'ip'>

const START_NUMBERS_TIMES: readonly StartNumbersTime[] = ['ap', 'ip']

/** The same list, wide enough to be asked about any value without asserting what it is. */
const START_NUMBERS_TIME_VALUES: readonly unknown[] = START_NUMBERS_TIMES

export const isStartNumbersTime = (value: unknown): value is StartNumbersTime =>
  START_NUMBERS_TIME_VALUES.includes(value)

/**
 * The stored form of one slot of a class's numbers: the day key alone for a whole day, or the day
 * key and the time for one half of it (KOE-1430). A day with no halves (`kp`) only ever has the key.
 */
export const startNumbersSlotKey = (date: Date | string, time?: RegistrationTime) => {
  const day = eventDayKey(date)
  return isStartNumbersTime(time) ? `${day}/${time}` : day
}

/**
 * A scope list as slot keys: the day keys and the half-day keys as they are stored. Between 3.9.2026
 * (5a4c9e57) and 28.9.2026 (b4e4ed68) an event save could carry a browser's copy of the list, whose
 * days the JSON reviver of the time had turned into dates that went back as ISO timestamps; such an
 * entry is read as the Finnish day it names (KOE-1546).
 */
const scopeSlotKeys = (scope: string[]) =>
  scope.map((entry) => (entry.includes('T') ? (storedDayKey(entry) ?? entry) : entry))

/** Only the whole days of a scope list: a half-day entry does not make its day published. */
const scopeDayKeys = (scope: string[]) => scopeSlotKeys(scope).filter((key) => !key.includes('/'))

/** A scope of published days, the start numbers' or the results': every day, none, or the listed ones. */
type DayScope = StartNumbersDayScope | ResultsDayScope

/** Whether a scope covers the day: a list by its whole days, a plain flag every day alike. */
const scopeHasDay = (scope: DayScope, date: DayInput) =>
  Array.isArray(scope) ? !!date && scopeDayKeys(scope).includes(eventDayKey(date)) : scope

/** Whether a scope covers every one of the days; a list covers nothing of a class without days. */
const scopeHasEveryDay = (scope: DayScope, days: string[]) => {
  if (!Array.isArray(scope)) return scope

  const published = scopeDayKeys(scope)
  return days.length > 0 && days.every((day) => published.includes(day))
}

/** The keys a scope covers, `true` standing for every one of the days. */
export const scopeKeys = (scope: DayScope, days: string[]): string[] => {
  if (Array.isArray(scope)) return scopeSlotKeys(scope)
  return scope ? days : []
}

/** One whole day published or hidden in a list of keys; nothing else in the list moves. */
export const withDayKey = (keys: string[], day: string, published: boolean) =>
  published ? [...keys, day] : keys.filter((key) => key !== day)

/** Keys in order and without repeats. */
const sortedDayKeys = (keys: string[]) => [...new Set(keys)].sort((a, b) => a.localeCompare(b))

/**
 * A list of keys folded back into the stored scope: in order and without repeats, `true` once it
 * covers every day and `false` once it is empty. A class published day by day therefore ends up
 * stored as it was before day lists existed.
 */
export const foldDayScope = (keys: string[], days: string[]): DayScope => {
  const next = sortedDayKeys(keys)
  if (next.length === 0) return false
  if (days.every((day) => next.includes(day))) return true
  return next
}

/** Whether the numbers of one day of the class (or of a classless event) are out (KOE-1304). */
export const isStartNumbersPublishedForDay = (
  event: Pick<JsonDogEvent, 'startNumbersPublished'>,
  eventClass: string | undefined,
  date: DayInput
) => scopeHasDay(getStartNumbersDayScope(event, eventClass), date)

/**
 * Whether the numbers of one slot are out (KOE-1430): the whole day counts, and so does the half the
 * slot runs in. A slot without a half — a day with no morning and afternoon — only has the day.
 */
export const isStartNumbersPublishedForSlot = (
  event: Pick<JsonDogEvent, 'startNumbersPublished'>,
  eventClass: string | undefined,
  date: DayInput,
  time?: RegistrationTime
) => {
  const scope = getStartNumbersDayScope(event, eventClass)
  if (!Array.isArray(scope)) return scope
  if (!date) return false

  const keys = scopeSlotKeys(scope)
  return (
    keys.includes(eventDayKey(date)) || (isStartNumbersTime(time) && keys.includes(startNumbersSlotKey(date, time)))
  )
}

/** Whether the class's numbers are out for every day it runs: a day list only counts once it is complete. */
export const isStartNumbersPublishedForClass = (event: StartNumbersDaysEvent, eventClass?: string) =>
  scopeHasEveryDay(getStartNumbersDayScope(event, eventClass), getClassDays(event, eventClass))

/** The days of the class whose numbers are out, for telling a partly published class apart (KOE-1304). */
export const getPublishedStartNumbersDays = (event: StartNumbersDaysEvent, eventClass?: string): string[] => {
  const scope = getStartNumbersDayScope(event, eventClass)
  const days = getClassDays(event, eventClass)
  if (Array.isArray(scope)) {
    const published = scopeDayKeys(scope)
    return days.filter((day) => published.includes(day))
  }
  return scope ? days : []
}

export interface PublishedStartNumbersSlot {
  /** The day, in the event's time zone. */
  date: DayKey
  /** The half of the day that is out on its own; absent when the whole day is (KOE-1430). */
  time?: StartNumbersTime
}

/**
 * What is out of the class, slot by slot and in day order: a whole day as its day, a day out by
 * halves as each half (KOE-1430). This is what the panel's caption lists for a partly published class.
 */
export const getPublishedStartNumbersSlots = (
  event: StartNumbersDaysEvent,
  eventClass?: string
): PublishedStartNumbersSlot[] => {
  const scope = getStartNumbersDayScope(event, eventClass)
  const days = getClassDays(event, eventClass)
  if (!Array.isArray(scope)) return scope ? days.map((date) => ({ date })) : []

  const keys = scopeSlotKeys(scope)
  return days.flatMap((date) => {
    if (keys.includes(date)) return [{ date }]
    return START_NUMBERS_TIMES.filter((time) => keys.includes(startNumbersSlotKey(date, time))).map((time) => ({
      date,
      time,
    }))
  })
}

/**
 * The halves a day of the class runs in, from the dogs placed on it: the morning and the afternoon
 * a trial draws separately (KOE-1430). A day whose dogs have no half, or only one, is not split —
 * there is nothing to publish apart from the day itself. The caller passes the dogs of one class.
 */
export const getStartNumbersDayTimes = (
  registrations: ReadonlyArray<{ group?: { date?: Date | string; time?: RegistrationTime } }>,
  date: Date | string
): StartNumbersTime[] => {
  const day = eventDayKey(date)
  const times = new Set<StartNumbersTime>()
  for (const { group } of registrations) {
    if (group?.date && isStartNumbersTime(group.time) && eventDayKey(group.date) === day) {
      times.add(group.time)
    }
  }
  const split = START_NUMBERS_TIMES.filter((time) => times.has(time))
  return split.length > 1 ? split : []
}

type StartNumbersEvent = Pick<JsonDogEvent, 'state' | 'startListPublished' | 'startNumbersPublished'>

/** Numbers can only be public on a published list: the list is the numbers' only transport. */
export const isStartNumbersAvailableForClass = (
  event: StartNumbersEvent & EventVitals,
  eventClass: Pick<JsonDogEvent['classes'][number], 'class' | 'state'> & { date?: Date | string }
) =>
  isStartListAvailableForClass(event, eventClass) &&
  isStartNumbersPublishedForDay(event, eventClass.class, eventClass.date ?? event.startDate)

export const isStartNumbersAvailable = (
  event: StartNumbersEvent &
    EventVitals &
    EventDates & {
      classes?: Array<Pick<JsonDogEvent['classes'][number], 'class' | 'state'> & { date?: Date | string }>
    }
) => {
  if (event.classes?.length) {
    return event.classes.some((eventClass) => isStartNumbersAvailableForClass(event, eventClass))
  }

  return isStartListAvailable(event) && isStartNumbersPublishedForClass(event)
}

export const isStartNumbersAvailableForRegistration = (
  event: StartNumbersEvent & AvailabilityEvent,
  registration: AvailabilityRegistration
) => {
  if (!isStartListAvailableForRegistration(event, registration)) return false

  const classes = event.classes ?? []
  const { time } = registration.group
  const date = registration.group.date ?? event.startDate
  if (!registration.class || classes.length === 0) return isStartNumbersPublishedForSlot(event, undefined, date, time)

  const eventClass = findRegistrationClass(event, registration)

  return eventClass ? isStartNumbersPublishedForSlot(event, eventClass.class, eventClass.date ?? date, time) : false
}

export const getStartNumbersPublishedClassMap = ({
  classes,
  startNumbersPublished,
}: Pick<JsonDogEvent, 'startNumbersPublished'> & {
  classes: Array<Pick<JsonDogEvent['classes'][number], 'class'>>
}): Partial<Record<RegistrationClass, StartNumbersDayScope>> => {
  const existingMap = isStartNumbersPublishedClassMap(startNumbersPublished) ? startNumbersPublished : {}
  // The absent-means-published default (above) carries into the expanded map, but a class missing
  // from an existing map is post-feature and starts unpublished (KOE-1266).
  const defaultPublished = isStartNumbersPublishedClassMap(startNumbersPublished)
    ? false
    : startNumbersPublished !== false
  const result: Partial<Record<RegistrationClass, StartNumbersDayScope>> = {}

  for (const eventClass of classes) {
    result[eventClass.class] = existingMap[eventClass.class] ?? defaultPublished
  }

  return result
}

/** A classless event's list is out and its trial has run, so its published days can be read. */
const isClasslessResultsOpen = (event: ResultsAvailabilityEvent) =>
  isStartListAvailable(event) && canPublishResults(event.state, event)

/**
 * Whether any results can be read on the public start list page: some class day whose list and results
 * are both public, the same class for both. A list public in one class and results in another show
 * nothing. A classless event (NOU, NOME-A) publishes its results as one scope for the whole event
 * (KOE-1464), any day of which will do here.
 */
export const hasAvailableResults = (event: ResultsAvailabilityEvent): boolean => {
  if (event.classes?.length) return event.classes.some((eventClass) => isResultsAvailableForClass(event, eventClass))

  const scope = getResultsDayScope(event)
  return isClasslessResultsOpen(event) && (Array.isArray(scope) ? scope.length > 0 : scope)
}

/**
 * Whether this dog's result may be shown.
 *
 * Gated on its own class and nothing else: a start list can be public long before any result is, so an
 * unpublished result must not ride out on the back of a published list.
 */
export const isResultsAvailableForRegistration = (
  event: ResultsAvailabilityEvent & AvailabilityEvent,
  registration: AvailabilityRegistration
) => {
  if (!event.classes?.length) {
    // A classless event publishes day by day too: the dog's own day decides (KOE-1510).
    const date = registration.group.date ?? event.startDate
    return isClasslessResultsOpen(event) && isResultsPublishedForDay(event, undefined, date)
  }

  const eventClass = findRegistrationClass(event, registration)

  return eventClass ? isResultsAvailableForClass(event, eventClass) : false
}

export const isStartListPublishedForClass = (event: Pick<JsonDogEvent, 'startListPublished'>, eventClass: string) =>
  isStartListPublishedClassMap(event.startListPublished)
    ? event.startListPublished[eventClass as RegistrationClass] === true
    : event.startListPublished !== false

export const isStartListPublishedClassMap = (
  startListPublished: JsonDogEvent['startListPublished']
): startListPublished is Partial<Record<RegistrationClass, boolean>> =>
  typeof startListPublished === 'object' && startListPublished !== null

/** A class entry whose own state has not reached the invitations. */
const isHeldAtPicking = (eventClass: Pick<JsonDogEvent['classes'][number], 'state'>) =>
  eventClass.state !== undefined && !canPublishStartList(eventClass.state)

/**
 * The event's start list flag as a full per-class map. A class missing from an existing map is
 * unpublished; an event-level boolean covers every class but one held at 'picked' by its own state
 * (KOE-1509); an absent flag is read class by class by the
 * public list's rule, so expanding it never publishes a class the workflow did not carry to 'invited'
 * (KOE-1465). A class running on several days is read from its first entry, as the panel reads it.
 */
export const getStartListPublishedClassMap = (
  event: Pick<JsonDogEvent, 'state' | 'startListPublished'> &
    EventVitals & {
      classes: Array<Pick<JsonDogEvent['classes'][number], 'class' | 'state'>>
    }
): Partial<Record<RegistrationClass, boolean>> => {
  const { classes, startListPublished } = event
  const result: Partial<Record<RegistrationClass, boolean>> = {}

  for (const eventClass of classes) {
    if (isStartListPublishedClassMap(startListPublished)) {
      result[eventClass.class] = startListPublished[eventClass.class] ?? false
    } else if (startListPublished === undefined) {
      result[eventClass.class] ??= isStartListAvailableForClass(event, eventClass)
    } else {
      // An event-wide true never opens a class held at 'picked' by its own state, but a map entry does
      // once the trial is over (KOE-1509): expanding it must not publish that class by itself. A class
      // with any entry past the picking keeps the flag.
      result[eventClass.class] ||= startListPublished && !isHeldAtPicking(eventClass)
    }
  }

  return result
}

export const isEventDeletable = ({ state }: Partial<Pick<JsonDogEvent, 'state'>> | undefined = {}) =>
  state === 'draft' || state === 'tentative' || state === 'cancelled'

/**
 * The year of the start date's Finnish day, or '' for no date or one without a calendar day (not an
 * instant, or the Kennel Club's year 1): stored rows are read through this, so it never throws.
 */
export const getEventSeason = (startDate?: Date | string): string => String(storedYear(startDate) ?? '')

export const isDetaultEntryStartDate = (date: DayKey | undefined, eventStartDate: DayKey) =>
  !date || defaultEntryStartDate(eventStartDate) === date
export const isDetaultEntryEndDate = (date: DayKey | undefined, eventStartDate: DayKey) =>
  !date || defaultEntryEndDate(eventStartDate) === date

/** The event's days, first to last. */
export const getEventDays = ({ startDate, endDate }: Pick<DogEvent, 'startDate' | 'endDate'>) =>
  eachDay(startDate, endDate)

export const getUniqueEventClasses = ({ classes }: Pick<DogEvent, 'classes'>) =>
  unique(classes?.map((c) => c?.class) ?? []).filter(Boolean)

export const applySingleDayNowtGroups = <T extends object>(
  eventType: string | undefined,
  startDate: DayKey,
  endDate: DayKey,
  classes: readonly T[]
): T[] =>
  eventType === 'NOWT' && startDate === endDate
    ? classes.map((eventClass) => ({ ...eventClass, groups: ['kp'] }))
    : [...classes]

export const getEventClassesByDays = (event: Pick<DogEvent, 'startDate' | 'endDate' | 'classes'>) =>
  getEventDays(event).map((day) => ({
    classes: event.classes?.filter((c) => (c.date ?? event.startDate) === day) ?? [],
    day,
  }))

/** A group's key from its Finnish day and its time. */
export const groupKeyOf = (day: DayKey, time: RegistrationDate['time']) => `${day}-${time}`

/** A group's key: its day and its time. */
export const eventRegistrationDateKey = (rd: RegistrationDate) => groupKeyOf(rd.date, rd.time)

export function sanitizeDogEvent(event: JsonDogEvent): SanitizedJsonPublicDogEvent
export function sanitizeDogEvent(event: ConfirmedEvent): SanitizedPublicConfirmedDogEvent
export function sanitizeDogEvent(event: DogEvent): SanitizedPublicDogEvent
export function sanitizeDogEvent(event: Patch<JsonDogEvent>): Patch<SanitizedJsonPublicDogEvent>
export function sanitizeDogEvent(event: Patch<DogEvent>): Patch<SanitizedPublicDogEvent>
export function sanitizeDogEvent(
  event: DogEvent | JsonDogEvent | Patch<JsonDogEvent> | Patch<DogEvent>
):
  | SanitizedPublicDogEvent
  | SanitizedJsonPublicDogEvent
  | Patch<SanitizedJsonPublicDogEvent>
  | Patch<SanitizedPublicDogEvent> {
  const {
    createdBy: _createdBy,
    deletedAt: _deletedAt,
    deletedBy: _deletedBy,
    headquarters: _headquarters,
    kcId: _kcId,
    kcGuid: _kcGuid,
    kcEvent: _kcEvent,
    kcState: _kcState,
    invitationAttachment: _invitationAttachment,
    invitationAttachmentHistory: _invitationAttachmentHistory,
    invitationAttachments: _invitationAttachments,
    modifiedBy: _modifiedBy,
    organizerId: _organizerId,
    registrationGroupsLock: _registrationGroupsLock,
    registrationPaymentsLock: _registrationPaymentsLock,
    secretary: _secretary,
    official: _official,
    turns,
    ...publicFields
  } = event

  // The public face of the live timeline: the stored spans without their registration ids (KOE-1259).
  // The guard narrows away the partial shapes a Patch could in principle carry; turn patches always
  // hold complete spans, so nothing real is dropped. The map cannot carry the Json/Date correlation
  // of the three overload shapes through TypeScript, so this one boundary conversion re-asserts what
  // the overload signatures promise: string-dated turns for the Json shapes, Date-dated for the rest.
  if (!turns) return publicFields
  const storedTurns: readonly unknown[] = turns
  const liveTurns = storedTurns.filter(isStoredStationTurn).map(toPublicStationTurn)
  return { ...publicFields, liveTurns } as SanitizedJsonPublicDogEvent | SanitizedPublicDogEvent
}

const groupDates = (dates: RegistrationDate[]): Map<DayKey, RegistrationTime[]> =>
  dates.reduce((acc, cur) => {
    if (!cur.time) return acc
    const group = acc.get(cur.date) ?? []
    group.push(cur.time)
    acc.set(cur.date, group)
    return acc
  }, new Map<DayKey, RegistrationTime[]>())

const resolveTimes = (newTimes: RegistrationTime[], oldTimes?: RegistrationTime[]): RegistrationTime[] => {
  // 'kp' is a special group that can not exist with other groups
  if (newTimes.includes('kp')) {
    if (newTimes.length > 1 && oldTimes?.includes('kp')) {
      // for those dates that previously included 'kp' and now include something more, remove 'kp'
      return newTimes.filter((t) => t !== 'kp')
    } else {
      // othervice keep only 'kp'
      return ['kp']
    }
  }
  return newTimes
}

export const applyNewGroupsToDogEventClass = (
  { classes }: Pick<DogEvent, 'classes'>,
  eventClass: RegistrationClass,
  defaultGroups: RegistrationTime[],
  newDates: RegistrationDate[]
): Pick<DogEvent, 'classes' | 'dates'> => {
  const newByDate = groupDates(newDates)
  const newClasses = classes.map((c) => ({
    ...c,
    groups: c.class === eventClass ? [] : (c.groups ?? defaultGroups),
  }))

  for (const [day, newTimes] of newByDate) {
    const nc = newClasses.find((c) => c.class === eventClass && c.date === day)
    if (!nc) continue
    const oc = classes.find((c) => c.class === eventClass && c.date === day)
    nc.groups = resolveTimes(newTimes, oc?.groups)
  }

  // for dates that do not have any times selected, use defaults or 'kp' if last removed value vas something else than 'kp'
  for (const nc of newClasses) {
    if (!nc.groups.length) {
      if (classes.find((c) => c.class === nc.class && c.date === nc.date)?.groups?.filter((t) => t !== 'kp').length)
        nc.groups = ['kp']
      else nc.groups = [...defaultGroups]
    }
  }

  return { classes: newClasses, dates: undefined }
}

export const applyNewGroupsToDogEventDates = (
  { dates, startDate, endDate }: Pick<DogEvent, 'dates' | 'startDate' | 'endDate'>,
  defaultGroups: RegistrationTime[],
  newDates: RegistrationDate[]
): Pick<DogEvent, 'classes' | 'dates'> => {
  const eventDays = getEventDays({ endDate, startDate })
  const oldByDate = groupDates(dates ?? [])
  const newByDate = groupDates(newDates)
  const finalDates: RegistrationDate[] = []

  for (const [date, newTimes] of newByDate) {
    if (!eventDays.includes(date)) continue
    resolveTimes(newTimes, oldByDate.get(date)).forEach((time) => {
      finalDates.push({ date, time })
    })
  }
  // for dates that do not have any times selected, use defaults or 'kp' if last removed value vas something else than 'kp'
  for (const date of eventDays) {
    if (!newByDate.get(date)?.length) {
      if (oldByDate.get(date)?.filter((t) => t !== 'kp').length) finalDates.push({ date, time: 'kp' })
      else
        defaultGroups.forEach((time) => {
          finalDates.push({ date, time })
        })
    }
  }

  finalDates.sort((a, b) =>
    a.date === b.date ? (a.time?.localeCompare(b.time ?? '') ?? 0) : a.date.localeCompare(b.date)
  )

  return { classes: [], dates: finalDates }
}

/**
 * The places per day of an event moved `days` calendar days, as a copy moves its days. A key that is
 * not a day has no day to move to and is left out.
 */
export const shiftPlacesPerDay = (placesPerDay: Record<string, number>, days: number): Record<string, number> => {
  const shifted: Record<string, number> = {}
  Object.entries(placesPerDay).forEach(([day, places]) => {
    if (isDayKey(day)) shifted[addDays(day, days)] = places
  })
  return shifted
}

export const copyDogEvent = (event: DogEvent, now = new Date()): DogEvent => {
  const copy = structuredClone(event)
  const origStartDay = event.startDate
  const newStartDay = newEventStartDay(now, TIME_ZONE)
  const shift = daysBetween(origStartDay, newStartDay)
  /** The day, moved along with the start. */
  const moved = (date: DayKey) => addDays(date, shift)
  const days = daysBetween(origStartDay, copy.endDate)

  copy.id = ''
  copy.name = `Kopio - ${copy.name ?? ''}`
  copy.state = 'draft'
  copy.entries = copy.members = 0

  copy.classes.forEach((c) => {
    c.entries = c.members = 0
    if (c.date) {
      c.date = moved(c.date)
    }
    delete c.state
  })

  copy.dates?.forEach((d) => {
    d.date = moved(d.date)
  })
  // The posts move with their days (KOE-1563).
  copy.stations?.forEach((station) => {
    station.date = moved(station.date)
  })

  if (event.placesPerDay) copy.placesPerDay = shiftPlacesPerDay(event.placesPerDay, shift)

  const newDates = newEventDates(now)
  copy.startDate = newDates.startDate
  copy.endDate = addDays(newStartDay, days)
  copy.entryStartDate = newDates.entryStartDate
  copy.entryEndDate = newDates.entryEndDate
  copy.season = getEventSeason(newDates.startDate)
  // Publish decisions belong to the source event's runs, not the copy — and for numbers and results
  // an inherited flag would skip the whole decision, since absent means published for a start list
  // that predates the flag and a copied `resultsPublished` would advertise results that do not exist.
  copy.startListPublished = false
  copy.startNumbersPublished = false
  delete copy.resultsPublished

  stripKennelliittoLink(copy)
  stripInvitationAttachments(copy)
  delete copy.entryOrigEndDate

  return copy
}

/** The invitation attachments of an event: the general one, the per-class ones and every version uploaded. */
export const INVITATION_ATTACHMENT_FIELDS = [
  'invitationAttachment',
  'invitationAttachmentHistory',
  'invitationAttachments',
] as const

/**
 * Removes the invitation attachments. An attachment is written for the event it was uploaded to, its
 * dates and instructions, so a copy in the same environment starts without one (KOE-1564), and
 * replacing an attachment on the copy cannot delete a file the source still serves.
 */
export const stripInvitationAttachments = <
  T extends { invitationAttachment?: unknown; invitationAttachmentHistory?: unknown; invitationAttachments?: unknown },
>(
  event: T
): T => {
  for (const field of INVITATION_ATTACHMENT_FIELDS) delete event[field]
  return event
}

/** What links an event to its Kennelliitto trial: the GUID, the old integer id and the snapshot of the trial. */
export const KENNELLIITTO_LINK_FIELDS = ['kcEvent', 'kcGuid', 'kcId', 'kcState'] as const

/**
 * Removes the link to a Kennelliitto trial. A copy of an event is not the event the link was made
 * for, and a GUID names a trial in one environment only (KOE-1534). The state last read from the
 * trial goes with it.
 */
export const stripKennelliittoLink = <
  T extends { kcEvent?: unknown; kcGuid?: unknown; kcId?: unknown; kcState?: unknown },
>(
  event: T
): T => {
  for (const field of KENNELLIITTO_LINK_FIELDS) delete event[field]
  return event
}
