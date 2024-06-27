import type { Judge, Organizer, RegistrationClass } from '../../types'
import type { FilterProps } from '../recoil'

import { ThemeProvider } from '@mui/material'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { fireEvent, render, screen, within } from '@testing-library/react'

import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { createMatchMedia } from '../../test-utils/utils'

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

const renderComponent = (filter: FilterProps, onChange?: (filter: FilterProps) => void) =>
  render(
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
    </ThemeProvider>
  )

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

  function changeAutocompleteValue(testId: string, value: string) {
    const autocomplete = screen.getByTestId(testId)
    const input = within(autocomplete).getByRole('combobox')
    autocomplete.focus()
    fireEvent.change(input, { target: { value } })
    fireEvent.keyDown(autocomplete, { key: 'ArrowDown' })
    fireEvent.keyDown(autocomplete, { key: 'Enter' })
  }

  it('It should fire onChange', async () => {
    const changeHandler = jest.fn()
    renderComponent({ start: null, end: null, eventType: [], eventClass: [], judge: [], organizer: [] }, changeHandler)

    changeAutocompleteValue('filter.eventType', 'NOME-A')
    expect(changeHandler).toHaveBeenCalledTimes(1)

    changeAutocompleteValue('filter.eventClass', 'VOI')
    expect(changeHandler).toHaveBeenCalledTimes(2)

    changeAutocompleteValue('judge', 'Tuomari 1')
    expect(changeHandler).toHaveBeenCalledTimes(3)

    changeAutocompleteValue('filter.organizer', 'Järjestäjä 1')
    expect(changeHandler).toHaveBeenCalledTimes(4)

    /*
  const dateInputs = screen.getAllByLabelText('Choose date', { exact: false })
  fireEvent.click(dateInputs[0])
  await screen.findByRole('dialog')
  fireEvent.click(screen.getByLabelText('25', { exact: false }))
  expect(changeHandler).toHaveBeenCalledTimes(5)
  */

    fireEvent.click(screen.getByLabelText('entryOpen'))
    expect(changeHandler).toHaveBeenCalledTimes(5)

    fireEvent.click(screen.getByLabelText('entryUpcoming'))
    expect(changeHandler).toHaveBeenCalledTimes(6)
  })
})
