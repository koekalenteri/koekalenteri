import type { Theme } from '@mui/material'
import Box from '@mui/material/Box'
import FormControl from '@mui/material/FormControl'
import { DatePicker } from '@mui/x-date-pickers'
import { format, isSameDay, isValid } from 'date-fns'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import useDebouncedCallback from '../../hooks/useDebouncedCallback'
import { formatDate, zonedParseDate, zonedStartOfDay } from '../../i18n/dates'

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

/**
 * The picker reads and writes days in the browser's zone (AdapterDateFns has no zone support: its
 * `timezone` is ignored), while the callers' values are Finnish days. These two are the one place
 * where the two meet (KOE-1539): the picker is given the browser-local calendar day with the
 * Finnish day's year, month and date, and what it reports is read as the Finnish day with the
 * year, month and date it shows.
 */
function toPickerDay(d: Date): Date
function toPickerDay(d: Date | undefined): Date | undefined
function toPickerDay(d: Date | undefined): Date | undefined {
  if (!d || !isValid(d)) return d
  const [year, month, day] = formatDate(d, 'yyyy-MM-dd').split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** The moment the day shown by the picker starts in Finland. */
const fromPickerDay = (d: DateValue): DateValue => (d && isValid(d) ? zonedParseDate(format(d, 'yyyy-MM-dd')) : d)

/** The Finnish day `d` falls on, as the moment it starts: the callers' bounds and what they store are Finnish days. */
const finnishDay = (d: Date) => zonedStartOfDay(d).getTime()

/** Whether `d` falls on a Finnish day before the one `min` falls on. */
const isDayBefore = (d: Date, min: DateValue | undefined) => !!min && finnishDay(d) < finnishDay(min)

/** Whether `d` falls on a Finnish day after the one `max` falls on. */
const isDayAfter = (d: Date, max: DateValue | undefined) => !!max && finnishDay(d) > finnishDay(max)

/**
 * The bounds are compared by day, not by instant: the picker offers every day from minDate to
 * maxDate, and a date typed on the start's day is 00:00 while the start may carry a later time
 * (KOE-1538). Every value is read as the Finnish day its moment falls on, as the callers' bounds
 * are (EntrySection's range runs from zonedStartOfDay to zonedEndOfDay) and as they store what they
 * get, so what is accepted here is what they save. In a browser in Finland's time zone that is the
 * day the picker shows.
 */
const coerceToDateValue = (
  d: DateValue,
  range: { start?: Date; end?: Date } | undefined,
  otherEnd: { min?: DateValue },
  fallback: DateValue
): DateValue => {
  if (!d) return d

  if (!isValid(d)) return fallback
  if (isDayBefore(d, range?.start) || isDayAfter(d, range?.end)) return fallback
  if (isDayBefore(d, otherEnd.min)) return fallback

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
  const shown = value ? toPickerDay(value) : typed
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
  const startChanged = useDebouncedCallback((picked: DateValue) => {
    if (isYearBeingTyped(picked)) return
    const date = fromPickerDay(picked)
    onChange?.(accept(date, coerceToDateValue(date, range, {}, start), typedStart.untrack), end)
  })
  const endChanged = useDebouncedCallback((picked: DateValue) => {
    if (isYearBeingTyped(picked)) return
    const date = fromPickerDay(picked)
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
          referenceDate={toPickerDay(defaultStart)}
          disabled={startDisabled}
          label={startLabel}
          value={typedStart.shown}
          format={t('dateFormatString.long')}
          minDate={toPickerDay(range?.start)}
          maxDate={toPickerDay(range?.end)}
          onChange={handleStartChange}
          slotProps={{
            actionBar: {
              actions: ['clear', 'cancel', 'accept'],
            },
            day: ({ day, isDaySelected }) => ({ sx: dayStyle(day, isDaySelected, toPickerDay(defaultStart)) }),
            textField: { error: startError, helperText: startHelperText, required },
            toolbar: {
              hidden: true,
            },
          }}
        />
      </FormControl>

      <FormControl sx={{ flex: '1 1 200px' }}>
        <DatePicker
          referenceDate={toPickerDay(defaultEnd)}
          disabled={endDisabled}
          label={endLabel}
          value={typedEnd.shown}
          format={t('dateFormatString.long')}
          minDate={toPickerDay(start ?? range?.start)}
          maxDate={toPickerDay(range?.end)}
          onChange={handleEndChange}
          slotProps={{
            actionBar: {
              actions: ['clear', 'cancel', 'accept'],
            },
            day: ({ day, isDaySelected }) => ({ sx: dayStyle(day, isDaySelected, toPickerDay(defaultEnd)) }),
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
