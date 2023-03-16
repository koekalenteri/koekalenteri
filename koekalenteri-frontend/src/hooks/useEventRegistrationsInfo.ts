import { useMemo } from 'react'
import { Event, Registration } from 'koekalenteri-shared/model'

import { classPlaces, eventDates, uniqueClasses } from '../utils'

interface EventClassInfoNumbers {
  places: number
  participants: number
  reserve: number
  cancelled: number
  value: number
  invalid: boolean
}

export default function useEventRegistrationInfo(event: Event | undefined, registrations: Registration[]) {
  const dates = useMemo(() => eventDates(event), [event])

  const reserveByClass: Record<string, Registration[]> = useMemo(() => {
    const byClass: Record<string, Registration[]> = {}
    const allReserve = registrations.filter((r) => !r.cancelled && (!r.group || r.group.key === 'reserve'))
    for (const reg of allReserve) {
      const c = reg.class ?? reg.eventType
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

  const numbersByClass = useMemo(() => {
    const result: { [key: string]: EventClassInfoNumbers } = {}
    for (const c of eventClasses) {
      const places = classPlaces(event, c) || event?.places || 0
      const classRegs = registrations.filter((r) => (r.class ?? r.eventType) === c)
      const regs = classRegs.filter((r) => r.group && !r.cancelled && r.group.key !== 'reserve').length
      const reserve = classRegs.filter((r) => !r.cancelled && (!r.group || r.group.key === 'reserve')).length
      const cancelled = classRegs.filter((r) => r.cancelled).length
      result[c] = {
        places,
        participants: regs,
        reserve,
        cancelled,
        value: places ? Math.round(100 * (regs / places)) : 0,
        invalid: places > 0 && regs > places,
      }
    }
    return result
  }, [registrations, event, eventClasses])

  const selectedByClass = useMemo(() => {
    const byClass: Record<string, Registration[]> = {}
    const allSelected = registrations.filter(
      (r) => !r.cancelled && r.group && r.group.key !== 'reserve' && r.group.key !== 'cancelled'
    )
    for (const reg of allSelected) {
      const c = reg.class ?? reg.eventType
      if (!(c in byClass)) {
        byClass[c] = []
      }
      byClass[c].push(reg)
    }
    return byClass
  }, [registrations])

  return { dates, eventClasses, reserveByClass, numbersByClass, selectedByClass }
}
