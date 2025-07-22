import type { MinimalRegistrationForMembership } from '../lib/registration'
import type { JsonPublicConfirmedEvent, PublicConfirmedEvent, Registration } from '.'
import type { BreedCode } from './Dog'
import type { KeyofExcluding } from './utility'

export interface CustomCost {
  cost: number
  description: {
    fi: string
    en?: string
  }
}

export interface EarlyBirdCost {
  cost: number
  days: number
}

export interface DogEventCost {
  breed?: Partial<Record<BreedCode, number>>
  custom?: CustomCost
  earlyBird?: EarlyBirdCost
  normal: number
  optionalAdditionalCosts?: CustomCost[]
}

export type DogEventCostKey = NonNullable<keyof DogEventCost>

export type DogEventCostSegment = NonNullable<KeyofExcluding<DogEventCost, 'optionalAdditionalCosts'>>

export type MinimalEventForCost =
  | Pick<PublicConfirmedEvent, 'cost' | 'costMember' | 'entryStartDate'>
  | Pick<JsonPublicConfirmedEvent, 'cost' | 'costMember' | 'entryStartDate'>

export interface MinimalRegistrationForCost
  extends MinimalRegistrationForMembership,
    Pick<Registration, 'selectedCost' | 'optionalCosts' | 'paidAmount'> {
  createdAt: Date | string
  dog: Pick<Registration['dog'], 'breedCode'>
}

export interface CostStrategy {
  key: DogEventCostSegment
  isApplicable: (
    cost: DogEventCost,
    registration: MinimalRegistrationForCost,
    event: MinimalEventForCost,
    next?: boolean
  ) => boolean
  getValue: (cost: DogEventCost, breedCode?: BreedCode) => number
  setValue: (
    cost: DogEventCost,
    value: number,
    data?: Omit<CustomCost, 'cost'> | { breedCode: BreedCode | BreedCode[] } | { days: number }
  ) => DogEventCost
}

export interface CostResult {
  amount: number
  segment: DogEventCostSegment | 'legacy'
  cost?: DogEventCost
}
