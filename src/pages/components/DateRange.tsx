import type { Theme } from '@mui/material'
import Box from '@mui/material/Box'
import FormControl from '@mui/material/FormControl'
import { DatePicker } from '@mui/x-date-pickers'
import { isSameDay, isValid } from 'date-fns'
import { useTranslation } from 'react-i18next'
import useDebouncedCallback from '../../hooks/useDebouncedCallback'

export type DateValue = Date | null

export interface Props {
  readonly defaultStart?: Date
  readonly defaultEnd?: Date
  readonly start: DateValue
  readonly startDisabled?: boolean
  readonly startLabel: string
  readonly startError?: boolean
  readonly startHelperText?: string
  readonly end: DateValue
  readonly endDisabled?: boolean
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

const coerceToDateValue = (
  d: DateValue,
  range: { start?: Date; end?: Date } | undefined,
  fallback: DateValue
): DateValue => {
  if (!d) return d

  if (!isValid(d)) return fallback
  if (range?.start && d < range.start) return fallback
  if (range?.end && d > range.end) return fallback

  return d
}

export default function DateRange({
  defaultEnd,
  defaultStart,
  end,
  endDisabled,
  endError,
  endHelperText,
  endLabel,
  range,
  required,
  start,
  startDisabled,
  startError,
  startHelperText,
  startLabel,
  onChange,
}: Props) {
  const { t } = useTranslation()
  const startChanged = useDebouncedCallback((date: DateValue) => onChange?.(coerceToDateValue(date, range, start), end))
  const endChanged = useDebouncedCallback((date: DateValue) => onChange?.(start, coerceToDateValue(date, range, end)))

  return (
    <Box sx={{ width: '100%' }}>
      <FormControl sx={{ pr: 0.5, width: '50%' }}>
        <DatePicker
          referenceDate={defaultStart}
          disabled={startDisabled}
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
            textField: { error: startError, helperText: startHelperText, required },
            toolbar: {
              hidden: true,
            },
          }}
        />
      </FormControl>

      <FormControl sx={{ pl: 0.5, width: '50%' }}>
        <DatePicker
          referenceDate={defaultEnd}
          disabled={endDisabled}
          label={endLabel}
          value={end}
          format={t('dateFormatString.long')}
          minDate={start ?? range?.start}
          maxDate={range?.end}
          onChange={endChanged}
          slotProps={{
            actionBar: {
              actions: ['clear', 'cancel', 'accept'],
            },
            day: ({ day, selected }) => ({ sx: dayStyle(day, selected, defaultEnd) }),
            textField: { error: endError, helperText: endHelperText, required },
            toolbar: {
              hidden: true,
            },
          }}
        />
      </FormControl>
    </Box>
  )
}
