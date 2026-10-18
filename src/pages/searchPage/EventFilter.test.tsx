import type { UserEvent } from '@testing-library/user-event/dist/types/setup/setup'
import type { Judge, Organizer, RegistrationClass } from '../../types'
import type { FilterProps } from '../state'
import { ThemeProvider } from '@mui/material'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { screen, within } from '@testing-library/react'
import { useState } from 'react'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { addMonths, dayOf, TIME_ZONE } from '../../lib/day'
import { describeInTimeZone } from '../../test-utils/timeZone'
import { createMatchMedia, flushPromises, renderWithUserEvents, typeDateKeyByKey } from '../../test-utils/utils'
import { EventFilter } from './EventFilter'

const judges: Judge[] = [
  {
    district: 'Piiri',
    email: 'n/a',
    eventTypes: ['NOU', 'NOME-B'],
    id: 123,
    languages: ['fi', 'se'],
    location: 'Ranua',
    name: 'Tuomari 1',
    phone: 'n/a',
  },
  {
    district: 'Piiri',
    email: 'n/a',
    eventTypes: ['NOU'],
    id: 234,
    languages: ['fi'],
    location: 'Lohja',
    name: 'Tuomari 2',
    phone: 'n/a',
  },
]

const organizers: Organizer[] = [
  {
    id: '1',
    name: 'Järjestäjä 1',
  },
  {
    id: '2',
    name: 'Järjestäjä 2',
  },
]

const eventTypes = ['NOU', 'NOME-B', 'NOME-A', 'NOWT', 'NKM']
const eventClasses: RegistrationClass[] = ['ALO', 'AVO', 'VOI']

const renderComponent = (
  filter: FilterProps,
  onChange?: (filter: FilterProps) => void,
  fakeTimers: boolean = false,
  eventCount: number = 0
) => {
  return renderWithUserEvents(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <EventFilter
          eventCount={eventCount}
          judges={judges}
          organizers={organizers}
          filter={filter}
          eventTypes={eventTypes}
          eventClasses={eventClasses}
          onChange={onChange}
        />
      </LocalizationProvider>
    </ThemeProvider>,
    undefined,
    fakeTimers ? { advanceTimers: vi.advanceTimersByTime } : undefined
  )
}

/** A parent that keeps the filter EventFilter reports and hands it back, as the search page does. */
const StatefulEventFilter = ({ initial }: { readonly initial: FilterProps }) => {
  const [filter, setFilter] = useState(initial)
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <EventFilter
          eventCount={0}
          judges={judges}
          organizers={organizers}
          filter={filter}
          eventTypes={eventTypes}
          eventClasses={eventClasses}
          onChange={setFilter}
        />
      </LocalizationProvider>
    </ThemeProvider>
  )
}

