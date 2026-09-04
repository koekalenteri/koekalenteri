import type { Registration } from '../../../types'
import type { StartDay } from './StartDaySelector'
import { useMemo, useState } from 'react'
import { compareRegistrationClasses, getRegistrationClass } from '../../../lib/registration'
import { startDayKey, startDaysOf } from './StartDaySelector'

/**
 * The day-then-class navigation the batch entry screens share. A multi-day trial is worked one day
 * at a time, the same way its numbers are drawn, so the day is picked first and holds while the
 * classes are worked through (KOE-1350, KOE-1353). The days are the event's own, not one class's.
 */
export const useStartDayClasses = (registrations: Registration[]) => {
  const [selectedClass, setSelectedClass] = useState<string | undefined>()
  const [selectedDay, setSelectedDay] = useState<string | undefined>()

  const days = useMemo<StartDay[]>(() => startDaysOf(registrations), [registrations])
  const day = days.find((item) => item.key === selectedDay)?.key ?? days[0]?.key

  const dayRegistrations = useMemo(
    () => registrations.filter((reg) => days.length < 2 || startDayKey(reg) === day),
    [day, days.length, registrations]
  )

  // Only the classes that run on the chosen day: a tab leading to an empty sheet is a dead end.
  const classes = useMemo(
    () => [...new Set(dayRegistrations.map(getRegistrationClass))].sort(compareRegistrationClasses),
    [dayRegistrations]
  )
  // A class chosen on one day may not run on the next; fall back rather than show an empty list.
  const eventClass = classes.find((item) => item === selectedClass) ?? classes[0]

  return { classes, day, dayRegistrations, days, eventClass, setSelectedClass, setSelectedDay }
}
