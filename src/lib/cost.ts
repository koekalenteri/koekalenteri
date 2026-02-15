import type {
  BreedCode,
  CostResult,
  CostStrategy,
  CustomCost,
  DogEventCost,
  DogEventCostKey,
  DogEventCostSegment,
  JsonPublicConfirmedEvent,
  MinimalEventForCost,
  MinimalRegistrationForCost,
  MinimalRegistrationForMembership,
  PublicConfirmedEvent,
} from '../types'
import { addDays } from 'date-fns'
import { isMember } from './registration'

export const getEarlyBirdEndDate = (
  event: Partial<Pick<PublicConfirmedEvent, 'entryStartDate'> | Pick<JsonPublicConfirmedEvent, 'entryStartDate'>>,
  cost: Pick<DogEventCost, 'earlyBird'>
) =>
  cost.earlyBird && event.entryStartDate && cost.earlyBird?.days > 0
    ? addDays(new Date(event.entryStartDate), cost.earlyBird.days - 1)
    : undefined

export const getEarlyBirdDates = (
  event: Partial<Pick<PublicConfirmedEvent, 'entryStartDate'> | Pick<JsonPublicConfirmedEvent, 'entryStartDate'>>,
  cost: Pick<DogEventCost, 'earlyBird'>
): { start?: Date; end?: Date } => {
  if (cost.earlyBird && event.entryStartDate && cost.earlyBird?.days > 0) {
    return {
      end: addDays(new Date(event.entryStartDate), cost.earlyBird.days - 1),
      start: new Date(event.entryStartDate),
    }
  }
  return { end: undefined, start: undefined }
}

/** Helper object that can be "auto-fixed" to contain all the keys */
const EVENT_COST_MODEL: { [K in DogEventCostKey]: K } = {
  breed: 'breed',
  custom: 'custom',
  earlyBird: 'earlyBird',
  normal: 'normal',
  optionalAdditionalCosts: 'optionalAdditionalCosts',
}

export const DOG_EVENT_COST_KEYS: DogEventCostKey[] = Object.values(EVENT_COST_MODEL)

const normalStrategy: CostStrategy = {
  getValue: (cost) => (typeof cost.normal === 'number' ? cost.normal : 0),
  isApplicable: () => true,
  key: 'normal',
  setValue: (cost, value) => ({ ...cost, normal: value }),
}

const customStrategy: CostStrategy = {
  getValue: (cost) => cost.custom?.cost ?? 0,
  isApplicable: (cost) => !!cost.custom && (cost.custom.cost ?? 0) > 0,
  key: 'custom',
  setValue: (cost, value, data) => {
    const prevDescription = cost.custom?.description ?? { en: 'Custom cost', fi: 'Erikoismaksu' }
    const description = data && 'description' in data ? data.description : prevDescription
    return { ...cost, custom: { cost: value, description } }
  },
}

const earlyBirdStrategy: CostStrategy = {
  getValue: (cost) => cost.earlyBird?.cost ?? 0,
  isApplicable: (cost, registration, event) => {
    if (!cost.earlyBird || !event.entryStartDate) {
      return false
    }
    const endDate = getEarlyBirdEndDate(event, cost)
    if (!endDate) {
      return false
    }
    return new Date(registration.createdAt) < endDate
  },
  key: 'earlyBird',
  setValue: (cost, value, data) => {
    const days = data && 'days' in data ? data.days : (cost.earlyBird?.days ?? 0)
    return { ...cost, earlyBird: { cost: value, days } }
  },
}

const breedStrategy: CostStrategy = {
  getValue: (cost, breedCode) => (breedCode && cost.breed?.[breedCode]) ?? 0,
  isApplicable: (cost, registration) => {
    const breedCode = registration.dog.breedCode
    return !!cost.breed && !!breedCode && !!cost.breed[breedCode]
  },
  key: 'breed',
  setValue: (cost, value, data) => {
    const result = { ...cost, breed: { ...cost.breed } }
    if (data && 'breedCode' in data) {
      const breedCodes = Array.isArray(data.breedCode) ? data.breedCode : [data.breedCode]
      for (const code of breedCodes) {
        result.breed[code] = value
      }
    }
    return result
  },
}

export const costStrategies: CostStrategy[] = [customStrategy, earlyBirdStrategy, breedStrategy, normalStrategy]

export const getStragegyBySegment = (key?: DogEventCostSegment) => costStrategies.find((s) => s.key === key)

export const getApplicableStrategy = (
  event: MinimalEventForCost,
  registration: MinimalRegistrationForCost
): CostStrategy => {
  const cost = selectCost(event, registration)
  if (typeof cost === 'number') {
    return normalStrategy
  }
  if (registration.selectedCost) {
    const selectedStrategy = getStragegyBySegment(registration.selectedCost)
    if (selectedStrategy?.isApplicable(cost, registration, event)) {
      return selectedStrategy
    }
  }

  const applicableStrategies = costStrategies.filter(
    (strategy) => strategy.isApplicable(cost, registration, event) && strategy.key !== 'custom'
  )

  if (applicableStrategies.length === 0) {
    return normalStrategy
  }

  return applicableStrategies.reduce((cheapest, current) => {
    const cheapestPrice = cheapest.getValue(cost, registration.dog.breedCode)
    const currentPrice = current.getValue(cost, registration.dog.breedCode)
    return currentPrice < cheapestPrice ? current : cheapest
  }, normalStrategy)
}

/**
 * Helper to override a member cost value if it's specified (non-zero).
 * Returns the member value if non-zero, otherwise the base value.
 */
const overrideIfSpecified = <T extends number | { cost: number }>(
  base: T | undefined,
  member: T | undefined
): T | undefined => {
  if (member === undefined) return base
  const memberCost = typeof member === 'number' ? member : member.cost
  return memberCost !== 0 ? member : base
}

