import type { DogEvent } from '../../types'
import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import { parseISO } from 'date-fns'
import { MemoryRouter } from 'react-router'
import { RecoilRoot } from 'recoil'
import { emptyEvent } from '../../__mockData__/emptyEvent'
import { eventWithEntryOpen } from '../../__mockData__/events'
import theme from '../../assets/Theme'
import { EventList } from './EventList'

jest.mock('../../api/judge')

describe('EventList', () => {
  it('should render with empty result', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <RecoilRoot>
          <EventList events={[]} />
        </RecoilRoot>
      </ThemeProvider>
    )
    expect(container).toMatchSnapshot()
  })

  it('should render', async () => {
    const event: DogEvent = {
      ...emptyEvent,
      endDate: parseISO('2021-02-11'),
      startDate: parseISO('2021-02-10'),
    }
    const { container } = render(
      <ThemeProvider theme={theme}>
        <RecoilRoot>
          <EventList events={[event]} />
        </RecoilRoot>
      </ThemeProvider>
    )
    expect(container).toMatchSnapshot()
  })

  it('should render registration link', async () => {
    render(
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <RecoilRoot>
            <EventList events={[eventWithEntryOpen]} />
          </RecoilRoot>
        </MemoryRouter>
      </ThemeProvider>
    )
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      `/event/${eventWithEntryOpen.eventType}/${eventWithEntryOpen.id}`
    )
  })
})
