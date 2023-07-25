import { useTranslation } from 'react-i18next'
import { Theme } from '@mui/material'
import Box from '@mui/material/Box'
import FormControl from '@mui/material/FormControl'
import { DatePicker } from '@mui/x-date-pickers'
import { isSameDay, isValid, startOfDay } from 'date-fns'

export type DateValue = Date | null

export type DateRangeProps = {
  defaultStart?: Date
  defaultEnd?: Date
  disabled?: boolean
  start: DateValue
  startLabel: string
  startError?: boolean
  startHelperText?: string
  end: DateValue
  endLabel: string
  endError?: boolean
  endHelperText?: string
  range?: { start?: Date; end?: Date }
  required?: boolean
  onChange?: (start: DateValue, end: DateValue) => void
}

function dayStyle(date: Date, selected: Boolean, defaultDate?: Date) {
  const isDefault = !!defaultDate && isSameDay(date, defaultDate)
  const hilight = isDefault && !selected
  return {
    border: hilight ? (theme: Theme) => `2px solid ${theme.palette.secondary.light}` : undefined,
  }
}

function coerceToDateValue(d: DateValue) {
  return d && isValid(d) ? startOfDay(d) : null
}

export default function DateRange({
  start,
  end,
  startLabel,
  endLabel,
  startError,
  endError,
  startHelperText,
  endHelperText,
  defaultStart,
  defaultEnd,
  range,
  required,
  disabled,
  onChange,
}: DateRangeProps) {
  const { t } = useTranslation()
  const startChanged = (date: DateValue) => {
    const d = coerceToDateValue(date)
    onChange && onChange(d, end)
  }
  const endChanged = (date: DateValue) => {
    const d = coerceToDateValue(date)
    onChange && onChange(start, d)
  }

  return (
    <Box sx={{ width: '100%' }}>
      <FormControl sx={{ pr: 0.5, width: '50%' }}>
        <DatePicker
          defaultCalendarMonth={defaultStart}
          disabled={disabled}
          label={startLabel}
          value={start}
          format={t('dateFormatString.long')}
          minDate={range?.start}
          maxDate={range?.end}
          onChange={startChanged}
          slotProps={{
            day: ({ day, selected }) => ({ sx: dayStyle(day, selected, defaultStart) }),
            textField: { required, error: startError, helperText: startHelperText },
            toolbar: {
              hidden: true,
            },
          }}
        />
      </FormControl>

      <FormControl sx={{ pl: 0.5, width: '50%' }}>
        <DatePicker
          defaultCalendarMonth={defaultEnd}
          disabled={disabled}
          label={endLabel}
          value={end}
          format={t('dateFormatString.long')}
          minDate={start ? start : range?.start}
          maxDate={range?.end}
          onChange={endChanged}
          slotProps={{
            day: ({ day, selected }) => ({ sx: dayStyle(day, selected, defaultEnd) }),
            textField: { required, error: endError, helperText: endHelperText },
            toolbar: {
              hidden: true,
            },
          }}
        />
      </FormControl>
    </Box>
  )
}
