import type { Theme } from '@mui/material'
import Box from '@mui/material/Box'
import FormControl from '@mui/material/FormControl'
import { DatePicker } from '@mui/x-date-pickers'
import { isSameDay, isValid } from 'date-fns'
import { useState } from 'react'
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
  otherEnd: { min?: DateValue; max?: DateValue },
  fallback: DateValue
): DateValue => {
  if (!d) return d

  if (!isValid(d)) return fallback
  if (range?.start && d < range.start) return fallback
  if (range?.end && d > range.end) return fallback
  if (otherEnd.min && d < otherEnd.min) return fallback
  if (otherEnd.max && d > otherEnd.max) return fallback

  return d
}

/**
 * A year of fewer than four digits is still being typed: the field turns the first digit of 2026
 * into year 2, a whole and valid date. It is not passed on until the year is whole (KOE-1481).
 */
const isYearBeingTyped = (d: DateValue) => !!d && isValid(d) && d.getFullYear() < 1000

/**
 * What is being typed into an empty field. The picker empties a field whose value stays null after
 * it reported a whole date, so year 2, which the range does not take, used to wipe the day and
 * month typed before it (KOE-1481). While the value is null the field shows this instead; a field
 * with a value keeps what is typed into it without help.
 */
const useTypedIntoEmpty = (value: DateValue) => {
  const [typed, setTyped] = useState<DateValue>(null)
  const shown = value ?? typed
  const track = (date: DateValue) => setTyped(value ? null : date)
  return { shown, track, untrack: () => setTyped(null) }
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
  const typedStart = useTypedIntoEmpty(start)
  const typedEnd = useTypedIntoEmpty(end)

  /** A whole date the range rejects falls back to the old value, and an empty field empties again. */
  const accept = (date: DateValue, coerced: DateValue, untrack: () => void) => {
    if (coerced !== date && isValid(date)) untrack()
    return coerced
  }
  const startChanged = useDebouncedCallback((date: DateValue) => {
    if (isYearBeingTyped(date)) return
    onChange?.(accept(date, coerceToDateValue(date, range, {}, start), typedStart.untrack), end)
  })
  const endChanged = useDebouncedCallback((date: DateValue) => {
    if (isYearBeingTyped(date)) return
    onChange?.(start, accept(date, coerceToDateValue(date, range, { min: start }, end), typedEnd.untrack))
  })
  const handleStartChange = (date: DateValue) => {
    typedStart.track(date)
    startChanged(date)
  }
  const handleEndChange = (date: DateValue) => {
    typedEnd.track(date)
    endChanged(date)
  }

  return (
    // Side by side where both fit with their labels readable, one under the other on a phone.
    <Box sx={{ columnGap: 1, display: 'flex', flexWrap: 'wrap', rowGap: 1, width: '100%' }}>
      <FormControl sx={{ flex: '1 1 200px' }}>
        <DatePicker
          referenceDate={defaultStart}
          disabled={startDisabled}
          label={startLabel}
          value={typedStart.shown}
          format={t('dateFormatString.long')}
          minDate={range?.start}
          maxDate={range?.end}
          onChange={handleStartChange}
          slotProps={{
            actionBar: {
              actions: ['clear', 'cancel', 'accept'],
            },
            day: ({ day, isDaySelected }) => ({ sx: dayStyle(day, isDaySelected, defaultStart) }),
            textField: { error: startError, helperText: startHelperText, required },
            toolbar: {
              hidden: true,
            },
          }}
        />
      </FormControl>

      <FormControl sx={{ flex: '1 1 200px' }}>
        <DatePicker
          referenceDate={defaultEnd}
          disabled={endDisabled}
          label={endLabel}
          value={typedEnd.shown}
          format={t('dateFormatString.long')}
          minDate={start ?? range?.start}
          maxDate={range?.end}
          onChange={handleEndChange}
          slotProps={{
            actionBar: {
              actions: ['clear', 'cancel', 'accept'],
            },
            day: ({ day, isDaySelected }) => ({ sx: dayStyle(day, isDaySelected, defaultEnd) }),
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
