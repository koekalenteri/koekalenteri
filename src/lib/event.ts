import type {
  ConfirmedEvent,
  DogEvent,
  JsonDogEvent,
  RegistrationClass,
  RegistrationDate,
  RegistrationTime,
  SanitizedJsonPublicDogEvent,
  SanitizedPublicConfirmedDogEvent,
  SanitizedPublicDogEvent,
} from '../types'

import { addDays, differenceInDays, eachDayOfInterval, isSameDay, nextSaturday, sub } from 'date-fns'

import { zonedStartOfDay } from '../i18n/dates'

import { unique } from './utils'

const EntryStartWeeks = 6
const EntryEndWeeks = 3

export const defaultEntryStartDate = (eventStartDate: Date) => sub(eventStartDate, { weeks: EntryStartWeeks })
export const defaultEntryEndDate = (eventStartDate: Date) => sub(eventStartDate, { weeks: EntryEndWeeks })

export const newEventStartDate = zonedStartOfDay(nextSaturday(addDays(Date.now(), 90)))
export const newEventEntryStartDate = defaultEntryStartDate(newEventStartDate)
export const newEventEntryEndDate = defaultEntryEndDate(newEventStartDate)

export const isStartListAvailable = ({
  state,
  startListPublished,
}: Pick<JsonDogEvent, 'state' | 'startListPublished'>) =>
  (state === 'invited' || state === 'started' || state === 'ended' || state === 'completed') &&
  startListPublished !== false

export const isDetaultEntryStartDate = (date: Date | undefined, eventStartDate: Date) =>
  !date || isSameDay(defaultEntryStartDate(eventStartDate), date)
export const isDetaultEntryEndDate = (date: Date | undefined, eventStartDate: Date) =>
  !date || isSameDay(defaultEntryEndDate(eventStartDate), date)

export const getEventDays = ({ startDate, endDate }: Pick<DogEvent, 'startDate' | 'endDate'>) =>
  eachDayOfInterval({
    start: startDate,
    end: endDate,
  })

export const getUniqueEventClasses = ({ classes }: Pick<DogEvent, 'classes'>) =>
  unique(classes?.map((c) => c?.class) ?? []).filter(Boolean)

export const getEventClassesByDays = (event: Pick<DogEvent, 'startDate' | 'endDate' | 'classes'>) =>
  getEventDays(event).map((day) => ({
    day,
    classes: event.classes?.filter((c) => isSameDay(c.date ?? event.startDate, day)) ?? [],
  }))

export const eventRegistrationDateKey = (rd: RegistrationDate) => rd.date.toISOString().slice(0, 10) + '-' + rd.time

export function sanitizeDogEvent(event: JsonDogEvent): SanitizedJsonPublicDogEvent
export function sanitizeDogEvent(event: ConfirmedEvent): SanitizedPublicConfirmedDogEvent
export function sanitizeDogEvent(event: DogEvent): SanitizedPublicDogEvent
export function sanitizeDogEvent(
  event: DogEvent | JsonDogEvent
): SanitizedPublicDogEvent | SanitizedJsonPublicDogEvent {
  const {
    createdBy,
    deletedAt,
    deletedBy,
    headquarters,
    kcId,
    invitationAttachment,
    modifiedBy,
    secretary,
    official,
    ...publicFields
  } = event

  return publicFields
}

const groupDates = (dates: RegistrationDate[]): Record<number, RegistrationTime[]> =>
  dates.reduce(
    (acc, cur) => {
      if (!cur.time) return acc

      const dateValue = cur.date.valueOf()
      const group = acc[dateValue] || (acc[dateValue] = [])
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
  const dateValues = getEventDays({ startDate, endDate }).map((date) => date.valueOf())
  const oldByDate = groupDates(dates ?? [])
  const newByDate = groupDates(newDates)
  const finalDates: RegistrationDate[] = []

  for (const [dateString, newTimes] of Object.entries(newByDate)) {
    const dateValue = +dateString
    if (!dateValues.includes(dateValue)) continue
    const date = new Date(dateValue)
    const oldTimes = oldByDate[dateValue]

    resolveTimes(newTimes, oldTimes).forEach((time) => finalDates.push({ date, time }))
  }
  // for dates that do not have any times selected, use defaults or 'kp' if last removed value vas something else than 'kp'
  for (const dateValue of dateValues) {
    if (!newByDate[dateValue]?.length) {
      const date = new Date(dateValue)
      if (oldByDate[dateValue]?.filter((t) => t !== 'kp').length) finalDates.push({ date, time: 'kp' })
      else defaultGroups.forEach((time) => finalDates.push({ date, time }))
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
  copy.name = 'Kopio - ' + (copy.name ?? '')
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

  copy.startDate = newEventStartDate
  copy.endDate = addDays(newEventStartDate, days)
  copy.entryStartDate = newEventEntryStartDate
  copy.entryEndDate = newEventEntryEndDate

  delete copy.kcId
  delete copy.entryOrigEndDate
  delete copy.invitationAttachment

  return copy
}
