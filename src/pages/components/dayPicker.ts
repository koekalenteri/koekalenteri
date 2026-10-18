import type { DayKey } from '../../types'
import { isValid } from 'date-fns/isValid'
import { useState } from 'react'
import { localDateOf, pickedDayOf } from '../../lib/day'

/*
 * What the date pickers share (KOE-1548). MUI's picker reads and writes days in the browser's zone
 * (AdapterDateFns has no zone support: its `timezone` is ignored), while the callers' values are days
 * with no zone. A picker is given the browser's midnight of the key's year, month and date
 * (`localDateOf`), and of what it reports only the day it shows is taken back (`pickedDayOf` in
 * `lib/day`), so no time of day or zone ever reaches a caller (KOE-1538, KOE-1539).
 */

/** What a picker itself holds and reports: a browser-local Date, or nothing. */
export type PickerValue = Date | null

/** The picker's Date for a day, or undefined for none. */
export const pickerDate = (day: DayKey | undefined) => (day ? localDateOf(day) : undefined)

/**
 * A year of fewer than four digits is still being typed: the field turns the first digit of 2026
 * into year 2, a whole and valid date. It is not passed on until the year is whole (KOE-1481).
 */
export const isYearBeingTyped = (d: PickerValue) => !!d && isValid(d) && d.getFullYear() < 1000

/**
 * What is being typed into an empty field. The picker empties a field whose value stays null after
 * it reported a whole date, so year 2, which no caller takes, used to wipe the day and month typed
 * before it (KOE-1481). While the value is empty the field shows this instead; a field with a value
 * keeps what is typed into it without help. `shown` is the picker's value.
 */
export const useTypedIntoEmpty = (value: DayKey | null | undefined) => {
  const [typed, setTyped] = useState<PickerValue>(null)
  const shown = pickerDate(value ?? undefined) ?? typed
  const track = (date: PickerValue) => setTyped(value ? null : date)
  return { shown, track, untrack: () => setTyped(null) }
}

/**
 * A picker for one day: its `value` and `onChange`. A cleared field sets no day; a value that is no
 * whole day yet (half typed, a year being typed, which `pickedDayOf` takes for none) is not passed
 * on, and the field keeps what is typed.
 */
export const useDayField = (day: DayKey | undefined, setDay: (day: DayKey | undefined) => void) => {
  const typed = useTypedIntoEmpty(day)
  const onChange = (picked: PickerValue) => {
    typed.track(picked)
    if (!picked) {
      setDay(undefined)
      return
    }
    const pickedDay = pickedDayOf(picked)
    if (pickedDay) setDay(pickedDay)
  }
  return { onChange, value: typed.shown }
}
