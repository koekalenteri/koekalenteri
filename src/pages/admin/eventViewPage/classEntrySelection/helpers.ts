import type { CustomCost, DogEvent, Registration, RegistrationGroup } from '../../../../types'
import type { RegistrationWithGroups } from './types'
import { isSameDay } from 'date-fns'
import { eventRegistrationDateKey } from '../../../../lib/event'
import { GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE, getRegistrationGroupKey } from '../../../../lib/registration'
import { uniqueDate } from '../../../../lib/utils'

/**
 * Decide which visual list a registration belongs to.
 * - Cancelled always to cancelled
 * - Existing event group keys honored
 * - Otherwise reserve
 */
export const listKey = (reg: Registration, eventGroups: RegistrationGroup[]) => {
  const key = getRegistrationGroupKey(reg)
  if (key === GROUP_KEY_CANCELLED) return GROUP_KEY_CANCELLED
  if (eventGroups.some((eg) => eg.key === key)) return key
  return GROUP_KEY_RESERVE
}

/** Derive grouped, augmented registrations for grids */
export const buildRegistrationsByGroup = (
  registrations: Registration[],
  groups: RegistrationGroup[]
): Record<string, RegistrationWithGroups[]> => {
  const byGroup: Record<string, RegistrationWithGroups[]> = { cancelled: [], reserve: [] }
  for (const reg of registrations) {
    const key = listKey(reg, groups)
    const regDates = uniqueDate(reg.dates.map((rd) => rd.date)) ?? []

    byGroup[key] = byGroup[key] ?? []
    byGroup[key].push({
      ...reg,
      dropGroups: groups.filter((g) => regDates.some((d) => !g.date || isSameDay(g.date, d))).map((g) => g.key),
      groups: reg.dates.map((rd) => eventRegistrationDateKey(rd)),
    })
  }
  for (const regs of Object.values(byGroup)) {
    regs.sort((a, b) => (a.group?.number || 999) - (b.group?.number || 999))
  }
  return byGroup
}

/** Per-group selected optional costs tally */
export const buildSelectedAdditionalCostsByGroup = (
  event: DogEvent,
  groups: RegistrationGroup[],
  registrationsByGroup: Record<string, RegistrationWithGroups[]>
): Record<string, Array<{ cost: CustomCost; count: number }>> => {
  if (typeof event.cost === 'number') return {}
  const costs = event.cost.optionalAdditionalCosts
  if (!costs) return {}

  const result: Record<string, Array<{ cost: CustomCost; count: number }>> = {}
  groups.forEach((g) => {
    result[g.key] = []
    const regs = registrationsByGroup[g.key] ?? []
    costs.forEach((cost, i) => {
      const count = regs.reduce((acc, r) => acc + (r.optionalCosts?.includes(i) ? 1 : 0), 0)
      if (count > 0) result[g.key].push({ cost, count })
    })
  })
  return result
}

/** Human-readable total optional costs label across all groups */
export const buildSelectedAdditionalCostsTotal = (
  groups: RegistrationGroup[],
  selectedByGroup: Record<string, Array<{ cost: CustomCost; count: number }>>
) => {
  const totals = new Map<CustomCost, number>()
  let count = 0
  groups.forEach((g) => {
    const selected = selectedByGroup[g.key] ?? []
    selected.forEach((sac) => {
      const acc = totals.get(sac.cost) ?? 0
      totals.set(sac.cost, acc + sac.count)
      count++
    })
  })
  if (count <= 1) return ''
  return Array.from(totals.entries())
    .map(([cost, count]) => `${cost.description.fi} x ${count}`)
    .join(', ')
}
