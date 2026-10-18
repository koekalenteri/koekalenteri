import type { Theme } from '@mui/material'
import type { DayKey } from '../../types'
import type { PickerValue } from './dayPicker'
import Box from '@mui/material/Box'
import FormControl from '@mui/material/FormControl'
import { DatePicker } from '@mui/x-date-pickers'
import { isValid } from 'date-fns/isValid'
import { useTranslation } from 'react-i18next'
import useDebouncedCallback from '../../hooks/useDebouncedCallback'
import { pickedDayOf } from '../../lib/day'
import { isYearBeingTyped, pickerDate, useTypedIntoEmpty } from './dayPicker'

/** A day of the range, or none: what the callers give and get. */
export type DayValue = DayKey | null

export interface Props {
  readonly defaultStart?: DayKey
  readonly defaultEnd?: DayKey
  readonly start: DayValue
  readonly startDisabled?: boolean
  readonly startLabel: string
  readonly startError?: boolean
  readonly startHelperText?: string
  readonly end: DayValue
  readonly endDisabled?: boolean
  readonly endLabel: string
  readonly endError?: boolean
  readonly endHelperText?: string
  readonly range?: { start?: DayKey; end?: DayKey }
  readonly required?: boolean
  readonly onChange?: (start: DayValue, end: DayValue) => void
}

/** The first and last day a field takes, both included. */
interface Bounds {
  min?: DayKey
  max?: DayKey
}

/** The later of two days, either of which may be missing. */
const laterDay = (a: DayKey | undefined, b: DayKey | undefined) => (a && b && b > a ? b : (a ?? b))

const isOutside = (day: DayKey, { min, max }: Bounds) => (!!min && day < min) || (!!max && day > max)

/**
 * The day a picked value stands for: none for a cleared field, the old value for one that is not a
 * whole day or falls outside the bounds. Days compare as text: the picker offers every day from
 * minDate to maxDate, and what is accepted here is what the callers save.
 */
const coerceToDayValue = (picked: PickerValue, bounds: Bounds, fallback: DayValue): DayValue => {
  if (!picked) return null
  const day = pickedDayOf(picked)
  if (!day || isOutside(day, bounds)) return fallback
  return day
}

function dayStyle(date: Date, selected: boolean, defaultDay?: DayKey) {
  const isDefault = !!defaultDay && pickedDayOf(date) === defaultDay
  const hilight = isDefault && !selected
  return {
    border: hilight ? (theme: Theme) => `2px solid ${theme.palette.secondary.light}` : undefined,
  }
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
  const startBounds: Bounds = { max: range?.end, min: range?.start }
  // The end is never before the start.
  const endBounds: Bounds = { max: range?.end, min: laterDay(range?.start, start ?? undefined) }

  /** A whole date the bounds reject falls back to the old value, and an empty field empties again. */
  const accept = (picked: PickerValue, bounds: Bounds, fallback: DayValue, untrack: () => void) => {
    const day = coerceToDayValue(picked, bounds, fallback)
    if (picked && isValid(picked) && day !== pickedDayOf(picked)) untrack()
    return day
  }
  const startChanged = useDebouncedCallback((picked: PickerValue) => {
    if (isYearBeingTyped(picked)) return
    onChange?.(accept(picked, startBounds, start, typedStart.untrack), end)
  })
  const endChanged = useDebouncedCallback((picked: PickerValue) => {
    if (isYearBeingTyped(picked)) return
    onChange?.(start, accept(picked, endBounds, end, typedEnd.untrack))
  })
  const handleStartChange = (date: PickerValue) => {
    typedStart.track(date)
    startChanged(date)
  }
  const handleEndChange = (date: PickerValue) => {
    typedEnd.track(date)
    endChanged(date)
  }

  return (
    // Side by side where both fit with their labels readable, one under the other on a phone.
    <Box sx={{ columnGap: 1, display: 'flex', flexWrap: 'wrap', rowGap: 1, width: '100%' }}>
      <FormControl sx={{ flex: '1 1 200px' }}>
        <DatePicker
          referenceDate={pickerDate(defaultStart)}
          disabled={startDisabled}
          label={startLabel}
          value={typedStart.shown}
          format={t('dateFormatString.long')}
          minDate={pickerDate(startBounds.min)}
          maxDate={pickerDate(range?.end)}
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
          referenceDate={pickerDate(defaultEnd)}
          disabled={endDisabled}
          label={endLabel}
          value={typedEnd.shown}
          format={t('dateFormatString.long')}
          minDate={pickerDate(endBounds.min)}
          maxDate={pickerDate(range?.end)}
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
