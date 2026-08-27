import type { DogEvent } from '../../types'
import { ThemeProvider } from '@mui/material'
import { render, screen, within } from '@testing-library/react'
import { parseISO } from 'date-fns'
import { Provider } from 'jotai'
import { MemoryRouter } from 'react-router'
import { emptyEvent } from '../../__mockData__/emptyEvent'
import { eventWithEntryOpen } from '../../__mockData__/events'
import theme from '../../assets/Theme'
import { EventList } from './EventList'

vi.mock('../../api/judge')

describe('EventList', () => {
  it('should render with empty result', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <Provider>
          <EventList events={[]} />
        </Provider>
      </ThemeProvider>
    )
    expect(container).toMatchSnapshot()
  })

  it('should render', async () => {
    const event: DogEvent = {
      ...emptyEvent,
      // Avoid `parseISO('YYYY-MM-DD')` in tests (timezone-dependent).
      endDate: parseISO('2021-02-11T12:00:00Z'),
      startDate: parseISO('2021-02-10T12:00:00Z'),
    }
    const { container } = render(
      <ThemeProvider theme={theme}>
        <Provider>
          <EventList events={[event]} />
        </Provider>
      </ThemeProvider>
    )
    expect(container).toMatchSnapshot()
  })

  it('should render registration link', async () => {
    render(
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <Provider>
            <EventList events={[eventWithEntryOpen]} />
          </Provider>
        </MemoryRouter>
      </ThemeProvider>
    )
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      `/event/${eventWithEntryOpen.eventType}/${eventWithEntryOpen.id}`
    )
  })

  it('should strike through the location/name but not the organizer or cancelled label', async () => {
    const event: DogEvent = {
      ...emptyEvent,
      endDate: parseISO('2021-02-11T12:00:00Z'),
      location: 'Test Location',
      name: 'Test Event Name',
      startDate: parseISO('2021-02-10T12:00:00Z'),
      state: 'cancelled',
    }
    render(
      <ThemeProvider theme={theme}>
        <Provider>
          <EventList events={[event]} />
        </Provider>
      </ThemeProvider>
    )

    const header = within(screen.getByRole('heading'))
    expect(header.getByText(event.organizer.name)).not.toHaveStyle('text-decoration: line-through')
    expect(header.getByText('event.states.cancelled_info')).not.toHaveStyle('text-decoration: line-through')
    expect(header.getByText(event.location)).toHaveStyle('text-decoration: line-through')
    expect(header.getByText(event.name)).toHaveStyle('text-decoration: line-through')

    // The whole row should also be dimmed.
    expect(screen.getByRole('heading').closest('article')).toHaveStyle('opacity: 0.6')
  })
})
