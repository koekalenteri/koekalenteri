import type { TFunction } from 'i18next'
import type {
  ConfirmedEvent,
  ConfirmedEventStates,
  DeepPartial,
  DogEvent,
  EventClass,
  EventState,
  JsonDogEvent,
  JsonPublicDogEvent,
  Patch,
  PublicDogEvent,
  RegistrationClass,
  RegistrationDate,
  RegistrationTime,
  SanitizedJsonPublicDogEvent,
  SanitizedPublicConfirmedDogEvent,
  SanitizedPublicDogEvent,
} from '../types'
import { tz } from '@date-fns/tz'
import { addDays } from 'date-fns/addDays'
import { differenceInDays } from 'date-fns/differenceInDays'
import { eachDayOfInterval } from 'date-fns/eachDayOfInterval'
import { isSameDay } from 'date-fns/isSameDay'
import { isValid } from 'date-fns/isValid'
import { nextSaturday } from 'date-fns/nextSaturday'
import { parseISO } from 'date-fns/parseISO'
import { sub } from 'date-fns/sub'
import { subDays } from 'date-fns/subDays'
import { formatDate, TIME_ZONE, zonedDateString, zonedEndOfDay, zonedStartOfDay } from '../i18n/dates'
import { isStoredStationTurn, toPublicStationTurn } from './stationTurns'
import { isConfirmedEvent } from './typeGuards'
import { unique, uniqueDate } from './utils'

type EventVitals = Partial<
  Pick<PublicDogEvent | JsonPublicDogEvent, 'startDate' | 'endDate' | 'entryStartDate' | 'entryEndDate' | 'state'>
>

export const isValidForEntry = (state?: EventState) => !['draft', 'tentative', 'cancelled'].includes(state ?? '')

export const isEntryUpcoming = ({ entryStartDate, state }: EventVitals, now = new Date()) =>
  !!entryStartDate && entryStartDate > now && (isValidForEntry(state) || state === 'tentative')

export const hasEntryStarted = ({ entryStartDate }: EventVitals, now = new Date()) =>
  !!entryStartDate && zonedStartOfDay(entryStartDate) <= now

export const hasEntryEnded = ({ entryEndDate }: EventVitals, now = new Date()) =>
  !!entryEndDate && zonedEndOfDay(entryEndDate) < now

export const isEntryOpen = ({ entryStartDate, entryEndDate, state }: EventVitals, now = new Date()) =>
  !!entryStartDate &&
  !!entryEndDate &&
  zonedStartOfDay(entryStartDate) <= zonedEndOfDay(now) &&
  zonedEndOfDay(entryEndDate) >= zonedEndOfDay(now) &&
  isValidForEntry(state)

export const isEntryClosing = (event: EventVitals, now = new Date()) =>
  !!event.entryEndDate &&
  isEntryOpen(event, now) &&
  subDays(event.entryEndDate, 7) <= zonedEndOfDay(now) &&
  isValidForEntry(event.state)

export const isEntryClosed = ({ startDate, entryEndDate }: EventVitals, now = new Date()) =>
  !!startDate && !!entryEndDate && zonedEndOfDay(entryEndDate) < now && zonedStartOfDay(startDate) > now

export const isEventOngoing = ({ startDate, endDate, state }: EventVitals, now = new Date()) =>
  !!startDate &&
  !!endDate &&
  zonedStartOfDay(startDate) <= zonedEndOfDay(now) &&
  zonedEndOfDay(endDate) >= zonedEndOfDay(now) &&
  isValidForEntry(state) &&
  state !== 'confirmed'

export const isEventOver = ({ endDate }: EventVitals, now = new Date()) => !!endDate && zonedEndOfDay(endDate) < now

export const eventDates = (event?: Pick<PublicDogEvent, 'classes' | 'startDate' | 'endDate'> | null) => {
  if (!event) return []
  const classes = Array.isArray(event.classes) ? event.classes : []
  return classes.length
    ? uniqueDate(classes.map((eventClass) => eventClass.date ?? event.startDate))
    : eachDayOfInterval({ end: event.endDate, start: event.startDate })
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
        const dateStr = item.date ? formatDate(item.date, 'yyyy-MM-dd') : undefined
        return total + (dateStr ? Number(placesPerDay[dateStr]) || 0 : 0)
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
  return uniqueDate(classes.filter((item) => item.class === eventClass).map((item) => item.date ?? event.startDate))
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
    const classDays = new Set(classItems.map((item) => formatDate(item.date ?? event.startDate, 'yyyy-MM-dd')))
    return dates.filter((rd) => !classDays.has(formatDate(rd.date, 'yyyy-MM-dd')))
  }
  const firstDay = formatDate(event.startDate, 'yyyy-MM-dd')
  const lastDay = formatDate(event.endDate, 'yyyy-MM-dd')
  return dates.filter((rd) => {
    const day = formatDate(rd.date, 'yyyy-MM-dd')
    return day < firstDay || day > lastDay
  })
}

