import type { DateValue, Props } from './DateRange'
import { TZDate } from '@date-fns/tz'
import { DatePicker } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { screen } from '@testing-library/react'
import { parseISO } from 'date-fns'
import { useState } from 'react'
import { locales } from '../../i18n'
import { TIME_ZONE } from '../../i18n/dates'
import { describeInTimeZone } from '../../test-utils/timeZone'
import { flushPromises, renderWithUserEvents, typeDateKeyByKey } from '../../test-utils/utils'
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

  describe.each([TIME_ZONE, 'America/New_York', 'Asia/Tokyo'])('interactions in %s', (zone) => {
    describeInTimeZone(zone, () => {
      /**
       * A moment of a Finnish October 2026 day, as the callers' bounds are (zonedStartOfDay,
       * zonedEndOfDay), as a plain Date: a TZDate would become the picker's reference and carry its
       * zone into the typed value.
       */
      const finnish = (day: number, hours = 0, minutes = 0, seconds = 0) =>
        new Date(new TZDate(2026, 9, day, hours, minutes, seconds, TIME_ZONE).getTime())
      // A fixed day, so that the calendar of an empty field opens on the month the tests click in.
      beforeAll(() => vi.useFakeTimers({ now: finnish(10, 12) }))
      afterAll(() => vi.useRealTimers())
      const start = finnish(1)
      const day15 = finnish(15)
      const day16 = finnish(16)
      const day15String = '15.10.2026'
      const day16String = '16.10.2026'

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
          end: finnish(20),
          start: finnish(10),
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
        await typeDateKeyByKey(user, group, keys)
        return { changeHandler, group }
      }

      it('keeps a date typed into the empty end date one key at a time (KOE-1481)', async () => {
        const today = finnish(10)
        const target = finnish(28)
        // A person's pace: the range's debounce runs out between the keys. The year's first digit
        // makes year 2, a whole date before the start, which used to empty the field (KOE-1481).
        const { changeHandler, group } = await typeInto('end', '28102026', { end: null, start: today })

        expect(group).toHaveTextContent('28.10.2026')
        expect(changeHandler).toHaveBeenLastCalledWith(today, target)
      })

      // The days are Finnish days, so a browser west or east of Finland reads and reports the same ones
      // (KOE-1539), whatever zone the machine running the tests is in.
      const sameDayCases = [
        {
          // The search page: emptying the start and typing the year digit by digit leaves the start
          // at 23:55:55 of the typed day (the year passes through 2, 20 and 202 in local mean time).
          case: 'an end typed on the day of a start that has a late time',
          expected: [finnish(31, 23, 55, 55), finnish(31)],
          field: 'end',
          keys: '31102026',
          props: { end: null, start: finnish(31, 23, 55, 55) },
        },
        {
          case: 'a start typed on the first day of a range that starts later that day',
          expected: [finnish(31), null],
          field: 'start',
          keys: '31102026',
          props: { end: null, range: { start: finnish(31, 12) }, start: null },
        },
        {
          // What is reported is the Finnish day's start, whatever time the field had.
          case: 'a start moved to the last day of a range that ends earlier that day',
          expected: [finnish(31), null],
          field: 'start',
          keys: '31',
          props: { end: null, range: { end: finnish(31, 12) }, start: finnish(30, 20) },
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

      // The day after the range ends is a case the old comparison got wrong in Tokyo (31.10. 00:00 there
      // is 30.10. in Finland). The day before the range starts it refused anyway, as no zone's midnight
      // is a later Finnish day than the one typed: a regression guard.
      it.each([
        { case: 'the day before the range starts', keys: '30102026', range: { start: finnish(31, 12) } },
        { case: 'the day after the range ends', keys: '31102026', range: { end: finnish(30, 12) } },
      ])('refuses a start typed on $case (KOE-1538)', async ({ keys, range }) => {
        const { changeHandler } = await typeInto('start', keys, { end: null, range, start: null })

        expect(changeHandler).not.toHaveBeenCalledWith(expect.any(Date), null)
        expect(changeHandler).toHaveBeenLastCalledWith(null, null)
      })

      it("shows the Finnish day of a value, not the browser zone's (KOE-1539)", () => {
        renderComponent({ end: finnish(17, 23, 59, 59), endLabel: 'end', start: finnish(16), startLabel: 'start' })

        expect(screen.getByRole('group', { name: 'start' })).toHaveTextContent('16.10.2026')
        expect(screen.getByRole('group', { name: 'end' })).toHaveTextContent('17.10.2026')
      })

      it('accepts the same Finnish day typed for the end as the start has (KOE-1538, KOE-1539)', async () => {
        const { changeHandler, group } = await typeInto('end', '16102026', { end: null, start: finnish(16) })

        expect(group).toHaveTextContent('16.10.2026')
        expect(changeHandler).toHaveBeenLastCalledWith(finnish(16), finnish(16))
      })

      it('refuses an end typed on the Finnish day before the start (KOE-1539)', async () => {
        const { changeHandler } = await typeInto('end', '15102026', { end: null, start: finnish(16) })

        expect(changeHandler).toHaveBeenLastCalledWith(finnish(16), null)
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

        const earlierDate = finnish(1)
        const endDay = screen.getByRole('group', { name: 'end' }).querySelector<HTMLElement>('[role="spinbutton"]')
        if (!endDay) throw new Error('End date day section not found')
        await user.click(endDay)
        await user.keyboard('01')
        await flushPromises()

        // the invalid, out-of-order value is rejected: end falls back to its previous value
        expect(changeHandler).toHaveBeenCalledWith(day15, day16)
        expect(changeHandler).not.toHaveBeenCalledWith(day15, earlierDate)
      })

      it.runIf(zone === 'America/New_York')(
        "shows the browser zone's day whatever timezone the picker is given: the adapter has no zone support (KOE-1539)",
        () => {
          renderWithUserEvents(
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
              <DatePicker label="day" timezone={TIME_ZONE} value={finnish(16)} />
            </LocalizationProvider>
          )

          expect(screen.getByRole('group', { name: 'day' })).toHaveTextContent('15.10.2026')
        }
      )

      it('refuses a start typed on the Finnish day before the range starts (KOE-1538)', async () => {
        // A regression guard: EntrySection's range starts at zonedStartOfDay(createdAt), 16.10. 00:00 in
        // Finland, which is 15.10. 17:00 in New York, the same local day as the 15.10. typed there. The
        // instant comparison refused this too; no zone's midnight is a later Finnish day than the one typed.
        const { changeHandler } = await typeInto('start', '15102026', {
          end: null,
          range: { start: finnish(16) },
          start: null,
        })

        expect(changeHandler).not.toHaveBeenCalledWith(finnish(15), null)
        expect(changeHandler).toHaveBeenLastCalledWith(null, null)
      })
    })
  })
})
