import type { DeepPartial, DogEvent } from '../../../../types'
import type { FieldRequirements } from './validation'

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
}

export interface SectionProps {
  readonly event: PartialEvent
  readonly disabled?: boolean
  readonly fields?: FieldRequirements
  readonly errorStates?: { [Property in keyof DogEvent]?: boolean }
  readonly helperTexts?: { [Property in keyof DogEvent]?: string }
  readonly open?: boolean
  readonly onChange?: (event: DeepPartial<DogEvent>) => void
  readonly onOpenChange?: (value: boolean) => void
}
