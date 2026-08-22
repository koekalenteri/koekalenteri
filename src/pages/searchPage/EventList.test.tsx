import type { DogEvent } from '../../types'
import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
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
})
