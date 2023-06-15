import { SyntheticEvent, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckBox, CheckBoxOutlineBlank } from '@mui/icons-material'
import { Autocomplete, AutocompleteChangeReason, Avatar, Checkbox, Chip, TextField } from '@mui/material'
import { isSameDay } from 'date-fns'
import { DeepPartial, Event, EventClass, EventState } from 'koekalenteri-shared/model'

interface Props {
  id: string
  eventStartDate: Date
  eventEndDate: Date
  value: DeepPartial<EventClass>[] | undefined
  classes: DeepPartial<EventClass>[]
  label: string
  required?: boolean
  requiredState?: EventState
  errorStates?: { [Property in keyof Event]?: boolean }
  helperTexts?: { [Property in keyof Event]?: string }
  showCount?: boolean
  onChange?: (event: SyntheticEvent, value: DeepPartial<EventClass>[], reason: AutocompleteChangeReason) => void
}

export const compareEventClass = (a: DeepPartial<EventClass>, b: DeepPartial<EventClass>) =>
  isSameDay(a.date ?? new Date(), b.date ?? new Date())
    ? a.class?.localeCompare(b.class ?? '') ?? 0
    : (a.date?.valueOf() ?? 0) - (b.date?.valueOf() ?? 0)

export default function EventClasses(props: Props) {
  const { t } = useTranslation()
  const {
    classes,
    label,
    eventStartDate,
    eventEndDate,
    required,
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
      disabled={classes.length === 0}
      disablePortal
      multiple
      groupBy={groupBy ? groupByWeekday : undefined}
      options={classes}
      getOptionLabel={getLabel}
      isOptionEqualToValue={isEqual}
      renderOption={(optionProps, option, { selected }) => (
        <li {...optionProps}>
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
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((option, index) => (
          <Chip
            {...getTagProps({ index })}
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
        ))
      }
    />
  )
}
