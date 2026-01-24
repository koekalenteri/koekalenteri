import type { AutocompleteChangeReason } from '@mui/material'
import type { SyntheticEvent } from 'react'
import type { DeepPartial, DogEvent, EventClass, EventState } from '../../../../../types'

import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import CheckBox from '@mui/icons-material/CheckBox'
import CheckBoxOutlineBlank from '@mui/icons-material/CheckBoxOutlineBlank'
import Autocomplete from '@mui/material/Autocomplete'
import Avatar from '@mui/material/Avatar'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import { isSameDay } from 'date-fns'

interface Props {
  readonly id: string
  readonly eventStartDate: Date
  readonly eventEndDate: Date
  readonly value: DeepPartial<EventClass>[] | undefined
  readonly classes: DeepPartial<EventClass>[]
  readonly label: string
  readonly disabled?: boolean
  readonly required?: boolean
  readonly requiredState?: EventState
  readonly errorStates?: { [Property in keyof DogEvent]?: boolean }
  readonly helperTexts?: { [Property in keyof DogEvent]?: string }
  readonly showCount?: boolean
  readonly onChange?: (
    event: SyntheticEvent,
    value: readonly DeepPartial<EventClass>[],
    reason: AutocompleteChangeReason
  ) => void
}

export const compareEventClass = (a: DeepPartial<EventClass>, b: DeepPartial<EventClass>) =>
  isSameDay(a.date ?? new Date(), b.date ?? new Date())
    ? (a.class?.localeCompare(b.class ?? '') ?? 0)
    : (a.date?.valueOf() ?? 0) - (b.date?.valueOf() ?? 0)

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
    ...rest
  } = props
  const error = errorStates?.classes
  const helperText = helperTexts?.classes ?? ''
  const sortedValue = useMemo(() => value?.slice().sort(compareEventClass), [value])
  const groupByWeekday = useCallback((c: { date?: Date }) => t('dateFormat.wdshort', { date: c.date }), [t])
  const getLabel = useCallback((c: { class?: string }) => c.class ?? '', [])
  const isEqual = useCallback(
    (a: DeepPartial<EventClass>, b: DeepPartial<EventClass>) => compareEventClass(a, b) === 0,
    []
  )
  const groupBy = !isSameDay(eventStartDate, eventEndDate)
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
      renderValue={(tagValue, getItemProps) =>
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
                      fontWeight: 'bold',
                      bgcolor: isSameDay(option.date || eventStartDate, eventStartDate)
                        ? 'secondary.light'
                        : 'secondary.dark',
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
