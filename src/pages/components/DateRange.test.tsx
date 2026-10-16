import type { DateValue, Props } from './DateRange'
import { TZDate } from '@date-fns/tz'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { screen } from '@testing-library/react'
import { addDays, format, parseISO, startOfDay, startOfMonth } from 'date-fns'
import { useState } from 'react'
import { locales } from '../../i18n'
import { TIME_ZONE } from '../../i18n/dates'
import { flushPromises, renderWithUserEvents } from '../../test-utils/utils'
import DateRange from './DateRange'

const renderComponent = (props: Props) => {
  const res = renderWithUserEvents(
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
      <DateRange {...props} />
    </LocalizationProvider>,
    undefined,
    { advanceTimers: vi.advanceTimersByTime }
  )

  const inputs = screen.getAllByRole('group')
  const buttons = screen.getAllByTestId('CalendarIcon')
  return { ...res, endCalendar: buttons[1], endInput: inputs[1], startCalendar: buttons[0], startInput: inputs[0] }
}

/** A parent that keeps what DateRange reports, as the search page and the event form do. */
const StatefulDateRange = ({ onChange, ...props }: Props) => {
  const [range, setRange] = useState({ end: props.end, start: props.start })
  const handleChange = (start: DateValue, end: DateValue) => {
    setRange({ end, start })
    onChange?.(start, end)
  }
  return <DateRange {...props} end={range.end} onChange={handleChange} start={range.start} />
}

