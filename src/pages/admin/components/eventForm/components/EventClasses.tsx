import type { AutocompleteChangeReason } from '@mui/material'
import type { SyntheticEvent } from 'react'
import type { ClassOrderOwner } from '@/lib/event'
import type { DayKey, DeepPartial, DogEvent, EventClass, EventState } from '@/types'
import CheckBox from '@mui/icons-material/CheckBox'
import CheckBoxOutlineBlank from '@mui/icons-material/CheckBoxOutlineBlank'
import Autocomplete from '@mui/material/Autocomplete'
import Avatar from '@mui/material/Avatar'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { dayOf, TIME_ZONE } from '@/lib/day'
import { classOrder } from '@/lib/event'

interface Props {
  readonly id: string
  readonly eventStartDate: DayKey
  readonly eventEndDate: DayKey
  readonly value: DeepPartial<EventClass>[] | undefined
  readonly classes: DeepPartial<EventClass>[]
  readonly label: string
  readonly disabled?: boolean
  readonly required?: boolean
  readonly requiredState?: EventState
  readonly errorStates?: { [Property in keyof DogEvent]?: boolean }
  readonly helperTexts?: { [Property in keyof DogEvent]?: string }
  readonly showCount?: boolean
  /** The event's own classes, whose order the chosen classes keep within a day (KOE-674). */
  readonly ownClasses?: NonNullable<ClassOrderOwner['ownClasses']>
  readonly onChange?: (
    event: SyntheticEvent,
    value: readonly DeepPartial<EventClass>[],
    reason: AutocompleteChangeReason
  ) => void
}

/** Whether two classes run on the same day; a class with no date is read as today. */
const sameClassDay = (a?: DayKey, b?: DayKey) => {
  const today = dayOf(new Date(), TIME_ZONE)
  return (a ?? today) === (b ?? today)
}

/** Whether two class days are the same class on the same day. */
export const sameEventClass = (a: DeepPartial<EventClass>, b: DeepPartial<EventClass>) =>
  sameClassDay(a.date, b.date) && (a.class ?? '') === (b.class ?? '')

/**
 * The order of the class days the form shows: by day, and within a day in the event's class order
 * (`classOrder`, KOE-674), its own classes as the secretary listed them.
 */
const eventClassOrder = (event: ClassOrderOwner) => {
  const byClass = classOrder(event)
  return (a: DeepPartial<EventClass>, b: DeepPartial<EventClass>) =>
    sameClassDay(a.date, b.date) ? byClass(a.class, b.class) : (a.date ?? '').localeCompare(b.date ?? '')
}

type EventClassValue = DeepPartial<EventClass>

export default function EventClasses(props: Props) {
  const { t } = useTranslation()
  const {
    classes,
    label,
    eventStartDate,
    eventEndDate,
    disabled,
    required,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    requiredState,
    errorStates,
    helperTexts,
    value,
    showCount,
    ownClasses,
    ...rest
  } = props
  const error = errorStates?.classes
  const helperText = helperTexts?.classes ?? ''
  const sortedValue = useMemo(() => value?.slice().sort(eventClassOrder({ ownClasses })), [ownClasses, value])
  const groupByWeekday = useCallback((c: { date?: DayKey }) => t('dateFormat.wdshort', { date: c.date }), [t])
  const getLabel = useCallback((c: { class?: string }) => c.class ?? '', [])
  const isEqual = useCallback((a: DeepPartial<EventClass>, b: DeepPartial<EventClass>) => sameEventClass(a, b), [])
  const groupBy = eventStartDate !== eventEndDate
  const hasJudge = useCallback(
    (option: DeepPartial<EventClass>) => (Array.isArray(option.judge) ? option.judge.length : option.judge?.id),
    []
  )

  return (
    <Autocomplete
      {...rest}
      value={sortedValue}
      fullWidth
      disableClearable
      disableCloseOnSelect
      disabled={disabled || classes.length === 0}
      disablePortal
      multiple
      groupBy={groupBy ? groupByWeekday : undefined}
      options={classes}
      getOptionLabel={getLabel}
      isOptionEqualToValue={isEqual}
      renderOption={(optionProps, option, { selected }) => (
        <li {...optionProps} key={`${option.date}-${option.class}`}>
          <Checkbox
            icon={<CheckBoxOutlineBlank fontSize="small" />}
            checkedIcon={<CheckBox fontSize="small" />}
            style={{ marginRight: 8 }}
            checked={selected}
          />
          {option.class}
        </li>
      )}
      renderInput={(inputProps) => (
        <TextField {...inputProps} required={required} error={!!error} helperText={helperText} label={label} />
      )}
      renderValue={(tagValue: readonly EventClassValue[], getItemProps) =>
        tagValue.map((option, index) => {
          const { key, ...props } = getItemProps({ index })
          return (
            <Chip
              key={key}
              {...props}
              avatar={
                groupBy ? (
                  <Avatar
                    sx={{
                      bgcolor:
                        (option.date || eventStartDate) === eventStartDate ? 'secondary.light' : 'secondary.dark',
                      fontWeight: 'bold',
                    }}
                  >
                    {t('dateFormat.weekday', { date: option.date })}
                  </Avatar>
                ) : undefined
              }
              label={
                (option.class ?? '') +
                (showCount && Array.isArray(option.judge) && option.judge.length > 1 ? ` x${option.judge.length}` : '')
              }
              onDelete={undefined}
              size="small"
              sx={{ bgcolor: hasJudge(option) ? 'background.ok' : 'transparent' }}
              variant={hasJudge(option) ? 'filled' : 'outlined'}
            />
          )
        })
      }
    />
  )
}
