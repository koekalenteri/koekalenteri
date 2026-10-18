import type {
  JsonPublicConfirmedEvent,
  MinimalRegistrationForMembership,
  PublicConfirmedEvent,
  Registration,
  RegistrationPlacement,
  RegistrationRefundAmounts,
} from '.'
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

/**
 * What the balance reads beside the fee: the money in, the money returned, and whether it counts. The
 * group says whether a returned fee is owed again; only its key is read, so a stored row and a parsed
 * one both fit.
 */
export interface PaymentBalanceRegistration
  extends MinimalRegistrationForCost,
    RegistrationPlacement,
    Pick<Registration, 'paymentStatus'>,
    RegistrationRefundAmounts {}

/** Where an entry's money stands against its fee, in euros. See `getPaymentBalance`. */
export interface PaymentBalance {
  /** The fee the entry's data adds up to now. */
  cost: number
  /** Paid and not returned. */
  paid: number
  /** Still owed: nothing paid yet, or the fee rose after it was paid. */
  due: number
  /** Paid over the fee: the fee came down after it was paid. */
  excess: number
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

/**
 * What the entry's payment reads as, in the order the rules decide it: a payment charged twice, a
 * payment in progress, a fee that went back (`unpaid` when it is owed again, else `refunded`), money
 * standing for the place (`partial` while a part is missing, `overpaid` above the fee), nothing owed
 * or a trial that is not confirmed (`notCharged`), a place still awaited (`waitingForPlace`) and
 * last the fee not paid (`unpaid`). A standing payment keeps its status whatever the trial's state.
 */
export type PaymentPictureStatus =
  | 'duplicate'
  | 'inProgress'
  | 'notCharged'
  | 'overpaid'
  | 'paid'
  | 'partial'
  | 'refunded'
  | 'unpaid'
  | 'waitingForPlace'

/**
 * The one answer to "where does this entry's payment stand" (`getPaymentPicture`, KOE-1530). Every
 * key is always there, with 0 or false for nothing: a websocket patch merges objects key by key and
 * only `null` removes one, so a key that came and went would stay behind.
 */
export interface PaymentPicture {
  /** Whether the participant is offered the payment link. The page adds its own wait for a verification. */
  canPay: boolean
  /**
   * Whether the overpaid part can still be returned, in whatever state the trial is: the money is the
   * entrant's (KOE-1382, KOE-1552). For the secretary's views, whose mark and menu show it only for a
   * confirmed trial.
   */
  canRefundExcess: boolean
  /** Whether the ordinary refund applies. For the secretary's views. */
  canRefund: boolean
  /** What is still owed; 0 for a trial that is not confirmed. */
  due: number
  /** Paid over the fee. */
  excess: number
  /** The handling fee kept from a refund. */
  keptFee: number
  /** What was paid, as recorded. */
  paidAmount: number
  /** Whether the place counts as paid for: money standing for it, or a fee of nothing. */
  paidForPlace: boolean
  /** What went back. */
  refundedAmount: number
  /** Whether some payment stands for the place: money paid and not gone back, or a legacy payment. */
  standing: boolean
  status: PaymentPictureStatus
  /** Whether a paid fee no longer matches what the entry adds up to. For the secretary's views. */
  unsettled: boolean
}
