import type { DayKey } from '../../types'
import type { DayValue, Props } from './DateRange'
import { TZDate } from '@date-fns/tz'
import { DatePicker } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { screen } from '@testing-library/react'
import { useState } from 'react'
import { locales } from '../../i18n'
import { TIME_ZONE, toDayKey } from '../../lib/day'
import { noonOfFinnishDay } from '../../test-utils/finnishDays'
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
  const handleChange = (start: DayValue, end: DayValue) => {
    setRange({ end, start })
    onChange?.(start, end)
  }
  return <DateRange {...props} end={range.end} onChange={handleChange} start={range.start} />
}

/** A day of October 2026, the month the calendars open on. */
const oct = (day: number): DayKey => toDayKey(2026, 10, day)

describe('DateRange', () => {
  it('should render labels', () => {
    renderComponent({
      end: '2021-02-01',
      endLabel: 'End Label',
      start: '2021-01-01',
      startLabel: 'Start Label',
    })

    expect(screen.getAllByText('Start Label')).toHaveLength(2)
    expect(screen.getAllByText('End Label')).toHaveLength(2)
  })

  it('should render labels when required', () => {
    renderComponent({
      end: '2021-02-01',
      endLabel: 'End Label',
      required: true,
      start: '2021-01-01',
      startLabel: 'Start Label',
    })

    expect(screen.getAllByText('Start Label')).toHaveLength(1)
    expect(screen.getAllByText('End Label')).toHaveLength(1)
    expect(screen.getAllByText('*')).toHaveLength(2)
  })

  // The days have no zone, so a browser west or east of Finland shows and reports the same ones
  // (KOE-1539, KOE-1548), whatever zone the machine running the tests is in.
  describe.each([TIME_ZONE, 'America/New_York', 'Asia/Tokyo'])('interactions in %s', (zone) => {
    describeInTimeZone(zone, () => {
      // A fixed day, so that the calendar of an empty field opens on the month the tests click in.
      beforeAll(() => vi.useFakeTimers({ now: noonOfFinnishDay(oct(10)) }))
      afterAll(() => vi.useRealTimers())

      it('should onChange when selecting dates by mouse', async () => {
        const changeHandler = vi.fn()

        const { startCalendar, endCalendar, user } = renderComponent({
          end: null,
          endLabel: 'end',
          onChange: changeHandler,
          start: oct(1),
          startLabel: 'start',
        })

        await user.click(startCalendar)

        await screen.findByRole('dialog', { hidden: false })
        await user.click(screen.getByRole('gridcell', { name: '15' }))
        await flushPromises()

        expect(changeHandler).toHaveBeenCalledWith(oct(15), null)

        await user.click(endCalendar)
        await screen.findByRole('dialog', { hidden: false })
        await user.click(screen.getByRole('gridcell', { name: '16' }))
        await flushPromises()

        expect(changeHandler).toHaveBeenCalledTimes(2)
        // as we are not persisting the changes, start resets to original value
        expect(changeHandler).toHaveBeenCalledWith(oct(1), oct(16))
      })

      it('should not allow selecting dates outside of range', async () => {
        const changeHandler = vi.fn()

        const { startCalendar, user } = renderComponent({
          end: null,
          endLabel: 'end',
          onChange: changeHandler,
          range: { end: oct(20), start: oct(10) },
          start: oct(1),
          startLabel: 'start',
        })

        await user.click(startCalendar)
        await screen.findByRole('dialog', { hidden: false })

        expect(screen.getByRole('gridcell', { name: '9' })).toBeDisabled()
        expect(screen.getByRole('gridcell', { name: '10' })).toBeEnabled()
        expect(screen.getByRole('gridcell', { name: '20' })).toBeEnabled()
        expect(screen.getByRole('gridcell', { name: '21' })).toBeDisabled()

        await user.click(screen.getByRole('gridcell', { name: '15' }))
        await flushPromises()

        expect(changeHandler).toHaveBeenCalledWith(oct(15), null)
      })

      it('marks the default day in the calendar of an empty field', async () => {
        const { startCalendar, user } = renderComponent({
          defaultStart: oct(20),
          end: null,
          endLabel: 'end',
          start: null,
          startLabel: 'start',
        })

        await user.click(startCalendar)
        await screen.findByRole('dialog', { hidden: false })

        expect(screen.getByRole('gridcell', { name: '20' })).toHaveStyle({ borderWidth: '2px' })
        expect(screen.getByRole('gridcell', { name: '21' })).not.toHaveStyle({ borderWidth: '2px' })
      })

      it('should onChange when typing dates', async () => {
        const changeHandler = vi.fn()

        const { user } = renderComponent({
          end: null,
          endLabel: 'end',
          onChange: changeHandler,
          start: oct(1),
          startLabel: 'start',
        })

        // The picker field is a group of per-section spinbuttons now, not one text input: a date is
        // typed into the first section, which then carries the rest of it.
        const startDay = screen.getAllByRole('spinbutton')[0]
        await user.click(startDay)
        await user.keyboard('{Control>}a{/Control}')
        await user.paste('15.10.2026')
        await flushPromises()

        expect(changeHandler).toHaveBeenLastCalledWith(oct(15), null)

        const endDay = screen.getByRole('group', { name: 'end' }).querySelector<HTMLElement>('[role="spinbutton"]')
        if (!endDay) throw new Error('End date day section not found')
        await user.click(endDay)
        await user.keyboard('{Control>}a{/Control}')
        await user.paste('16.10.2026')
        await flushPromises()

        // as we are not persisting the changes, start resets to original value
        expect(changeHandler).toHaveBeenLastCalledWith(oct(1), oct(16))
      })

      it('shows a day key as that day and reports the picked day as a key (KOE-1548)', async () => {
        const changeHandler = vi.fn()
        const { startCalendar, user } = renderComponent({
          end: null,
          endLabel: 'end',
          onChange: changeHandler,
          start: '2026-10-06',
          startLabel: 'start',
        })

        expect(screen.getByRole('group', { name: 'start' })).toHaveTextContent('06.10.2026')

        await user.click(startCalendar)
        await screen.findByRole('dialog', { hidden: false })
        await user.click(screen.getByRole('gridcell', { name: '7' }))
        await flushPromises()

        expect(changeHandler).toHaveBeenLastCalledWith('2026-10-07', null)
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
        // A person's pace: the range's debounce runs out between the keys. The year's first digit
        // makes year 2, a whole date before the start, which used to empty the field (KOE-1481).
        const { changeHandler, group } = await typeInto('end', '28102026', { end: null, start: oct(10) })

        expect(group).toHaveTextContent('28.10.2026')
        expect(changeHandler).toHaveBeenLastCalledWith(oct(10), oct(28))
      })

      // A bound is a whole day, both ends included: no time of day can push a typed day out (KOE-1538).
      const sameDayCases = [
        {
          case: 'an end typed on the day of the start',
          expected: [oct(31), oct(31)],
          field: 'end',
          keys: '31102026',
          props: { end: null, start: oct(31) },
        },
        {
          case: 'a start typed on the first day of the range',
          expected: [oct(31), null],
          field: 'start',
          keys: '31102026',
          props: { end: null, range: { start: oct(31) }, start: null },
        },
        {
          case: 'a start moved to the last day of the range',
          expected: [oct(31), null],
          field: 'start',
          keys: '31',
          props: { end: null, range: { end: oct(31) }, start: oct(30) },
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
        { case: 'the day before the range starts', keys: '30102026', range: { start: oct(31) } },
        { case: 'the day after the range ends', keys: '31102026', range: { end: oct(30) } },
      ])('refuses a start typed on $case (KOE-1538)', async ({ keys, range }) => {
        const { changeHandler } = await typeInto('start', keys, { end: null, range, start: null })

        expect(changeHandler).not.toHaveBeenCalledWith(expect.any(String), null)
        expect(changeHandler).toHaveBeenLastCalledWith(null, null)
      })

      it('shows the day of a value, not one of the browser zone (KOE-1539)', () => {
        renderComponent({ end: oct(17), endLabel: 'end', start: oct(16), startLabel: 'start' })

        expect(screen.getByRole('group', { name: 'start' })).toHaveTextContent('16.10.2026')
        expect(screen.getByRole('group', { name: 'end' })).toHaveTextContent('17.10.2026')
      })

      it('accepts the same day typed for the end as the start has (KOE-1538, KOE-1539)', async () => {
        const { changeHandler, group } = await typeInto('end', '16102026', { end: null, start: oct(16) })

        expect(group).toHaveTextContent('16.10.2026')
        expect(changeHandler).toHaveBeenLastCalledWith(oct(16), oct(16))
      })

      it('refuses an end typed on the day before the start (KOE-1539)', async () => {
        const { changeHandler } = await typeInto('end', '15102026', { end: null, start: oct(16) })

        expect(changeHandler).toHaveBeenLastCalledWith(oct(16), null)
      })

      it('refuses an end before a start that is later than the range start', async () => {
        const { changeHandler } = await typeInto('end', '15102026', {
          end: null,
          range: { start: oct(10) },
          start: oct(16),
        })

        expect(changeHandler).toHaveBeenLastCalledWith(oct(16), null)
      })

      it('refuses a whole date in a year no day key spells', async () => {
        const { changeHandler } = await typeInto('start', '01011050', { end: null, start: null })

        expect(changeHandler).not.toHaveBeenCalledWith(expect.any(String), null)
        expect(changeHandler).toHaveBeenLastCalledWith(null, null)
      })

      it('should not allow setting the end date before the current start date', async () => {
        const changeHandler = vi.fn()

        const { user } = renderComponent({
          end: oct(16),
          endLabel: 'end',
          onChange: changeHandler,
          start: oct(15),
          startLabel: 'start',
        })

        const endDay = screen.getByRole('group', { name: 'end' }).querySelector<HTMLElement>('[role="spinbutton"]')
        if (!endDay) throw new Error('End date day section not found')
        await user.click(endDay)
        await user.keyboard('01')
        await flushPromises()

        // the invalid, out-of-order value is rejected: end falls back to its previous value
        expect(changeHandler).toHaveBeenCalledWith(oct(15), oct(16))
        expect(changeHandler).not.toHaveBeenCalledWith(oct(15), oct(1))
      })

      it.runIf(zone === 'America/New_York')(
        "shows the browser zone's day whatever timezone the picker is given: the adapter has no zone support (KOE-1539)",
        () => {
          renderWithUserEvents(
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
              <DatePicker
                label="day"
                timezone={TIME_ZONE}
                value={new Date(new TZDate(2026, 9, 16, TIME_ZONE).getTime())}
              />
            </LocalizationProvider>
          )

          expect(screen.getByRole('group', { name: 'day' })).toHaveTextContent('15.10.2026')
        }
      )
    })
  })
})