describe('DateRange', () => {
  it('should render labels', () => {
    renderComponent({
      end: parseISO('2021-02-01T12:00:00Z'),
      endLabel: 'End Label',
      // Avoid `parseISO('YYYY-MM-DD')` (timezone-dependent).
      start: parseISO('2021-01-01T12:00:00Z'),
      startLabel: 'Start Label',
    })

    expect(screen.getAllByText('Start Label')).toHaveLength(2)
    expect(screen.getAllByText('End Label')).toHaveLength(2)
  })

  it('should render labels when required', () => {
    renderComponent({
      end: parseISO('2021-02-01T12:00:00Z'),
      endLabel: 'End Label',
      required: true,
      // Avoid `parseISO('YYYY-MM-DD')` (timezone-dependent).
      start: parseISO('2021-01-01T12:00:00Z'),
      startLabel: 'Start Label',
    })

    expect(screen.getAllByText('Start Label')).toHaveLength(1)
    expect(screen.getAllByText('End Label')).toHaveLength(1)
    expect(screen.getAllByText('*')).toHaveLength(2)
  })

  describe('interactions', () => {
    const date = new Date()
    const start = startOfMonth(date)
    const day15 = new Date(date.getFullYear(), date.getMonth(), 15)
    const day16 = new Date(date.getFullYear(), date.getMonth(), 16)
    const day15String = format(day15, 'dd.MM.yyyy')
    const day16String = format(day16, 'dd.MM.yyyy')

    beforeAll(() => vi.useFakeTimers())
    afterAll(() => vi.useRealTimers())

    it('should onChange when selecting dates by mouse', async () => {
      const changeHandler = vi.fn()

      const { startCalendar, endCalendar, user } = renderComponent({
        end: null,
        endLabel: 'end',
        onChange: changeHandler,
        start,
        startLabel: 'start',
      })

      await user.click(startCalendar)

      await screen.findByRole('dialog', { hidden: false })
      const btn15 = screen.getByRole('gridcell', { name: '15' })
      await user.click(btn15)
      await flushPromises()

      expect(changeHandler).toHaveBeenCalled()
      expect(changeHandler).toHaveBeenCalledWith(day15, null)

      await user.click(endCalendar)
      await screen.findByRole('dialog', { hidden: false })
      const btn16 = screen.getByRole('gridcell', { name: '16' })
      await user.click(btn16)
      await flushPromises()

      expect(changeHandler).toHaveBeenCalledTimes(2)
      // as we are not persisting the changes, start resets to original value
      expect(changeHandler).toHaveBeenCalledWith(start, day16)
    })

    it('should not allow selecting dates outside of range', async () => {
      const changeHandler = vi.fn()
      const range = {
        end: new Date(date.getFullYear(), date.getMonth(), 20),
        start: new Date(date.getFullYear(), date.getMonth(), 10),
      }

      const { startCalendar, user } = renderComponent({
        end: null,
        endLabel: 'end',
        onChange: changeHandler,
        range,
        start,
        startLabel: 'start',
      })

      await user.click(startCalendar)
      await screen.findByRole('dialog', { hidden: false })

      const btn9 = screen.getByRole('gridcell', { name: '9' })
      expect(btn9).toBeDisabled()

      const btn21 = screen.getByRole('gridcell', { name: '21' })
      expect(btn21).toBeDisabled()

      const btn15 = screen.getByRole('gridcell', { name: '15' })
      await user.click(btn15)
      await flushPromises()

      expect(changeHandler).toHaveBeenCalledWith(day15, null)
    })

    it('should onChange when typing dates', async () => {
      const changeHandler = vi.fn()

      const { user } = renderComponent({
        end: null,
        endLabel: 'end',
        onChange: changeHandler,
        start,
        startLabel: 'start',
      })

      // The picker field is a group of per-section spinbuttons now, not one text input: a date is
      // typed into the first section, which then carries the rest of it.
      const startDay = screen.getAllByRole('spinbutton')[0]
      await user.click(startDay)
      await user.keyboard('{Control>}a{/Control}')
      await user.paste(day15String)
      await flushPromises()

      expect(changeHandler).toHaveBeenLastCalledWith(day15, null)

      const endDay = screen.getByRole('group', { name: 'end' }).querySelector<HTMLElement>('[role="spinbutton"]')
      if (!endDay) throw new Error('End date day section not found')
      await user.click(endDay)
      await user.keyboard('{Control>}a{/Control}')
      await user.paste(day16String)
      await flushPromises()

      // as we are not persisting the changes, start resets to original value
      expect(changeHandler).toHaveBeenLastCalledWith(start, day16)
    })

    it('keeps a date typed into the empty end date one key at a time (KOE-1481)', async () => {
      const changeHandler = vi.fn()
      const today = startOfDay(date)
      const target = addDays(today, 18)
      const { user } = renderWithUserEvents(
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <StatefulDateRange end={null} endLabel="end" onChange={changeHandler} start={today} startLabel="start" />
        </LocalizationProvider>,
        undefined,
        { advanceTimers: vi.advanceTimersByTime }
      )
      const endGroup = screen.getByRole('group', { name: 'end' })
      const endDay = endGroup.querySelector<HTMLElement>('[role="spinbutton"]')
      if (!endDay) throw new Error('End date day section not found')

      await user.click(endDay)
      // A person's pace: the range's debounce runs out between the keys. The year's first digit
      // makes year 2, a whole date before the start, which used to empty the field (KOE-1481).
      for (const key of format(target, 'ddMMyyyy')) {
        await user.keyboard(key)
        await flushPromises()
      }

      expect(endGroup).toHaveTextContent(format(target, 'dd.MM.yyyy'))
      expect(changeHandler).toHaveBeenLastCalledWith(today, target)
    })

    const lastDayOfOctober = new Date(2026, 9, 31)
    /**
     * A moment of a Finnish October day, as the callers' bounds are (zonedStartOfDay, zonedEndOfDay),
     * as a plain Date: a TZDate would become the picker's reference and carry its zone into the typed value.
     */
    const finnish = (day: number, hours = 0, minutes = 0, seconds = 0) =>
      new Date(new TZDate(2026, 9, day, hours, minutes, seconds, TIME_ZONE).getTime())

    /** Renders a StatefulDateRange and types `keys` into the field one key at a time, as a person does. */
    const typeInto = async (field: 'start' | 'end', keys: string, props: Pick<Props, 'end' | 'range' | 'start'>) => {
      const changeHandler = vi.fn()
      const { user } = renderWithUserEvents(
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <StatefulDateRange endLabel="end" onChange={changeHandler} startLabel="start" {...props} />
        </LocalizationProvider>,
        undefined,
        { advanceTimers: vi.advanceTimersByTime }
      )
      const group = screen.getByRole('group', { name: field })
      const day = group.querySelector<HTMLElement>('[role="spinbutton"]')
      if (!day) throw new Error(`${field} date day section not found`)

      await user.click(day)
      for (const key of keys) {
        await user.keyboard(key)
        await flushPromises()
      }
      return { changeHandler, group }
    }

    const sameDayCases = [
      {
        // The search page: emptying the start and typing the year digit by digit leaves the start at
        // 23:55:55 of the typed day (the year passes through 2, 20 and 202 in local mean time).
        case: 'an end typed on the day of a start that has a late time',
        expected: [finnish(31, 23, 55, 55), lastDayOfOctober],
        field: 'end',
        keys: '31102026',
        props: { end: null, start: finnish(31, 23, 55, 55) },
      },
      {
        case: 'a start typed on the first day of a range that starts later that day',
        expected: [lastDayOfOctober, null],
        field: 'start',
        keys: '31102026',
        props: { end: null, range: { start: finnish(31, 12) }, start: null },
      },
      {
        // A field with a value keeps its time when the day is edited.
        case: 'a start moved to the last day of a range that ends earlier that day',
        expected: [new Date(2026, 9, 31, 20), null],
        field: 'start',
        keys: '31',
        props: { end: null, range: { end: finnish(31, 12) }, start: new Date(2026, 9, 30, 20) },
      },
    ] as const

    it.each(sameDayCases.map((c) => [c.case, c] as const))(
      'keeps %s (KOE-1538)',
      async (_, { expected, field, keys, props }) => {
        const { changeHandler, group } = await typeInto(field, keys, props)

        expect(group).toHaveTextContent('31.10.2026')
        expect(changeHandler).toHaveBeenLastCalledWith(...expected)
      }
    )

    it.each([
      { case: 'the day before the range starts', keys: '30102026', range: { start: finnish(31, 12) } },
      { case: 'the day after the range ends', keys: '31102026', range: { end: finnish(30, 12) } },
    ])('refuses a start typed on $case (KOE-1538)', async ({ keys, range }) => {
      const { changeHandler } = await typeInto('start', keys, { end: null, range, start: null })

      expect(changeHandler).not.toHaveBeenCalledWith(expect.any(Date), null)
      expect(changeHandler).toHaveBeenLastCalledWith(null, null)
    })

    /** Sets the zone the browser's dates are read in; undefined gives the system's own back. */
    const systemTimeZone = process.env.TZ
    const setTimeZone = (timeZone: string | undefined) => {
      if (timeZone === undefined) Reflect.deleteProperty(process.env, 'TZ')
      else process.env.TZ = timeZone
    }

    describe('in a browser west of Finland', () => {
      beforeAll(() => setTimeZone('America/New_York'))
      afterAll(() => setTimeZone(systemTimeZone))

      it('refuses a start typed on the Finnish day before the range starts (KOE-1538)', async () => {
        // EntrySection's range starts at zonedStartOfDay(createdAt): 16.10. 00:00 in Finland is
        // 15.10. 17:00 in New York, the same local day as the 15.10. typed there.
        const { changeHandler } = await typeInto('start', '15102026', {
          end: null,
          range: { start: finnish(16) },
          start: null,
        })

        expect(changeHandler).not.toHaveBeenCalledWith(new Date(2026, 9, 15), null)
        expect(changeHandler).toHaveBeenLastCalledWith(null, null)
      })
    })

    describe('in a browser east of Finland', () => {
      beforeAll(() => setTimeZone('Asia/Tokyo'))
      afterAll(() => setTimeZone(systemTimeZone))

      it('keeps a start typed on the Finnish day the range starts (KOE-1538)', async () => {
        // 16.10. 00:00 typed in Tokyo is 15.10. 18:00 in Finland, but the day typed is the 16th.
        const { changeHandler, group } = await typeInto('start', '16102026', {
          end: null,
          range: { start: finnish(16) },
          start: null,
        })

        expect(group).toHaveTextContent('16.10.2026')
        expect(changeHandler).toHaveBeenLastCalledWith(new Date(2026, 9, 16), null)
      })

      it('refuses an end typed on the day before the start its field shows (KOE-1538)', async () => {
        // The start shows 16.10., which is 15.10. 18:00 in Finland: an end on the 15th is still a day early.
        const start = new Date(2026, 9, 16)
        const { changeHandler } = await typeInto('end', '15102026', { end: null, start })

        expect(changeHandler).not.toHaveBeenCalledWith(start, new Date(2026, 9, 15))
        expect(changeHandler).toHaveBeenLastCalledWith(start, null)
      })
    })

    it('should not allow setting the end date before the current start date', async () => {
      const changeHandler = vi.fn()

      const { user } = renderComponent({
        end: day16,
        endLabel: 'end',
        onChange: changeHandler,
        start: day15,
        startLabel: 'start',
      })

      const earlierDate = new Date(date.getFullYear(), date.getMonth(), 1)
      const endDay = screen.getByRole('group', { name: 'end' }).querySelector<HTMLElement>('[role="spinbutton"]')
      if (!endDay) throw new Error('End date day section not found')
      await user.click(endDay)
      await user.keyboard(format(earlierDate, 'dd'))
      await flushPromises()

      // the invalid, out-of-order value is rejected: end falls back to its previous value
      expect(changeHandler).toHaveBeenCalledWith(day15, day16)
      expect(changeHandler).not.toHaveBeenCalledWith(day15, earlierDate)
    })
  })
})