describe('EventFilter', () => {
  beforeAll(() => {
    window.matchMedia = createMatchMedia(1200)
  })
  it('should render', () => {
    renderComponent(
      {
        end: null,
        eventClass: ['ALO'],
        eventType: ['NOME-B'],
        judge: ['Tuomari 2'],
        organizer: ['2'],
        start: null,
      },
      undefined,
      false,
      3
    )

    expect(screen.getByTestId('filter.eventType')).toHaveTextContent(/NOME-B/i)
    expect(screen.getByTestId('filter.eventClass')).toHaveTextContent(/ALO/i)
    expect(screen.getByTestId('judge')).toHaveTextContent(/Tuomari 2/i)
    expect(screen.getByTestId('filter.organizer')).toHaveTextContent(/Järjestäjä 2/i)
    expect(screen.getByText(/filter.results count/)).toBeInTheDocument()
  })

  it('makes the filter header one button and one tab stop', async () => {
    const { user } = renderComponent({
      end: null,
      eventClass: [],
      eventType: [],
      judge: [],
      organizer: [],
      start: null,
    })

    const header = screen.getByRole('button', { expanded: true, name: /filter.title/ })
    // A focusable control inside the header is a button inside a button (axe nested-interactive,
    // KOE-1560): a second tab stop that does nothing the header does not already do.
    expect(within(header).queryByRole('button')).not.toBeInTheDocument()

    await user.tab()
    expect(header).toHaveFocus()
    await user.tab()
    expect(header).not.toHaveFocus()
    expect(header.contains(document.activeElement)).toBe(false)

    await user.tab({ shift: true })
    expect(header).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(header).toHaveAttribute('aria-expanded', 'false')
    await user.keyboard(' ')
    expect(header).toHaveAttribute('aria-expanded', 'true')
  })

  // Helper function for AutocompleteMulti components
  async function changeAutocompleteValue(user: UserEvent, testId: string, value: string) {
    const autocomplete = screen.getByTestId(testId)
    const input = within(autocomplete).getByRole('combobox')

    // Click and type in one action
    await user.click(input)
    await user.type(input, value)

    // Use a more specific selector for the dropdown option
    const option = await screen.findByText(value, { selector: 'li' }, { timeout: 1000 })
    await user.click(option)
  }

  it('should fire onChange for autocomplete fields', async () => {
    const changeHandler = vi.fn()
    const { user } = renderComponent(
      { end: null, eventClass: [], eventType: [], judge: [], organizer: [], start: null },
      changeHandler
    )

    await changeAutocompleteValue(user, 'filter.eventClass', 'VOI')
    expect(changeHandler).toHaveBeenCalledTimes(1)

    await changeAutocompleteValue(user, 'judge', 'Tuomari 1')
    expect(changeHandler).toHaveBeenCalledTimes(2)

    await changeAutocompleteValue(user, 'filter.organizer', 'Järjestäjä 1')
    expect(changeHandler).toHaveBeenCalledTimes(3)
  }, 20000)

  it('should fire onChange for switches', async () => {
    const changeHandler = vi.fn()
    const { user } = renderComponent(
      { end: null, eventClass: [], eventType: [], judge: [], organizer: [], start: null },
      changeHandler
    )

    // Test switches first since they're more reliable
    await user.click(screen.getByLabelText('entryOpen'))
    expect(changeHandler).toHaveBeenCalledTimes(1)

    await user.click(screen.getByLabelText('entryUpcoming'))
    expect(changeHandler).toHaveBeenCalledTimes(2)
  })

  it('widens the range backwards when the results switch is turned on', async () => {
    // Frozen in winter time, six months back in summer time: the start is the Finnish midnight either way.
    vi.useFakeTimers({ now: new Date('2026-11-20T10:00:00.000Z'), toFake: ['Date'] })
    try {
      const changeHandler = vi.fn()
      const today = dayOf(new Date(), TIME_ZONE)
      const { user } = renderComponent(
        { end: null, eventClass: [], eventType: [], judge: [], organizer: [], start: today },
        changeHandler
      )

      await user.click(screen.getByLabelText('filter.resultsPublished'))

      // Results exist only on ended events; with the default range starting today the filter would
      // show nothing, so the start date moves back and stays visible for the user to adjust.
      expect(changeHandler).toHaveBeenLastCalledWith(
        expect.objectContaining({ start: '2026-05-20', withResults: true })
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves a range the user already widened alone', async () => {
    const changeHandler = vi.fn()
    const start = addMonths(dayOf(new Date(), TIME_ZONE), -1)
    const { user } = renderComponent(
      { end: null, eventClass: [], eventType: [], judge: [], organizer: [], start },
      changeHandler
    )

    await user.click(screen.getByLabelText('filter.resultsPublished'))

    expect(changeHandler).toHaveBeenCalledWith(expect.objectContaining({ start, withResults: true }))
  })

  it('should fire onChange for date picker and switches', async () => {
    vi.useFakeTimers()
    const changeHandler = vi.fn()
    const { user } = renderComponent(
      { end: null, eventClass: [], eventType: [], judge: [], organizer: [], start: null },
      changeHandler,
      true
    )

    const dateInputs = screen.getAllByLabelText('Choose date', { exact: false })
    await user.click(dateInputs[0])
    const dialog = await screen.findByRole('dialog')
    const day25 = within(dialog).getByRole('gridcell', { name: '25' })
    await user.click(day25)

    // DateRange uses a debounced onChange (100ms) via `useDebouncedCallback()`.
    vi.advanceTimersByTime(150)

    await flushPromises()

    expect(changeHandler).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  // A boundary test: the range starts on 1.1.2020, so 31.12.2019 is refused and 1.1.2020 is taken. The
  // bound used to be a local Date made when the module loaded, which fell on 31.12.2019 in Tokyo; the
  // module loads here in the machine's zone, so this does not catch that (KOE-1548).
  describe('the first day of the range', () => {
    describeInTimeZone('Asia/Tokyo', () => {
      beforeEach(() => vi.useFakeTimers())
      afterEach(() => vi.useRealTimers())

      it.each([
        { expected: null, keys: '31122019' },
        { expected: '2020-01-01', keys: '01012020' },
      ])('takes $expected for a start typed as $keys (KOE-1548)', async ({ expected, keys }) => {
        const changeHandler = vi.fn()
        const { user } = renderComponent(
          { end: null, eventClass: [], eventType: [], judge: [], organizer: [], start: null },
          changeHandler,
          true
        )
        await typeDateKeyByKey(user, screen.getByRole('group', { name: 'daterangeStart' }), keys)

        expect(changeHandler).toHaveBeenLastCalledWith(expect.objectContaining({ start: expected }))
      })
    })
  })

  // The picker's dates are midnight of the browser's day, so this reads as Finnish days in a browser
  // in Finland's time zone, whatever zone the machine running it is in.
  describeInTimeZone(TIME_ZONE, () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('keeps the typed days in the filter, both ends of the same day (KOE-1538)', async () => {
      const changeHandler = vi.fn()
      const { user } = renderComponent(
        { end: null, eventClass: [], eventType: [], judge: [], organizer: [], start: '2026-10-31' },
        changeHandler,
        true
      )
      await typeDateKeyByKey(user, screen.getByRole('group', { name: 'daterangeEnd' }), '31102026')

      expect(changeHandler).toHaveBeenLastCalledWith(
        expect.objectContaining({ end: '2026-10-31', start: '2026-10-31' })
      )
    })

    it('stores no start when the start date is cleared', async () => {
      const changeHandler = vi.fn()
      const { user } = renderComponent(
        {
          end: null,
          eventClass: [],
          eventType: [],
          judge: [],
          organizer: [],
          start: '2026-10-31',
        },
        changeHandler,
        true
      )
      const startDay = screen
        .getByRole('group', { name: 'daterangeStart' })
        .querySelector<HTMLElement>('[role="spinbutton"]')
      if (!startDay) throw new Error('Start date day section not found')

      await user.click(startDay)
      await user.keyboard('{Control>}a{/Control}{Backspace}')
      await flushPromises()

      expect(changeHandler).toHaveBeenLastCalledWith(expect.objectContaining({ end: null, start: null }))
    })

    it('keeps a leap day typed over a start the filter stored (KOE-1538)', async () => {
      const { user } = renderWithUserEvents(
        <StatefulEventFilter
          initial={{
            end: null,
            eventClass: [],
            eventType: [],
            judge: [],
            organizer: [],
            start: '2031-01-01',
          }}
        />,
        undefined,
        { advanceTimers: vi.advanceTimersByTime }
      )
      const group = screen.getByRole('group', { name: 'daterangeStart' })
      // As the search page's e2e helper types a date: empty the field from its year, then type.
      const typeOver = async (keys: string) => {
        await user.click(within(group).getByRole('spinbutton', { name: 'Year' }))
        await user.keyboard('{Backspace}')
        await flushPromises()
        await typeDateKeyByKey(user, group, keys)
      }

      // A January in a year with no 29 February: the day and month of the next date are typed while
      // the field still builds on 2031, and 29.02 does not exist in it.
      await typeOver('01012031')
      expect(group).toHaveTextContent('01.01.2031')

      await typeOver('29022028')
      expect(group).toHaveTextContent('29.02.2028')
    })
  })
})