/**
 * Merges member cost with base cost, using member prices where available and falling back to base prices.
 * This ensures members have access to all pricing segments even if member-specific pricing isn't fully defined.
 * Note: A value of 0 in member cost means "not specified", so base cost will be used.
 * Returns undefined if memberCost is not provided.
 */
export const mergeMemberCost = (
  baseCost: DogEventCost | number,
  memberCost: DogEventCost | number | undefined
): DogEventCost | number | undefined => {
  if (!memberCost) return undefined

  // If either is a legacy number, return member cost directly (no merging possible)
  if (typeof baseCost === 'number' || typeof memberCost === 'number') {
    return memberCost
  }

  // Merge cost structures: member cost takes priority, but fall back to base cost for missing fields
  // Note: 0 means "not specified", so we use the base cost value
  const merged: DogEventCost = { ...baseCost }

  // Override with member cost values where they exist and are non-zero
  merged.normal = overrideIfSpecified(baseCost.normal, memberCost.normal) ?? merged.normal
  merged.earlyBird = overrideIfSpecified(baseCost.earlyBird, memberCost.earlyBird)
  merged.custom = overrideIfSpecified(baseCost.custom, memberCost.custom)

  // Merge optional additional costs - override each one if specified
  if (baseCost.optionalAdditionalCosts || memberCost.optionalAdditionalCosts) {
    const baseOptional = baseCost.optionalAdditionalCosts ?? []
    const memberOptional = memberCost.optionalAdditionalCosts ?? []
    const maxLength = Math.max(baseOptional.length, memberOptional.length)

    merged.optionalAdditionalCosts = Array.from(
      { length: maxLength },
      (_, i) => overrideIfSpecified(baseOptional[i], memberOptional[i]) ?? baseOptional[i]
    ).filter(Boolean)
  }

  // Merge breed objects - member breed prices override base breed prices for the same breed
  // Only override breeds with non-zero prices
  if (baseCost.breed || memberCost.breed) {
    merged.breed = { ...baseCost.breed }
    if (memberCost.breed) {
      for (const [breedCode, price] of Object.entries(memberCost.breed)) {
        if (price !== 0) {
          merged.breed[breedCode as BreedCode] = price
        }
      }
    }
  }

  return merged
}

export const selectCost = (event: MinimalEventForCost, registration: MinimalRegistrationForMembership) => {
  const isMemberUser = isMember(registration)

  // If no member cost or user is not a member, return base cost
  if (!isMemberUser || !event.costMember) {
    return event.cost
  }

  // Use the shared merge logic
  return mergeMemberCost(event.cost, event.costMember) ?? event.cost
}

/**
 * Checks if a member price differs from the base price for a specific segment.
 * Returns true if the member has an explicit non-zero price that differs from the base price.
 */
export const hasDifferentMemberPrice = (
  event: Pick<MinimalEventForCost, 'cost' | 'costMember'>,
  segment: DogEventCostSegment | 'legacy',
  breedCode?: BreedCode
): boolean => {
  if (!event.costMember) {
    return false
  }

  // For legacy costs, check if they differ
  if (segment === 'legacy' || typeof event.cost === 'number' || typeof event.costMember === 'number') {
    if (typeof event.cost === 'number' && typeof event.costMember === 'number') {
      return event.cost !== event.costMember
    }
    return false
  }

  const baseValue = getCostValue(event.cost, segment, breedCode)
  const memberValue = getCostValue(event.costMember, segment, breedCode)

  // Member price differs if it exists, is non-zero, and differs from base
  return !!memberValue && memberValue !== baseValue
}

export const additionalCost = (registration: MinimalRegistrationForCost, cost: DogEventCost) => {
  const selected = registration.optionalCosts ?? []
  return cost.optionalAdditionalCosts?.reduce((acc, c, i) => (selected.includes(i) ? acc + c.cost : acc), 0) ?? 0
}

type CostSegmentName = 'costNames.normal' | 'costNames.earlyBird' | 'costNames.breed' | 'costNames.custom'

export const getCostSegmentName = (segment: DogEventCostSegment | 'legacy'): CostSegmentName => {
  const names: Record<DogEventCostSegment | 'legacy', CostSegmentName> = {
    breed: 'costNames.breed',
    custom: 'costNames.custom',
    earlyBird: 'costNames.earlyBird',
    legacy: 'costNames.normal',
    normal: 'costNames.normal',
  }
  return names[segment]
}

export const setCostValue = (
  cost: DogEventCost,
  key: DogEventCostKey,
  value: number,
  data?: Omit<CustomCost, 'cost'> | { breedCode: BreedCode | BreedCode[] } | { days: number }
): DogEventCost => {
  const strategy = costStrategies.find((s) => s.key === key)
  if (strategy) {
    return strategy.setValue(cost, value, data)
  }
  if (key === 'optionalAdditionalCosts') {
    return cost
  }
  return cost
}

export const getCostValue = (cost: DogEventCost | number, key: DogEventCostKey, breedCode?: BreedCode): number => {
  if (typeof cost === 'number') return cost
  if (key === 'optionalAdditionalCosts') return 0

  const strategy = costStrategies.find((s) => s.key === key)
  if (strategy) {
    return strategy.getValue(cost, breedCode)
  }

  return 0
}

export const calculateCost = (event: MinimalEventForCost, registration: MinimalRegistrationForCost): CostResult => {
  const cost = selectCost(event, registration)

  if (typeof cost === 'number') return { amount: cost, segment: 'legacy' }

  const strategy = getApplicableStrategy(event, registration)
  const segment = strategy.key
  const amount = strategy.getValue(cost, registration.dog.breedCode) + additionalCost(registration, cost)

  return { amount, cost, segment }
}
