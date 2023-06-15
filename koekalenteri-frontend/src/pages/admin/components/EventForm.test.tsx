import { ThemeProvider } from '@mui/material'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { fireEvent, render, screen, within } from '@testing-library/react'
import fi from 'date-fns/locale/fi'
import { Event, Judge, Official, Organizer } from 'koekalenteri-shared/model'
import { RecoilRoot } from 'recoil'

import { eventWithStaticDatesAndClass } from '../../../__mockData__/events'
import theme from '../../../assets/Theme'

import EventForm from './EventForm'

const eventTypes = [eventWithStaticDatesAndClass.eventType, 'TEST-B', 'TEST-C']
const eventTypeClasses = {
  [eventWithStaticDatesAndClass.eventType]: [eventWithStaticDatesAndClass.classes[0].class, 'B', 'C'],
  'TEST-B': ['B', 'C'],
  'TEST-C': [],
}

const JUDGES = [
  {
    id: eventWithStaticDatesAndClass.judges[0],
    name: 'Test Judge',
    email: 'joo@ei.com',
    phone: '0700-judge',
    location: 'Pohjois-Karjala',
    district: 'Pohjois-Karjalan Kennelpiiri ry',
    languages: ['fi'],
    eventTypes: [eventWithStaticDatesAndClass.eventType, 'TEST-C'],
  },
]

const OFFICIALS = [eventWithStaticDatesAndClass.official]
const ORGANIZERS = [eventWithStaticDatesAndClass.organizer]

const renderComponent = (
  event: Event,
  judges: Judge[],
  officials: Official[],
  organizers: Organizer[],
  onSave?: () => void,
  onCancel?: () => void,
  onChange?: () => void
) =>
  render(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={fi}>
        <RecoilRoot>
          <EventForm
            event={event}
            eventTypes={eventTypes}
            eventTypeClasses={eventTypeClasses}
            judges={judges}
            officials={officials}
            organizers={organizers}
            changes
            onSave={onSave}
            onCancel={onCancel}
            onChange={onChange}
          />
        </RecoilRoot>
      </LocalizationProvider>
    </ThemeProvider>
  )

describe('EventForm', () => {
  it('should render', () => {
    const { container } = renderComponent(eventWithStaticDatesAndClass, JUDGES, OFFICIALS, ORGANIZERS)
    expect(container).toMatchSnapshot()
  })

  it.skip('should fire onSave and onCancel', async () => {
    const saveHandler = jest.fn()
    const cancelHandler = jest.fn()
    const changeHandler = jest.fn()

    renderComponent(
      eventWithStaticDatesAndClass,
      JUDGES,
      OFFICIALS,
      ORGANIZERS,
      saveHandler,
      cancelHandler,
      changeHandler
    )

    const saveButton = screen.getByText(/Tallenna/i)
    // expect(saveButton).toBeDisabled()

    // Make a change to enable save button
    fireEvent.mouseDown(screen.getByLabelText(/eventType/i))
    fireEvent.click(within(screen.getByRole('listbox')).getByText(/TEST-C/i))
    expect(saveButton).toBeEnabled()

    fireEvent.click(saveButton)
    expect(saveHandler).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText(/Peruuta/i))
    expect(cancelHandler).toHaveBeenCalledTimes(1)
  })
})
