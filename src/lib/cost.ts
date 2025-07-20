import type { BreedCode, PublicConfirmedEvent } from '../types'
import type {
  CostResult,
  CostStrategy,
  CustomCost,
  DogEventCost,
  DogEventCostKey,
  DogEventCostSegment,
  MinimalEventForCost,
  MinimalRegistrationForCost,
} from '../types/Cost'
import type { MinimalRegistrationForMembership } from './registration'

import { addDays } from 'date-fns'

import { isMember } from './registration'

export const getEarlyBirdEndDate = (
  event: Partial<Pick<PublicConfirmedEvent, 'entryStartDate'>>,
  cost: Pick<DogEventCost, 'earlyBird'>
) => (cost.earlyBird && event.entryStartDate ? addDays(event.entryStartDate, cost.earlyBird.days - 1) : undefined)

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
  key: 'normal',
  isApplicable: () => true,
  getValue: (cost) => (typeof cost.normal === 'number' ? cost.normal : 0),
  setValue: (cost, value) => ({ ...cost, normal: value }),
}

const customStrategy: CostStrategy = {
  key: 'custom',
  isApplicable: (cost) => !!cost.custom,
  getValue: (cost) => cost.custom?.cost ?? 0,
  setValue: (cost, value, data) => {
    const prevDescription = cost.custom?.description ?? { fi: 'Erikoismaksu', en: 'Custom cost' }
    const description = data && 'description' in data ? data.description : prevDescription
    return { ...cost, custom: { cost: value, description } }
  },
}

const earlyBirdStrategy: CostStrategy = {
  key: 'earlyBird',
  isApplicable: (cost, registration, event) =>
    !!cost.earlyBird && registration.createdAt < (getEarlyBirdEndDate(event, cost) ?? event.entryStartDate),
  getValue: (cost) => cost.earlyBird?.cost ?? 0,
  setValue: (cost, value, data) => {
    const days = data && 'days' in data ? data.days : (cost.earlyBird?.days ?? 0)
    return { ...cost, earlyBird: { cost: value, days } }
  },
}

const breedStrategy: CostStrategy = {
  key: 'breed',
  isApplicable: (cost, registration) => {
    const breedCode = registration.dog.breedCode
    return !!cost.breed && !!breedCode && !!cost.breed[breedCode]
  },
  getValue: (cost, breedCode) => (breedCode && cost.breed?.[breedCode]) ?? 0,
  setValue: (cost, value, data) => {
    const result = { ...cost, breed: { ...(cost.breed ?? {}) } }
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
  event: Pick<PublicConfirmedEvent, 'cost' | 'costMember' | 'entryStartDate'>,
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

export const selectCost = (event: MinimalEventForCost, registration: MinimalRegistrationForMembership) =>
  event.costMember && isMember(registration) ? event.costMember : event.cost

export const additionalCost = (registration: MinimalRegistrationForCost, cost: DogEventCost) => {
  const selected = registration.optionalCosts ?? []
  return cost.optionalAdditionalCosts?.reduce((acc, c, i) => (selected.includes(i) ? acc + c.cost : acc), 0) ?? 0
}

type CostSegmentName = 'costNames.normal' | 'costNames.earlyBird' | 'costNames.breed' | 'costNames.custom'

export const getCostSegmentName = (segment: DogEventCostSegment | 'legacy'): CostSegmentName => {
  const names: Record<DogEventCostSegment | 'legacy', CostSegmentName> = {
    normal: 'costNames.normal',
    earlyBird: 'costNames.earlyBird',
    breed: 'costNames.breed',
    custom: 'costNames.custom',
    legacy: 'costNames.normal',
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
  const segment = strategy.key as DogEventCostSegment
  const amount = strategy.getValue(cost, registration.dog.breedCode) + additionalCost(registration, cost)

  return { amount, segment, cost }
}

export const getCostSegment = (
  event: MinimalEventForCost,
  registration: MinimalRegistrationForCost
): DogEventCostSegment | 'legacy' => {
  const cost = selectCost(event, registration)
  if (typeof cost === 'number') {
    return 'legacy'
  }
  const strategy = getApplicableStrategy(event, registration)
  return strategy.key as DogEventCostSegment
}
