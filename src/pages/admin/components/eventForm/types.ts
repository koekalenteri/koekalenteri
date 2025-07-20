import type { ValidationResult } from '../../../../i18n/validation'
import type { DeepPartial, DogEvent, EventState } from '../../../../types'

export interface PartialEvent
  extends Omit<
    DeepPartial<DogEvent>,
    'startDate' | 'endDate' | 'classes' | 'judges' | 'official' | 'secretary' | 'dates'
  > {
  startDate: DogEvent['startDate']
  endDate: DogEvent['endDate']
  classes: DogEvent['classes']
  judges: DogEvent['judges']
  official?: Partial<DogEvent['official']>
  secretary?: Partial<DogEvent['secretary']>
  dates?: DogEvent['dates']

  cost?: DogEvent['cost']
  costMember?: DogEvent['costMember']
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
export interface SectionProps {
  readonly event: PartialEvent
  readonly disabled?: boolean
  readonly fields?: FieldRequirements
  readonly errorStates?: { [Property in keyof DogEvent]?: boolean }
  readonly helperTexts?: { [Property in keyof DogEvent]?: string }
  readonly errors?: ValidationResult<PartialEvent, 'event'>[]
  readonly open?: boolean
  readonly onChange?: (event: DeepPartial<DogEvent>) => void
  readonly onOpenChange?: (value: boolean) => void
}

type EventCallback = (event: PartialEvent) => boolean
export type EventFlag = boolean | EventCallback
export type EventFlags = Partial<{
  [Property in keyof DogEvent]: EventFlag
}>
