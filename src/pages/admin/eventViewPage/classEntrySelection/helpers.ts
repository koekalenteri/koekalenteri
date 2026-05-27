import type { CustomCost, DogEvent, Registration, RegistrationGroup, RegistrationGroupInfo } from '../../../../types'
import type { RegistrationWithGroups } from './types'
import { isSameDay } from 'date-fns'
import { eventRegistrationDateKey } from '../../../../lib/event'
import {
  GROUP_KEY_CANCELLED,
  GROUP_KEY_RESERVE,
  getRegistrationGroupKey,
  isParticipantGroup,
} from '../../../../lib/registration'
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
  // Primary: honor explicit group.key if it matches an existing visual group.
  if (eventGroups.some((eg) => eg.key === key)) return key

  // Fallback: some backends may persist a different `group.key` format than what UI derives
  // via `eventRegistrationDateKey()` (timezone differences, legacy data etc.).
  // If we have date+time on the group, derive the UI key and try that.
  const derivedKey =
    reg.group?.date && reg.group?.time
      ? eventRegistrationDateKey({ date: reg.group.date, time: reg.group.time })
      : undefined
  if (derivedKey && eventGroups.some((eg) => eg.key === derivedKey)) {
    return derivedKey
  }
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

const getAllowedParticipantGroups = (registration: Registration, groups: RegistrationGroup[]) => {
  const allowedGroupKeys = new Set(registration.dates?.map((date) => eventRegistrationDateKey(date)) ?? [])

  if (!allowedGroupKeys.size) return groups

  return groups.filter(
    (group) => group.date && allowedGroupKeys.has(eventRegistrationDateKey({ ...group, date: group.date }))
  )
}

export const buildMoveToPositionOptions = (
  selectedForAction: Registration | undefined,
  groups: RegistrationGroup[],
  registrationsByGroup: Record<string, RegistrationWithGroups[]>
): number[] => {
  if (!selectedForAction) return [1]

  const currentGroupKey = getRegistrationGroupKey(selectedForAction)
  const allowedParticipantGroups = getAllowedParticipantGroups(selectedForAction, groups)
  const positions = allowedParticipantGroups.flatMap((group) =>
    (registrationsByGroup[group.key] ?? [])
      .map((reg) => reg.group?.number)
      .filter((number): number is number => Number.isInteger(number))
  )

  if (currentGroupKey === GROUP_KEY_RESERVE) {
    const participantPositions = [...new Set(positions)].sort((a, b) => a - b)
    const lastPosition = participantPositions.at(-1) ?? 0

    return [...participantPositions, lastPosition + 1]
  }

  return [...new Set(positions)]
    .filter((position) => position !== selectedForAction.group?.number)
    .sort((a, b) => a - b)
}

export const findMoveToPositionTargetGroup = (
  selectedForAction: Registration,
  position: number,
  groups: RegistrationGroup[],
  registrationsByGroup: Record<string, RegistrationWithGroups[]>
): RegistrationGroup | undefined => {
  const allowedParticipantGroups = getAllowedParticipantGroups(selectedForAction, groups)
  const currentGroupKey = getRegistrationGroupKey(selectedForAction)
  const currentPosition = selectedForAction.group?.number
  const anchorPositions =
    isParticipantGroup(currentGroupKey) && typeof currentPosition === 'number'
      ? currentPosition < position
        ? [Math.floor(position)]
        : [Math.ceil(position)]
      : [Math.ceil(position), Math.floor(position)]

  for (const anchorPosition of [...new Set(anchorPositions)].filter((number) => number > 0)) {
    const targetGroup = allowedParticipantGroups.find((group) => {
      const registrations = registrationsByGroup[group.key] ?? []
      return registrations.some((registration) => registration.group?.number === anchorPosition)
    })
    if (targetGroup) return targetGroup
  }

  return undefined
}

export const buildMoveToPositionGroupChange = (
  selectedForAction: Registration,
  position: number,
  eventId: string,
  groups: RegistrationGroup[],
  registrationsByGroup: Record<string, RegistrationWithGroups[]>
): RegistrationGroupInfo | undefined => {
  const currentGroupKey = getRegistrationGroupKey(selectedForAction)

  if (currentGroupKey === GROUP_KEY_RESERVE || isParticipantGroup(currentGroupKey)) {
    const targetGroup = findMoveToPositionTargetGroup(selectedForAction, position, groups, registrationsByGroup)
    if (!targetGroup) return undefined

    return {
      cancelled: false,
      eventId,
      group: {
        date: targetGroup.date,
        key: targetGroup.key,
        number: position,
        time: targetGroup.time,
      },
      id: selectedForAction.id,
    }
  }

  const currentGroup = selectedForAction.group
  if (!currentGroup) return undefined

  return {
    cancelled: false,
    eventId,
    group: {
      ...currentGroup,
      number: position,
    },
    id: selectedForAction.id,
  }
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
