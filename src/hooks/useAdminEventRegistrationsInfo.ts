import type { ConfirmedEvent, EventState, Registration } from '../types'
import { useMemo } from 'react'
import { getEventStateForClass } from '../lib/event'
import {
  GROUP_KEY_CANCELLED,
  GROUP_KEY_RESERVE,
  getRegistrationClass,
  getRegistrationGroupKey,
} from '../lib/registration'
import { eventDates, placesForClass, unique, uniqueClasses } from '../lib/utils'

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

  const registrationClasses = unique(registrations.map((registration) => getRegistrationClass(registration)))

  const reserveByClass: Record<string, Registration[]> = useMemo(() => {
    const byClass: Record<string, Registration[]> = {}
    const allReserve = registrations.filter((r) => getRegistrationGroupKey(r) === GROUP_KEY_RESERVE)
    for (const reg of allReserve) {
      const c = getRegistrationClass(reg)
      if (!(c in byClass)) {
        byClass[c] = []
      }
      byClass[c].push(reg)
    }
    return byClass
  }, [registrations])

  const eventClasses = useMemo(() => {
    const classes = uniqueClasses(event)
    if (event && !classes.length) {
      return [event.eventType]
    }
    return classes
  }, [event])

  const missingClasses = useMemo(
    () => registrationClasses.filter((c) => !eventClasses.includes(c)),
    [eventClasses, registrationClasses]
  )

  const numbersByClass = useMemo(() => {
    const result: { [key: string]: EventClassInfoNumbers } = {}
    for (const c of eventClasses) {
      const places = placesForClass(event, c)
      const classRegs = registrations.filter((r) => getRegistrationClass(r) === c)
      const regs = classRegs.filter((r) => r.group && !r.cancelled && r.group.key !== GROUP_KEY_RESERVE).length
      const reserve = classRegs.filter((r) => !r.cancelled && (!r.group || r.group.key === GROUP_KEY_RESERVE)).length
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
  }, [registrations, event, eventClasses])

  const selectedByClass = useMemo(() => {
    const byClass: Record<string, Registration[]> = {}
    const allSelected = registrations.filter(
      (r) => !r.cancelled && r.group && r.group.key !== GROUP_KEY_RESERVE && r.group.key !== GROUP_KEY_CANCELLED
    )
    for (const reg of allSelected) {
      const c = getRegistrationClass(reg)
      if (!(c in byClass)) {
        byClass[c] = []
      }
      byClass[c].push(reg)
    }
    return byClass
  }, [registrations])

  const stateByClass = useMemo(() => {
    if (!event) {
      return {}
    }
    const byClass: Record<string, EventState> = { [event.eventType]: event.state }
    for (const c of event.classes) {
      byClass[c.class] = getEventStateForClass(event, c.class)
    }
    return byClass
  }, [event])

  return { dates, eventClasses, missingClasses, numbersByClass, reserveByClass, selectedByClass, stateByClass }
}
