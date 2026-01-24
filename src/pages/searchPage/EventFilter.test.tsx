import type { UserEvent } from '@testing-library/user-event/dist/types/setup/setup'
import type { Judge, Organizer, RegistrationClass } from '../../types'
import type { FilterProps } from '../recoil'

import { ThemeProvider } from '@mui/material'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { screen, within } from '@testing-library/react'

import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { createMatchMedia, flushPromises, renderWithUserEvents } from '../../test-utils/utils'

import { EventFilter } from './EventFilter'

const judges: Judge[] = [
  {
    name: 'Tuomari 1',
    id: 123,
    location: 'Ranua',
    district: 'Piiri',
    phone: 'n/a',
    email: 'n/a',
    languages: ['fi', 'se'],
    eventTypes: ['NOU', 'NOME-B'],
  },
  {
    name: 'Tuomari 2',
    id: 234,
    location: 'Lohja',
    district: 'Piiri',
    phone: 'n/a',
    email: 'n/a',
    languages: ['fi'],
    eventTypes: ['NOU'],
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
  fakeTimers: boolean = false
) => {
  return renderWithUserEvents(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <EventFilter
          judges={judges}
          organizers={organizers}
          filter={filter}
          eventTypes={eventTypes}
          eventClasses={eventClasses}
          onChange={onChange}
        ></EventFilter>
      </LocalizationProvider>
    </ThemeProvider>,
    undefined,
    fakeTimers ? { advanceTimers: jest.advanceTimersByTime } : undefined
  )
}

describe('EventFilter', () => {
  beforeAll(() => {
    window.matchMedia = createMatchMedia(1200)
  })
  it('should render', () => {
    renderComponent({
      start: null,
      end: null,
      eventType: ['NOME-B'],
      eventClass: ['ALO'],
      judge: ['Tuomari 2'],
      organizer: ['2'],
    })

    expect(screen.getByTestId('filter.eventType')).toHaveTextContent(/NOME-B/i)
    expect(screen.getByTestId('filter.eventClass')).toHaveTextContent(/ALO/i)
    expect(screen.getByTestId('judge')).toHaveTextContent(/Tuomari 2/i)
    expect(screen.getByTestId('filter.organizer')).toHaveTextContent(/Järjestäjä 2/i)
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
    const changeHandler = jest.fn()
    const { user } = renderComponent(
      { start: null, end: null, eventType: [], eventClass: [], judge: [], organizer: [] },
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
    const changeHandler = jest.fn()
    const { user } = renderComponent(
      { start: null, end: null, eventType: [], eventClass: [], judge: [], organizer: [] },
      changeHandler
    )

    // Test switches first since they're more reliable
    await user.click(screen.getByLabelText('entryOpen'))
    expect(changeHandler).toHaveBeenCalledTimes(1)

    await user.click(screen.getByLabelText('entryUpcoming'))
    expect(changeHandler).toHaveBeenCalledTimes(2)
  })

  it('should fire onChange for date picker and switches', async () => {
    jest.useFakeTimers()
    const changeHandler = jest.fn()
    const { user } = renderComponent(
      { start: null, end: null, eventType: [], eventClass: [], judge: [], organizer: [] },
      changeHandler,
      true
    )

    const dateInputs = screen.getAllByLabelText('Choose date', { exact: false })
    await user.click(dateInputs[0])
    const dialog = await screen.findByRole('dialog')
    const day25 = within(dialog).getByRole('gridcell', { name: '25' })
    await user.click(day25)

    // DateRange uses a debounced onChange (100ms) via `useDebouncedCallback()`.
    jest.advanceTimersByTime(150)

    await flushPromises()

    expect(changeHandler).toHaveBeenCalledTimes(1)

    jest.useRealTimers()
  })
})
