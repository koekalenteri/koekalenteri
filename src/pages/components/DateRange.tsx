import type { Theme } from '@mui/material'

import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import FormControl from '@mui/material/FormControl'
import { DatePicker } from '@mui/x-date-pickers'
import { isSameDay, isValid } from 'date-fns'

import useDebouncedCallback from '../../hooks/useDebouncedCallback'

export type DateValue = Date | null

export interface Props {
  readonly defaultStart?: Date
  readonly defaultEnd?: Date
  readonly disabled?: boolean
  readonly start: DateValue
  readonly startLabel: string
  readonly startError?: boolean
  readonly startHelperText?: string
  readonly end: DateValue
  readonly endLabel: string
  readonly endError?: boolean
  readonly endHelperText?: string
  readonly range?: { start?: Date; end?: Date }
  readonly required?: boolean
  readonly onChange?: (start: DateValue, end: DateValue) => void
}

function dayStyle(date: Date, selected: boolean, defaultDate?: Date) {
  const isDefault = !!defaultDate && isSameDay(date, defaultDate)
  const hilight = isDefault && !selected
  return {
    border: hilight ? (theme: Theme) => `2px solid ${theme.palette.secondary.light}` : undefined,
  }
}

function coerceToDateValue(d: DateValue) {
  return d && isValid(d) ? d : null
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
}: Props) {
  const { t } = useTranslation()
  const startChanged = useDebouncedCallback((date: DateValue) => {
    const d = coerceToDateValue(date)
    onChange && onChange(d, end)
  })
  const endChanged = useDebouncedCallback((date: DateValue) => {
    const d = coerceToDateValue(date)
    onChange && onChange(start, d)
  })

  return (
    <Box sx={{ width: '100%' }}>
      <FormControl sx={{ pr: 0.5, width: '50%' }}>
        <DatePicker
          referenceDate={defaultStart}
          disabled={disabled}
          label={startLabel}
          value={start}
          format={t('dateFormatString.long')}
          minDate={range?.start}
          maxDate={range?.end}
          onChange={startChanged}
          slotProps={{
            actionBar: {
              actions: ['clear', 'cancel', 'accept'],
            },
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
          referenceDate={defaultEnd}
          disabled={disabled}
          label={endLabel}
          value={end}
          format={t('dateFormatString.long')}
          minDate={start ? start : range?.start}
          maxDate={range?.end}
          onChange={endChanged}
          slotProps={{
            actionBar: {
              actions: ['clear', 'cancel', 'accept'],
            },
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
