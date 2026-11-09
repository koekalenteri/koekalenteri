import type { ConfirmedEvent, EventState, Registration } from '../types'
import { useMemo } from 'react'
import {
  compareRegistrationClasses,
  eventDates,
  formatTypeOf,
  getEventStateForClass,
  placesForClass,
  UNLOADED_EVENT,
  uniqueClasses,
} from '../lib/event'
import {
  GROUP_KEY_RESERVE,
  getRegistrationClass,
  getRegistrationGroupKey,
  groupParticipantsByClass,
  isStarter,
} from '../lib/registration'
import { unique } from '../lib/utils'

interface EventClassInfoNumbers {
  places: number
  participants: number
  reserve: number
  cancelled: number
  value: number
  invalid: boolean
}

export default function useAdminEventRegistrationInfo(
  event: ConfirmedEvent | undefined | null,
  registrations: Registration[]
) {
  const dates = useMemo(() => eventDates(event), [event])
  const formatOwner = event ?? UNLOADED_EVENT

  const registrationClasses = unique(
    registrations.map((registration) => getRegistrationClass(registration, formatOwner))
  )

  const reserveByClass: Record<string, Registration[]> = useMemo(() => {
    const byClass: Record<string, Registration[]> = {}
    const allReserve = registrations.filter((r) => getRegistrationGroupKey(r) === GROUP_KEY_RESERVE)
    for (const reg of allReserve) {
      const c = getRegistrationClass(reg, formatOwner)
      if (!(c in byClass)) {
        byClass[c] = []
      }
      byClass[c].push(reg)
    }
    return byClass
  }, [formatOwner, registrations])

  const eventClasses = useMemo(() => {
    const classes = uniqueClasses(event)
    if (event && !classes.length) {
      return [formatTypeOf(event)]
    }
    return classes
  }, [event])

  // Entries in classes the event no longer runs: their own tabs, after the event's.
  const missingClasses = useMemo(
    () => registrationClasses.filter((c) => !eventClasses.includes(c)).sort(compareRegistrationClasses),
    [eventClasses, registrationClasses]
  )

  const numbersByClass = useMemo(() => {
    const result: { [key: string]: EventClassInfoNumbers } = {}
    for (const c of eventClasses) {
      const places = placesForClass(event, c)
      const classRegs = registrations.filter((r) => getRegistrationClass(r, formatOwner) === c)
      const regs = classRegs.filter(isStarter).length
      const reserve = classRegs.filter((r) => !r.cancelled && !isStarter(r)).length
      const cancelled = classRegs.filter((r) => r.cancelled).length
      result[c] = {
        cancelled,
        invalid: places > 0 && regs > places,
        participants: regs,
        places,
        reserve,
        value: places ? Math.round(100 * (regs / places)) : 0,
      }
    }
    return result
  }, [registrations, event, eventClasses, formatOwner])

  const selectedByClass = useMemo(
    () => groupParticipantsByClass(registrations, formatOwner),
    [formatOwner, registrations]
  )

  const stateByClass = useMemo(() => {
    if (!event) {
      return {}
    }
    const byClass: Record<string, EventState> = { [formatTypeOf(event)]: event.state }
    for (const c of event.classes) {
      byClass[c.class] = getEventStateForClass(event, c.class)
    }
    return byClass
  }, [event])

  return { dates, eventClasses, missingClasses, numbersByClass, reserveByClass, selectedByClass, stateByClass }
}
