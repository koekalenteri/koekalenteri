import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import { parseISO } from 'date-fns'
import { Event } from 'koekalenteri-shared/model'
import { RecoilRoot } from 'recoil'

import { eventWithEntryOpen } from '../../__mockData__/events'
import { emptyEvent } from '../../api/test-utils/emptyEvent'
import theme from '../../assets/Theme'

import { EventTable } from './EventTable'

describe('EventTable', () => {
  it('should render with empty result', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <RecoilRoot>
          <EventTable events={[]} />
        </RecoilRoot>
      </ThemeProvider>
    )
    expect(container).toMatchSnapshot()
  })

  it('should render', async function () {
    const event: Event = {
      ...emptyEvent,
      startDate: parseISO('2021-02-10'),
      endDate: parseISO('2021-02-11'),
    }
    const { container } = render(
      <ThemeProvider theme={theme}>
        <RecoilRoot>
          <EventTable events={[event]} />
        </RecoilRoot>
      </ThemeProvider>
    )
    expect(container).toMatchSnapshot()
  })

  it('should render registration link', async function () {
    render(
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <RecoilRoot>
            <EventTable events={[eventWithEntryOpen]} />
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