export const registrationDates = (event: PublicDogEvent, times: RegistrationTime[], eventClass?: string | null) =>
  (eventClass ? uniqueClassDates(event, eventClass) : eventDates(event)).flatMap<RegistrationDate>((date) =>
    times.map((time) => ({ date, time }))
  )

export const OFFICIAL_EVENT_TYPES = ['NOU', 'NOME-B', 'NOME-B SM', 'NOME-A', 'NOME-A SM', 'NOWT', 'NOWT SM', 'NKM']

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
const eventSeasonFormatter = new Intl.DateTimeFormat('en', { timeZone: TIME_ZONE, year: 'numeric' })

export const defaultEntryStartDate = (eventStartDate: Date) => sub(eventStartDate, { weeks: EntryStartWeeks })
export const defaultEntryEndDate = (eventStartDate: Date) => sub(eventStartDate, { weeks: EntryEndWeeks })

export const newEventStartDate = zonedStartOfDay(nextSaturday(addDays(Date.now(), 90)))
export const newEventEntryStartDate = defaultEntryStartDate(newEventStartDate)
export const newEventEntryEndDate = defaultEntryEndDate(newEventStartDate)

export const isStartListAvailable = (
  event: Pick<JsonDogEvent, 'state' | 'startListPublished'> &
    EventVitals & {
      classes?: Array<Pick<JsonDogEvent['classes'][number], 'class' | 'state'>>
    }
) => {
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

const isResultsPublishedClassMap = (
  resultsPublished: JsonDogEvent['resultsPublished']
): resultsPublished is Partial<Record<RegistrationClass, boolean>> =>
  typeof resultsPublished === 'object' && resultsPublished !== null

/**
 * Publishing is explicit. Where the start list treats an absent flag as published — its records predate
 * the flag — an absent results flag means not published: a result nobody released must not leak.
 */
export const isResultsPublishedForClass = (event: Pick<JsonDogEvent, 'resultsPublished'>, eventClass: string) =>
  isResultsPublishedClassMap(event.resultsPublished)
    ? event.resultsPublished[eventClass as RegistrationClass] === true
    : event.resultsPublished === true

/** Whether any class's results are public — what a search for "events with results" filters on. */
export const hasPublishedResults = ({ resultsPublished }: Pick<JsonDogEvent, 'resultsPublished'>): boolean =>
  isResultsPublishedClassMap(resultsPublished)
    ? Object.values(resultsPublished).some(Boolean)
    : resultsPublished === true

/**
 * A result reaches the public on the start list's own rows — it has no other transport — so a published
 * result on an unpublished list is invisible. Requiring the list here keeps the two from disagreeing,
 * and means hiding a list hides the results riding on it.
 */
export const isResultsAvailableForClass = (
  event: Pick<JsonDogEvent, 'state' | 'resultsPublished' | 'startListPublished'> & EventVitals,
  eventClass: Pick<JsonDogEvent['classes'][number], 'class' | 'state'>
) =>
  isStartListAvailableForClass(event, eventClass) &&
  canPublishResults(eventClass.state ?? event.state, event) &&
  isResultsPublishedForClass(event, eventClass.class)

export const getResultsPublishedClassMap = ({
  classes,
  resultsPublished,
}: Pick<JsonDogEvent, 'resultsPublished'> & {
  classes: Array<Pick<JsonDogEvent['classes'][number], 'class'>>
}): Partial<Record<RegistrationClass, boolean>> => {
  const existingMap = isResultsPublishedClassMap(resultsPublished) ? resultsPublished : {}
  const result: Partial<Record<RegistrationClass, boolean>> = {}

  for (const eventClass of classes) {
    result[eventClass.class] = existingMap[eventClass.class] ?? resultsPublished === true
  }

  return result
}

export type EventProgressStep =
  | Exclude<ConfirmedEventStates, 'completed'>
  | 'confirmed_entryOpen'
  | 'startListPublished'
  | 'startNumbersPublished'
  | 'resultsPublished'
type EventProgressPhase = EventProgressStep | 'confirmed_entryClosed'

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
]

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

