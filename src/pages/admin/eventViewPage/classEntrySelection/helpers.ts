import type { CustomCost, DogEvent, Registration, RegistrationGroup, RegistrationGroupMove } from '../../../../types'
import type { RegistrationWithGroups } from './types'
import { isSameDay } from 'date-fns'
import { eventRegistrationDateKey } from '../../../../lib/event'
import {
  GROUP_KEY_CANCELLED,
  GROUP_KEY_RESERVE,
  getHandlingPerson,
  getRegistrationGroupKey,
  isParticipantGroup,
} from '../../../../lib/registration'
import { uniqueDate } from '../../../../lib/utils'

interface NouGroupRuleIssues {
  duplicateHandlers: Array<{ count: number; email: string; name: string }>
  femaleCount: number
  genderBalance: boolean
  singleGender: boolean
  maleCount: number
}

const normalizeHandlerText = (value: string) => value.trim().toLocaleLowerCase()

/**
 * Check the rules that apply specifically to participant groups in a retriever
 * aptitude test. Empty configured groups are ignored until they have a dog.
 */
export const getNouGroupRuleIssues = (
  eventType: string,
  registrations: Registration[]
): NouGroupRuleIssues | undefined => {
  if (eventType !== 'NOU' || registrations.length === 0) return undefined

  const handlers = new Map<string, { count: number; email: string; name: string }>()
  let femaleCount = 0
  let maleCount = 0

  for (const registration of registrations) {
    if (registration.dog.gender === 'F') femaleCount++
    if (registration.dog.gender === 'M') maleCount++

    const handler = getHandlingPerson(registration)
    if (!handler?.email || !handler.name) continue

    const email = normalizeHandlerText(handler.email)
    const name = normalizeHandlerText(handler.name)
    if (!email || !name) continue

    // Same email alone isn't enough to call two entries the same handler: a shared inbox
    // (e.g. a kennel address) can be used by different people. Require both to match.
    const key = `${email}|${name}`

    const current = handlers.get(key)
    handlers.set(key, {
      count: (current?.count ?? 0) + 1,
      email: current?.email ?? handler.email.trim(),
      name: current?.name ?? handler.name,
    })
  }

  return {
    duplicateHandlers: [...handlers.values()].filter(({ count }) => count > 1),
    femaleCount,
    genderBalance: femaleCount > 0 && maleCount > 0 && (femaleCount < 2 || maleCount < 2),
    maleCount,
    singleGender: femaleCount === 0 || maleCount === 0,
  }
}

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
  let anchorPositions = [Math.ceil(position), Math.floor(position)]
  if (isParticipantGroup(currentGroupKey) && typeof currentPosition === 'number') {
    anchorPositions = currentPosition < position ? [Math.floor(position)] : [Math.ceil(position)]
  }

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
  groups: RegistrationGroup[],
  registrationsByGroup: Record<string, RegistrationWithGroups[]>
): RegistrationGroupMove | undefined => {
  const currentGroupKey = getRegistrationGroupKey(selectedForAction)

  if (currentGroupKey === GROUP_KEY_RESERVE || isParticipantGroup(currentGroupKey)) {
    const targetGroup = findMoveToPositionTargetGroup(selectedForAction, position, groups, registrationsByGroup)
    if (!targetGroup) return undefined
    const before = (registrationsByGroup[targetGroup.key] ?? []).find(
      (registration) =>
        registration.id !== selectedForAction.id && (registration.group?.number ?? Infinity) >= Math.ceil(position)
    )

    return {
      group: {
        date: targetGroup.date,
        key: targetGroup.key,
        time: targetGroup.time,
      },
      id: selectedForAction.id,
      ...(before ? { beforeId: before.id } : {}),
    }
  }

  const currentGroup = selectedForAction.group
  if (!currentGroup) return undefined
  const before = (registrationsByGroup[currentGroup.key] ?? []).find(
    (registration) =>
      registration.id !== selectedForAction.id && (registration.group?.number ?? Infinity) >= Math.ceil(position)
  )

  return {
    group: {
      date: currentGroup.date,
      key: currentGroup.key,
      time: currentGroup.time,
    },
    id: selectedForAction.id,
    ...(before ? { beforeId: before.id } : {}),
  }
}

export const buildMoveToGroupChange = (
  selectedForAction: Registration,
  groupKey: string,
  groups: RegistrationGroup[]
): RegistrationGroupMove | undefined => {
  const targetGroup = groups.find((group) => group.key === groupKey)
  if (!targetGroup) return undefined

  return {
    group: {
      date: targetGroup.date,
      key: groupKey,
      time: targetGroup.time,
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
