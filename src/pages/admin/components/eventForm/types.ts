import type { ValidationResult } from '../../../../i18n/validation'
import type { DeepPartial, DogEvent, EventState, Patch } from '../../../../types'

export interface PartialEvent
  extends Omit<
    DeepPartial<DogEvent>,
    'startDate' | 'endDate' | 'classes' | 'judges' | 'official' | 'secretary' | 'dates' | 'kcId'
  > {
  startDate: DogEvent['startDate']
  endDate: DogEvent['endDate']
  classes: DogEvent['classes']
  judges: DogEvent['judges']
  official?: Partial<DogEvent['official']>
  secretary?: Partial<DogEvent['secretary']>
  dates?: NonNullable<DogEvent['dates']>
  kcId?: DogEvent['kcId'] | null

  cost?: DogEvent['cost']
  costMember?: NonNullable<DogEvent['costMember']>
}

type RequiredFieldState = Partial<{
  [Property in keyof DogEvent]: EventState
}>

type RequiredFields = Partial<{
  [Property in keyof DogEvent]: boolean
}>

export type FieldRequirements = {
  state: RequiredFieldState
  required: RequiredFields
}
export type JudgesEvent = Pick<PartialEvent, 'classes' | 'endDate' | 'eventType' | 'judges' | 'startDate'>

export type BasicInfoEvent = Pick<
  PartialEvent,
  | 'classes'
  | 'contactInfo'
  | 'dates'
  | 'endDate'
  | 'entries'
  | 'entryEndDate'
  | 'entryStartDate'
  | 'eventType'
  | 'judges'
  | 'kcId'
  | 'location'
  | 'name'
  | 'official'
  | 'organizer'
  | 'placesPerDay'
  | 'secretary'
  | 'startDate'
>

export type PaymentEvent = Pick<PartialEvent, 'cost' | 'costMember' | 'entryStartDate' | 'paymentTime'>

export type EntryEvent = Pick<
  PartialEvent,
  | 'classes'
  | 'createdAt'
  | 'dates'
  | 'endDate'
  | 'entryEndDate'
  | 'entryStartDate'
  | 'eventType'
  | 'places'
  | 'placesPerDay'
  | 'priority'
  | 'startDate'
>

export interface SectionProps {
  readonly event: PartialEvent
  readonly disabled?: boolean
  readonly changes?: Patch<DogEvent>
  readonly fields?: FieldRequirements
  readonly errorStates?: { [Property in keyof DogEvent]?: boolean }
  readonly helperTexts?: { [Property in keyof DogEvent]?: string }
  readonly errors?: ValidationResult<PartialEvent, 'event'>[]
  readonly open?: boolean
  readonly onChange?: (event: Patch<DogEvent>) => void
  readonly onOpenChange?: (value: boolean) => void
}

type EventCallback = (event: PartialEvent) => boolean
export type EventFlag = boolean | EventCallback
export type EventFlags = Partial<{
  [Property in keyof DogEvent]: EventFlag
}>
