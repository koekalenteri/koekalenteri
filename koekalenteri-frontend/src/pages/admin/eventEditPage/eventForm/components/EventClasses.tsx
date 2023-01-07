import { SyntheticEvent } from "react"
import { useTranslation } from "react-i18next"
import { CheckBox, CheckBoxOutlineBlank } from "@mui/icons-material"
import { Autocomplete, AutocompleteChangeReason, Avatar, Checkbox, Chip, TextField } from "@mui/material"
import { isSameDay } from "date-fns"
import { DeepPartial, Event, EventClass, EventState } from "koekalenteri-shared/model"

import { PartialEvent } from "../../EventForm"

interface Props {
  id: string
  event: PartialEvent
  value: DeepPartial<EventClass>[] | undefined
  classes: DeepPartial<EventClass>[]
  label: string
  required?: boolean
  requiredState?: EventState
  errorStates?: { [Property in keyof Event]?: boolean }
  helperTexts?: { [Property in keyof Event]?: string }
  onChange: (event: SyntheticEvent, value: DeepPartial<EventClass>[], reason: AutocompleteChangeReason) => void
}

export const compareEventClass = (a: DeepPartial<EventClass>, b: DeepPartial<EventClass>) =>
  isSameDay(a.date ?? new Date(), b.date ?? new Date())
    ? a.class?.localeCompare(b.class ?? '') ?? 0
    : (a.date?.valueOf() ?? 0) - (b.date?.valueOf() ?? 0)

export default function EventClasses(props: Props) {
  const { t } = useTranslation()
  const { classes, label, event, required, requiredState, errorStates, helperTexts, value, ...rest } = props
  const error = errorStates?.classes
  const helperText = helperTexts?.classes || ''
  const sortedValue = value?.slice().sort(compareEventClass)

  return (
    <Autocomplete
      {...rest}
      value={sortedValue}
      fullWidth
      disableClearable
      disableCloseOnSelect
      disabled={classes.length === 0}
      multiple
      groupBy={c => t('weekday', { date: c.date })}
      options={classes}
      getOptionLabel={c => c.class ?? ''}
      isOptionEqualToValue={(o, v) => compareEventClass(o, v) === 0}
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
      renderInput={(inputProps) => <TextField {...inputProps} required={required} error={!!error} helperText={helperText} label={label} />}
      renderTags={(tagValue, getTagProps) => tagValue.map((option, index) => (
        <Chip
          {...getTagProps({ index })}
          avatar={
            <Avatar
              sx={{
                fontWeight: 'bold',
                bgcolor: isSameDay(option.date || event.startDate, event.startDate) ? 'secondary.light' : 'secondary.dark',
              }}
            >
              {t('weekday', { date: option.date })}
            </Avatar>
          }
          label={option.class}
          onDelete={undefined}
          size="small"
          sx={{bgcolor: option.judge?.id ? 'background.ok' : 'transparent'}}
          variant={option.judge ? "filled" : "outlined"}
        />
      ))}
    />
  )
}
