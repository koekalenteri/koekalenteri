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
import {
  addDays,
  differenceInDays,
  eachDayOfInterval,
  isSameDay,
  isValid,
  nextSaturday,
  parseISO,
  sub,
  subDays,
} from 'date-fns'
import { formatDate, TIME_ZONE, zonedDateString, zonedEndOfDay, zonedStartOfDay } from '../i18n/dates'
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

export const placesForClass = (
  event: DeepPartial<Pick<PublicDogEvent, 'places' | 'classes' | 'placesPerDay'>> | undefined | null,
  eventClass: string
) => {
  if (!event) return 0

  const classItems = (Array.isArray(event.classes) ? event.classes : []).filter((item) => item.class === eventClass)
  const classTotal = classItems.reduce((total, item) => total + (Number(item.places) || 0), 0)
  if (classTotal) return classTotal

  // No per-class places set (e.g. capacity is tracked per day instead) — fall back to the
  // day totals for the dates this class runs on, then to the event-wide total.
  const placesPerDay = event.placesPerDay
  const dayTotal = placesPerDay
    ? classItems.reduce((total, item) => {
        const dateStr = item.date ? formatDate(item.date, 'yyyy-MM-dd') : undefined
        return total + (dateStr ? Number(placesPerDay[dateStr]) || 0 : 0)
      }, 0)
    : 0

  return dayTotal || Number(event.places) || 0
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

const EntryStartWeeks = 6
const EntryEndWeeks = 3
const eventSeasonFormatter = new Intl.DateTimeFormat('en', { timeZone: TIME_ZONE, year: 'numeric' })

export const defaultEntryStartDate = (eventStartDate: Date) => sub(eventStartDate, { weeks: EntryStartWeeks })
export const defaultEntryEndDate = (eventStartDate: Date) => sub(eventStartDate, { weeks: EntryEndWeeks })

export const newEventStartDate = zonedStartOfDay(nextSaturday(addDays(Date.now(), 90)))
export const newEventEntryStartDate = defaultEntryStartDate(newEventStartDate)
export const newEventEntryEndDate = defaultEntryEndDate(newEventStartDate)

export const isStartListAvailable = ({
  classes,
  state,
  startListPublished,
}: Pick<JsonDogEvent, 'state' | 'startListPublished'> & {
  classes?: Array<Pick<JsonDogEvent['classes'][number], 'class' | 'state'>>
}) => {
  if (classes?.length) {
    return classes.some((eventClass) => isStartListAvailableForClass({ startListPublished, state }, eventClass))
  }

  if (!canPublishStartList(state)) return false
  if (isStartListPublishedClassMap(startListPublished)) {
    return Object.values(startListPublished).some(Boolean)
  }
  return startListPublished !== false
}

export const canPublishStartList = (state: JsonDogEvent['state'] | JsonDogEvent['classes'][number]['state']) =>
  state === 'invited' || state === 'started' || state === 'ended' || state === 'completed'

export type EventProgressStep =
  | Exclude<ConfirmedEventStates, 'completed'>
  | 'confirmed_entryOpen'
  | 'startListPublished'
type EventProgressPhase = EventProgressStep | 'confirmed_entryClosed'

export const EVENT_PROGRESS_PHASES: readonly EventProgressStep[] = [
  'confirmed',
  'confirmed_entryOpen',
  'picked',
  'invited',
  'startListPublished',
  'started',
  'ended',
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

const getTemporalPhaseIndex = (event: ConfirmedEvent, now: Date): number => {
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
  const phaseIndex = Math.max(
    statePhaseIndex,
    startListCompleted ? getProgressPhaseIndex('startListPublished') : -1,
    temporalPhaseIndex
  )
  const reachedPhaseIndex = Math.max(
    getStateProgressPhaseIndex(event.state, entryStarted),
    temporalPhaseIndex,
    ...classPhases.map(({ phaseIndex }) => phaseIndex)
  )

  let phase: EventProgressPhase = 'confirmed'
  if (phaseIndex >= getProgressPhaseIndex('ended')) phase = 'ended'
  else if (phaseIndex >= getProgressPhaseIndex('started')) phase = 'started'
  else if (phaseIndex >= getProgressPhaseIndex('startListPublished')) phase = 'startListPublished'
  else if (phaseIndex >= getProgressPhaseIndex('invited')) phase = 'invited'
  else if (phaseIndex >= getProgressPhaseIndex('picked')) phase = 'picked'
  else if (phaseIndex >= getProgressPhaseIndex('confirmed_entryOpen')) {
    phase = isEntryOpen(event, now) ? 'confirmed_entryOpen' : 'confirmed_entryClosed'
  }

  return {
    classPhases,
    entryStarted,
    eventClasses,
    phase,
    publishedStartListClasses,
    reachedPhaseIndex,
    startListActionable,
    startListClasses,
    startListCompleted,
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

export const isStartListAvailableForClass = (
  event: Pick<JsonDogEvent, 'state' | 'startListPublished'>,
  eventClass: Pick<JsonDogEvent['classes'][number], 'class' | 'state'>
) => canPublishStartList(eventClass.state ?? event.state) && isStartListPublishedForClass(event, eventClass.class)

export const isStartListAvailableForRegistration = (
  event: Pick<JsonDogEvent, 'state' | 'startListPublished'> & {
    classes?: Array<Pick<JsonDogEvent['classes'][number], 'class' | 'state'> & { date?: Date | string }>
    startDate: Date | string
  },
  registration: { class?: string | null; group: { date?: Date | string } }
) => {
  const classes = event.classes ?? []
  if (!registration.class || classes.length === 0) return classes.length === 0

  const registrationDate = startListAvailabilityDateKey(registration.group.date ?? event.startDate)
  const eventClasses = classes.filter((eventClass) => eventClass.class === registration.class)
  const eventClass = eventClasses.find(
    (item) => startListAvailabilityDateKey(item.date ?? event.startDate) === registrationDate
  )

  if (eventClass) return isStartListAvailableForClass(event, eventClass)
  if (eventClasses.length === 1) return isStartListAvailableForClass(event, eventClasses[0])
  return false
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
    invitationAttachment: _invitationAttachment,
    invitationAttachmentHistory: _invitationAttachmentHistory,
    invitationAttachments: _invitationAttachments,
    modifiedBy: _modifiedBy,
    registrationGroupsLock: _registrationGroupsLock,
    registrationPaymentsLock: _registrationPaymentsLock,
    secretary: _secretary,
    official: _official,
    ...publicFields
  } = event

  return publicFields
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
  copy.startListPublished = false

  delete copy.kcId
  delete copy.entryOrigEndDate
  delete copy.invitationAttachment

  return copy
}
