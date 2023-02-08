import { useTranslation } from 'react-i18next'
import { Box, FormControl, TextField, TextFieldProps, Theme } from '@mui/material'
import { DatePicker, PickersDay } from '@mui/x-date-pickers'
import { isSameDay, isValid, startOfDay } from 'date-fns'

export type DateValue = Date | null;

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
  range?: { start?: Date, end?: Date }
  required?: boolean
  onChange?: (start: DateValue, end: DateValue) => void
};

function dayStyle(date: Date, selected: DateValue[], defaultDate?: Date) {
  const isSelected = selected.reduce((a, c) => a || (!!c && isSameDay(c, date)), false)
  const isDefault = !!defaultDate && isSameDay(date, defaultDate)
  const hilight = isDefault && !isSelected
  return {
    border: hilight ? (theme: Theme) => `2px solid ${theme.palette.secondary.light}` : undefined,
  }
}

function coerceToDateValue(d: DateValue) {
  return (d && isValid(d)) ? startOfDay(d) : null
}

export default function DateRange({
  start, end,
  startLabel, endLabel,
  startError, endError,
  startHelperText, endHelperText,
  defaultStart, defaultEnd,
  range, required, disabled, onChange,
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
          mask={t('datemask')}
          inputFormat={t('dateFormat.long')}
          minDate={range?.start}
          maxDate={range?.end}
          showToolbar={false}
          onChange={startChanged}
          renderDay={(date, selectedDates, props) => <PickersDay {...props} sx={dayStyle(date, selectedDates, defaultStart)} />}
          renderInput={(params: JSX.IntrinsicAttributes & TextFieldProps) => <TextField {...params} required={required} error={startError} helperText={startHelperText} />}
        />
      </FormControl>

      <FormControl sx={{ pl: 0.5, width: '50%' }}>
        <DatePicker
          defaultCalendarMonth={defaultEnd}
          disabled={disabled}
          label={endLabel}
          value={end}
          mask={t('datemask')}
          inputFormat={t('dateFormat.long')}
          minDate={start ? start : range?.start}
          maxDate={range?.end}
          showToolbar={false}
          onChange={endChanged}
          renderDay={(date, selectedDates, props) => <PickersDay {...props} sx={dayStyle(date, selectedDates, defaultEnd)} />}
          renderInput={(params: JSX.IntrinsicAttributes & TextFieldProps) => <TextField {...params} required={required} error={endError} helperText={endHelperText} />}
        />
      </FormControl>
    </Box>
  )
}
