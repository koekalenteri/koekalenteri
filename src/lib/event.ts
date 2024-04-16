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

import { eachDayOfInterval, isSameDay } from 'date-fns'

import { unique } from './utils'

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
    groups: c.class === eventClass ? [] : c.groups ?? defaultGroups,
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
      ? a.time?.localeCompare(b.time ?? '') ?? 0
      : a.date.valueOf() - b.date.valueOf()
  )

  return { classes: [], dates: finalDates }
}