const getPublishedStartListClasses = (
  event: ConfirmedEvent,
  startListClasses: string[],
  legacyStartListPublished: boolean
): string[] => {
  if (legacyStartListPublished) return startListClasses

  return startListClasses.filter((eventClass) => {
    const state = event.classes.find((item) => item.class === eventClass)?.state ?? event.state
    const explicitlyPublished =
      event.startListPublished === true || isStartListPublishedClassMap(event.startListPublished)
    return isStartListPublishedForClass(event, eventClass) && (explicitlyPublished || canPublishStartList(state))
  })
}

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

export const getEventProgress = (event: ConfirmedEvent, now = new Date()) => {
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
  const legacyStartListPublished =
    event.startListPublished === undefined && temporalPhaseIndex >= getProgressPhaseIndex('started')
  const publishableStartListClasses = startListClasses.filter((eventClass) => {
    const state = event.classes.find((item) => item.class === eventClass)?.state ?? event.state
    return canPublishStartList(state)
  })
  const publishedStartListClasses = getPublishedStartListClasses(event, startListClasses, legacyStartListPublished)
  const startListActionable =
    legacyStartListPublished || publishableStartListClasses.length > 0 || publishedStartListClasses.length > 0
  const startListCompleted = startListActionable && publishedStartListClasses.length === startListClasses.length

  // Start numbers step right behind the list's: numbers ride a published list, so only published
  // list classes count, and the absent-means-published legacy default completes the step by itself.
  const publishedStartNumbersClasses = publishedStartListClasses.filter((eventClass) =>
    isStartNumbersPublishedForClass(event, eventClass)
  )
  const startNumbersActionable = publishedStartListClasses.length > 0
  const startNumbersCompleted = startListCompleted && publishedStartNumbersClasses.length === startListClasses.length

  // The results step, mirroring the start list's. Unlike it there is no legacy default: a result is
  // published only where something says so, so an event that never gets here simply stops at 'ended'.
  const publishedResultsClasses = startListClasses.filter((eventClass) => isResultsPublishedForClass(event, eventClass))
  const resultsActionable = startListClasses.some((eventClass) =>
    canPublishResults(event.classes.find((item) => item.class === eventClass)?.state ?? event.state, event, now)
  )
  const resultsCompleted = resultsActionable && publishedResultsClasses.length === startListClasses.length

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
    phase: getProgressPhaseAtIndex(event, phaseIndex, now),
    publishedResultsClasses,
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

export function getEventTitle(event: DogEvent, t: TFunction<'translation'>, now = new Date()): string {
  if (isConfirmedEvent(event)) {
    return t(`event.states.${getEventProgressPhase(event, now)}`)
  }

  return t(`event.states.${event.state || 'draft'}`)
}

export const getEventStateForClass = (
  event: Pick<JsonDogEvent, 'state'> & {
    classes?: Array<Pick<JsonDogEvent['classes'][number], 'class' | 'state'>>
  },
  eventClass?: string
) => event.classes?.find((item) => item.class === eventClass)?.state ?? event.state

/**
 * An absent flag counts as published only for an event the workflow actually carried to 'invited' —
 * those records predate the flag. An event that reaches the gate on its dates alone must have been
 * published on purpose, or confirming an event and waiting for its date to pass would put its start
 * list on the web by itself.
 */
export const isStartListAvailableForClass = (
  event: Pick<JsonDogEvent, 'state' | 'startListPublished'> & EventVitals,
  eventClass: Pick<JsonDogEvent['classes'][number], 'class' | 'state'>
) => {
  if (canPublishStartList(eventClass.state ?? event.state)) return isStartListPublishedForClass(event, eventClass.class)

  // A class carrying its own state below 'invited' says this day is not ready, and the calendar must
  // not overrule it: that is how one day of a class stays hidden while another is public, since the
  // published flag is per class name and cannot tell the days apart. Only a class with no state of its
  // own falls through to what the event's dates say.
  if (eventClass.state !== undefined) return false
  if (!canPublishStartList(event.state, event)) return false

  return isStartListPublishedClassMap(event.startListPublished)
    ? event.startListPublished[eventClass.class as RegistrationClass] === true
    : event.startListPublished === true
}

type AvailabilityEvent = {
  classes?: Array<Pick<JsonDogEvent['classes'][number], 'class' | 'state'> & { date?: Date | string }>
  startDate: Date | string
}
type AvailabilityRegistration = { class?: string | null; group: { date?: Date | string } }

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

  const registrationDate = startListAvailabilityDateKey(registration.group.date ?? event.startDate)
  const eventClasses = classes.filter((eventClass) => eventClass.class === registration.class)
  const onTheDay = eventClasses.find(
    (item) => startListAvailabilityDateKey(item.date ?? event.startDate) === registrationDate
  )

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

/**
 * Start numbers ride the start list but publish separately (KOE-1006). An absent flag means
 * published — every event before the flag put its numbers out with the list, and a deploy must not
 * pull them — so only an explicit `false` withholds. Note the inverted default against the start
 * list's own class map, where an absent class means unpublished.
 */
const isStartNumbersPublishedForClass = (
  { startNumbersPublished }: Pick<JsonDogEvent, 'startNumbersPublished'>,
  eventClass?: string
) =>
  isStartListPublishedClassMap(startNumbersPublished)
    ? startNumbersPublished[eventClass as RegistrationClass] !== false
    : startNumbersPublished !== false

type StartNumbersEvent = Pick<JsonDogEvent, 'state' | 'startListPublished' | 'startNumbersPublished'>

/** Numbers can only be public on a published list: the list is the numbers' only transport. */
export const isStartNumbersAvailableForClass = (
  event: StartNumbersEvent & EventVitals,
  eventClass: Pick<JsonDogEvent['classes'][number], 'class' | 'state'>
) => isStartListAvailableForClass(event, eventClass) && isStartNumbersPublishedForClass(event, eventClass.class)

export const isStartNumbersAvailable = (
  event: StartNumbersEvent &
    EventVitals & {
      classes?: Array<Pick<JsonDogEvent['classes'][number], 'class' | 'state'>>
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
  if (!registration.class || classes.length === 0) return isStartNumbersPublishedForClass(event)

  const eventClass = findRegistrationClass(event, registration)

  return eventClass ? isStartNumbersPublishedForClass(event, eventClass.class) : false
}

export const getStartNumbersPublishedClassMap = ({
  classes,
  startNumbersPublished,
}: Pick<JsonDogEvent, 'startNumbersPublished'> & {
  classes: Array<Pick<JsonDogEvent['classes'][number], 'class'>>
}): Partial<Record<RegistrationClass, boolean>> => {
  const existingMap = isStartListPublishedClassMap(startNumbersPublished) ? startNumbersPublished : {}
  // The absent-means-published default (above) carries into the expanded map.
  const defaultPublished = isStartListPublishedClassMap(startNumbersPublished) ? true : startNumbersPublished !== false
  const result: Partial<Record<RegistrationClass, boolean>> = {}

  for (const eventClass of classes) {
    result[eventClass.class] = existingMap[eventClass.class] ?? defaultPublished
  }

  return result
}

/**
 * Whether this dog's result may be shown.
 *
 * Gated on its own class and nothing else: a start list can be public long before any result is, so an
 * unpublished result must not ride out on the back of a published list.
 */
export const isResultsAvailableForRegistration = (
  event: Pick<JsonDogEvent, 'state' | 'resultsPublished'> & AvailabilityEvent,
  registration: AvailabilityRegistration
) => {
  const eventClass = findRegistrationClass(event, registration)

  return eventClass ? isResultsAvailableForClass(event, eventClass) : false
}

const startListAvailabilityDateKey = (date: Date | string) => formatDate(date, 'yyyy-MM-dd')

export const isStartListPublishedForClass = (event: Pick<JsonDogEvent, 'startListPublished'>, eventClass: string) =>
  isStartListPublishedClassMap(event.startListPublished)
    ? event.startListPublished[eventClass as RegistrationClass] === true
    : event.startListPublished !== false

export const isStartListPublishedClassMap = (
  startListPublished: JsonDogEvent['startListPublished']
): startListPublished is Partial<Record<RegistrationClass, boolean>> =>
  typeof startListPublished === 'object' && startListPublished !== null

export const getStartListPublishedClassMap = ({
  classes,
  startListPublished,
}: Pick<JsonDogEvent, 'startListPublished'> & {
  classes: Array<Pick<JsonDogEvent['classes'][number], 'class'>>
}): Partial<Record<RegistrationClass, boolean>> => {
  const existingMap = isStartListPublishedClassMap(startListPublished) ? startListPublished : {}
  const defaultPublished = isStartListPublishedClassMap(startListPublished) ? false : startListPublished !== false
  const result: Partial<Record<RegistrationClass, boolean>> = {}

  for (const eventClass of classes) {
    result[eventClass.class] = existingMap[eventClass.class] ?? defaultPublished
  }

  return result
}

export const isEventDeletable = ({ state }: Partial<Pick<JsonDogEvent, 'state'>> | undefined = {}) =>
  state === 'draft' || state === 'tentative' || state === 'cancelled'

export const getEventSeason = (startDate?: Date | string): string => {
  const date = typeof startDate === 'string' ? parseISO(startDate) : startDate

  if (!date || !isValid(date)) {
    return ''
  }

  return eventSeasonFormatter.format(date)
}

export const isDetaultEntryStartDate = (date: Date | undefined, eventStartDate: Date) =>
  !date || isSameDay(defaultEntryStartDate(eventStartDate), date)
export const isDetaultEntryEndDate = (date: Date | undefined, eventStartDate: Date) =>
  !date || isSameDay(defaultEntryEndDate(eventStartDate), date)

export const getEventDays = ({ startDate, endDate }: Pick<DogEvent, 'startDate' | 'endDate'>) =>
  eachDayOfInterval(
    {
      end: endDate,
      start: startDate,
    },
    { in: tz(TIME_ZONE) }
  )

export const getUniqueEventClasses = ({ classes }: Pick<DogEvent, 'classes'>) =>
  unique(classes?.map((c) => c?.class) ?? []).filter(Boolean)

export const applySingleDayNowtGroups = <T extends object>(
  eventType: string | undefined,
  startDate: Date,
  endDate: Date,
  classes: readonly T[]
): T[] =>
  eventType === 'NOWT' && isSameDay(startDate, endDate)
    ? classes.map((eventClass) => ({ ...eventClass, groups: ['kp'] }))
    : [...classes]

export const getEventClassesByDays = (event: Pick<DogEvent, 'startDate' | 'endDate' | 'classes'>) =>
  getEventDays(event).map((day) => ({
    classes: event.classes?.filter((c) => isSameDay(c.date ?? event.startDate, day)) ?? [],
    day,
  }))

// IMPORTANT: Use event timezone (Europe/Helsinki) when generating date keys.
// Using `Date.toISOString().slice(0, 10)` would key by *UTC day*, which can differ
// from the event day for users in other timezones and would make DnD/group matching fail.
export const eventRegistrationDateKey = (rd: RegistrationDate) => `${zonedDateString(rd.date)}-${rd.time}`

export function sanitizeDogEvent(event: JsonDogEvent): SanitizedJsonPublicDogEvent
export function sanitizeDogEvent(event: ConfirmedEvent): SanitizedPublicConfirmedDogEvent
export function sanitizeDogEvent(event: DogEvent): SanitizedPublicDogEvent
export function sanitizeDogEvent(event: Patch<JsonDogEvent>): Patch<SanitizedJsonPublicDogEvent>
export function sanitizeDogEvent(
  event: DogEvent | JsonDogEvent | Patch<JsonDogEvent>
): SanitizedPublicDogEvent | SanitizedJsonPublicDogEvent | Patch<SanitizedJsonPublicDogEvent> {
  const {
    createdBy: _createdBy,
    deletedAt: _deletedAt,
    deletedBy: _deletedBy,
    headquarters: _headquarters,
    kcId: _kcId,
    kcEvent: _kcEvent,
    invitationAttachment: _invitationAttachment,
    invitationAttachmentHistory: _invitationAttachmentHistory,
    invitationAttachments: _invitationAttachments,
    modifiedBy: _modifiedBy,
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

const groupDates = (dates: RegistrationDate[]): Record<number, RegistrationTime[]> =>
  dates.reduce(
    (acc, cur) => {
      if (!cur.time) return acc

      const dateValue = cur.date.valueOf()
      if (!acc[dateValue]) acc[dateValue] = []
      const group = acc[dateValue]
      group.push(cur.time)
      return acc
    },
    {} as Record<number, RegistrationTime[]>
  )

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

  for (const [dateString, newTimes] of Object.entries(newByDate)) {
    const dateValue = +dateString
    const nc = newClasses.find((c) => c.class === eventClass && c.date.valueOf() === dateValue)
    if (!nc) continue
    const oc = classes.find((c) => c.class === eventClass && c.date.valueOf() === dateValue)
    nc.groups = resolveTimes(newTimes, oc?.groups)
  }

  // for dates that do not have any times selected, use defaults or 'kp' if last removed value vas something else than 'kp'
  for (const nc of newClasses) {
    if (!nc.groups.length) {
      if (
        classes
          .find((c) => c.class === nc.class && c.date.valueOf() === nc.date.valueOf())
          ?.groups?.filter((t) => t !== 'kp').length
      )
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
  const dateValues = getEventDays({ endDate, startDate }).map((date) => date.valueOf())
  const oldByDate = groupDates(dates ?? [])
  const newByDate = groupDates(newDates)
  const finalDates: RegistrationDate[] = []

  for (const [dateString, newTimes] of Object.entries(newByDate)) {
    const dateValue = +dateString
    if (!dateValues.includes(dateValue)) continue
    const date = new Date(dateValue)
    const oldTimes = oldByDate[dateValue]

    resolveTimes(newTimes, oldTimes).forEach((time) => {
      finalDates.push({ date, time })
    })
  }
  // for dates that do not have any times selected, use defaults or 'kp' if last removed value vas something else than 'kp'
  for (const dateValue of dateValues) {
    if (!newByDate[dateValue]?.length) {
      const date = new Date(dateValue)
      if (oldByDate[dateValue]?.filter((t) => t !== 'kp').length) finalDates.push({ date, time: 'kp' })
      else
        defaultGroups.forEach((time) => {
          finalDates.push({ date, time })
        })
    }
  }

  finalDates.sort((a, b) =>
    a.date.valueOf() === b.date.valueOf()
      ? (a.time?.localeCompare(b.time ?? '') ?? 0)
      : a.date.valueOf() - b.date.valueOf()
  )

  return { classes: [], dates: finalDates }
}

export const copyDogEvent = (event: DogEvent): DogEvent => {
  const copy = structuredClone(event)
  const origStartDate = event.startDate
  const days = differenceInDays(copy.endDate, copy.startDate)

  copy.id = ''
  copy.name = `Kopio - ${copy.name ?? ''}`
  copy.state = 'draft'
  copy.entries = copy.members = 0

  copy.classes.forEach((c) => {
    c.entries = c.members = 0
    if (c.date) {
      c.date = addDays(newEventStartDate, differenceInDays(c.date, origStartDate))
    }
    delete c.state
  })

  copy.dates?.forEach((d) => {
    d.date = addDays(newEventStartDate, differenceInDays(d.date, origStartDate))
  })

  // Copy and adjust placesPerDay if it exists
  if (event.placesPerDay) {
    copy.placesPerDay = {}
    const dayDiff = differenceInDays(newEventStartDate, origStartDate)

    Object.entries(event.placesPerDay).forEach(([dateStr, places]) => {
      const originalDate = new Date(dateStr)
      const newDate = addDays(originalDate, dayDiff)
      const newDateStr = formatDate(newDate, 'yyyy-MM-dd')
      // biome-ignore lint/style/noNonNullAssertion: its set couple of lines above
      copy.placesPerDay![newDateStr] = places
    })
  }

  copy.startDate = newEventStartDate
  copy.endDate = addDays(newEventStartDate, days)
  copy.entryStartDate = newEventEntryStartDate
  copy.entryEndDate = newEventEntryEndDate
  copy.season = String(newEventStartDate.getFullYear())
  // Publish decisions belong to the source event's runs, not the copy — and for numbers and results
  // an inherited flag would skip the whole decision, since absent means published for a start list
  // that predates the flag and a copied `resultsPublished` would advertise results that do not exist.
  copy.startListPublished = false
  copy.startNumbersPublished = false
  delete copy.resultsPublished

  delete copy.kcId
  delete copy.entryOrigEndDate
  delete copy.invitationAttachment

  return copy
}
