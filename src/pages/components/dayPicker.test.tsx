import type { DayKey } from '../../types'
import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { localDateOf } from '../../lib/day'
import { describeInTimeZone } from '../../test-utils/timeZone'
import { useDayField } from './dayPicker'

/** The field over a day held in state, as the forms hold it, with the setter watched. */
const renderField = (initial: DayKey | undefined) => {
  const setDay = vi.fn()
  const hook = renderHook(() => {
    const [day, setState] = useState(initial)
    const field = useDayField(day, (next) => {
      setDay(next)
      setState(next)
    })
    return { ...field, setState }
  })
  const change = (picked: Date | null) => act(() => hook.result.current.onChange(picked))
  return { change, hook, setDay }
}

// The picker's Dates are the browser's; the field takes back only the day it shows (KOE-1548).
describe.each(['Europe/Helsinki', 'America/New_York', 'Asia/Tokyo'])('useDayField in %s', (zone) => {
  describeInTimeZone(zone, () => {
    it('shows a day as its local midnight and stores a picked day as its key', () => {
      const { change, hook, setDay } = renderField('2021-01-01')
      expect(hook.result.current.value).toEqual(localDateOf('2021-01-01'))

      change(new Date(2021, 0, 2))

      expect(setDay).toHaveBeenLastCalledWith('2021-01-02')
      expect(hook.result.current.value).toEqual(new Date(2021, 0, 2))
    })

    it('stores no day for a cleared field', () => {
      const { change, hook, setDay } = renderField('2021-01-01')

      change(null)

      expect(setDay).toHaveBeenLastCalledWith(undefined)
      expect(hook.result.current.value).toBeNull()
    })

    it.each([
      ['a half-typed date', () => new Date(Number.NaN)],
      ['a year still being typed', () => new Date('0202-01-01T00:00:00')],
    ])('stores nothing for %s, and an empty field shows what is typed', (_name, picked) => {
      const { change, hook, setDay } = renderField(undefined)

      change(picked())

      expect(setDay).not.toHaveBeenCalled()
      expect(hook.result.current.value).toEqual(picked())
    })

    it('keeps showing the stored day while a field with a value is typed over', () => {
      const { change, hook, setDay } = renderField('2021-01-01')

      change(new Date(Number.NaN))

      expect(setDay).not.toHaveBeenCalled()
      expect(hook.result.current.value).toEqual(localDateOf('2021-01-01'))

      // What was typed over a value is not kept: once the form empties the day, the field is empty.
      act(() => hook.result.current.setState(undefined))
      expect(hook.result.current.value).toBeNull()
    })
  })
})
