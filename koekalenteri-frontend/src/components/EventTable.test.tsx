import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import { parseISO } from 'date-fns'
import { EventEx } from 'koekalenteri-shared/model'

import { emptyEvent } from '../api/test-utils/emptyEvent'
import theme from '../assets/Theme'

import { EventTable } from './EventTable'

describe('EventTable', () => {
  it('should render with empty result', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <EventTable events={[]} />
      </ThemeProvider>,
    )
    expect(container).toMatchSnapshot()
  })

  it('should render', async function() {
    const event: EventEx = {
      ...emptyEvent,
      startDate: parseISO('2021-02-10'),
      endDate: parseISO('2021-02-11'),

      isEntryUpcoming: false,
      isEntryOpen: false,
      isEntryClosing: false,
      isEntryClosed: false,

      isEventUpcoming: false,
      isEventOngoing: false,
      isEventOver: true,
    }
    const { container } = render(
      <ThemeProvider theme={theme}>
        <EventTable events={[event]} />
      </ThemeProvider>,
    )
    expect(container).toMatchSnapshot()
  })

  it('should render registration link', async function() {
    const event = {
      ...emptyEvent,
      id: 'eventID',
      eventType: 'TestType',

      isEntryUpcoming: false,
      isEntryOpen: true,
      isEntryClosing: false,
      isEntryClosed: false,

      isEventUpcoming: true,
      isEventOngoing: false,
      isEventOver: true,

    }
    render(
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <EventTable events={[event]} />
        </MemoryRouter>
      </ThemeProvider>)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/event/TestType/eventID')
  })
})
