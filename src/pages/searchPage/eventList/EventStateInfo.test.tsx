import type { ComponentProps, ReactNode } from 'react'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { addDays } from 'date-fns'
import { MemoryRouter } from 'react-router'
import { eventWithStaticDates } from '@/__mockData__/events'
import theme from '@/assets/Theme'
import { locales } from '@/i18n'
import { EventStateInfo } from './EventStateInfo'

function Wrapper({ children }: { readonly children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <MemoryRouter>{children} </MemoryRouter>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

type StateInfoEvent = ComponentProps<typeof EventStateInfo>['event']

/**
 * A classless event a month ahead: its dates open nothing, so the workflow state and
 * the flags alone decide the row. The dates count from today, so the fixture never ages into the past.
 */
const eventOf = (fields: Partial<StateInfoEvent>): StateInfoEvent => {
  const startDate = addDays(new Date(), 30)
  return {
    classes: [],
    endDate: addDays(startDate, 1),
    id: 'test-id',
    startDate,
    state: 'confirmed',
    ...fields,
  }
}

/** The same event held in 2021: past dates carry a valid state to the start list by themselves. */
const heldIn2021 = (fields: Partial<StateInfoEvent>): StateInfoEvent => eventOf({ ...eventWithStaticDates, ...fields })

describe('EventStateInfo', () => {
  it('should render start list link for invited event', () => {
    render(<EventStateInfo event={eventOf({ startListPublished: true, state: 'invited' })} />, {
      wrapper: Wrapper,
    })

    expect(screen.getByText('viewStartList')).toBeInTheDocument()
  })

  it('shows a loading indicator and prevents another click while the start list is loading', async () => {
    const user = userEvent.setup()
    render(<EventStateInfo event={eventOf({ startListPublished: true, state: 'invited' })} />, { wrapper: Wrapper })

    const startListLink = screen.getByRole('link', { name: 'viewStartList' })
    await user.click(startListLink)

    expect(screen.getByRole('progressbar', { name: 'loading' })).toBeInTheDocument()
    expect(startListLink).toHaveAttribute('aria-disabled', 'true')
  })

  it('says the start list is live while a post is being run', () => {
    render(<EventStateInfo event={eventOf({ startListPublished: true, state: 'invited' })} live />, {
      wrapper: Wrapper,
    })

    expect(screen.getByText('liveStatus.title')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'viewStartList' })).toBeInTheDocument()
  })

  it('should render start list link when a class-specific start list is published', () => {
    render(<EventStateInfo event={eventOf({ startListPublished: { ALO: true, AVO: false }, state: 'invited' })} />, {
      wrapper: Wrapper,
    })

    expect(screen.getByText('viewStartList')).toBeInTheDocument()
  })

  it('should render start list link when a published class is invited even if event is confirmed', () => {
    const event = eventOf({
      classes: [
        { class: 'ALO', state: 'invited' },
        { class: 'AVO', state: 'picked' },
      ],
      startListPublished: { ALO: true, AVO: true },
      state: 'confirmed',
    })
    render(<EventStateInfo event={event} />, { wrapper: Wrapper })

    expect(screen.getByText('viewStartList')).toBeInTheDocument()
  })

  it('should not render start list link when a sparse class-specific map omits unpublished classes', () => {
    const event = eventOf({
      classes: [{ class: 'ALO' }, { class: 'AVO' }],
      startListPublished: { ALO: false },
      state: 'invited',
    })
    render(<EventStateInfo event={event} />, { wrapper: Wrapper })

    expect(screen.queryByText('viewStartList')).not.toBeInTheDocument()
  })

  it('should render start list link for started event', () => {
    render(<EventStateInfo event={eventOf({ startListPublished: true, state: 'started' })} />, {
      wrapper: Wrapper,
    })

    expect(screen.getByText('viewStartList')).toBeInTheDocument()
  })

  it('links to the results of a classless event its dates have carried past the invitations (KOE-1504)', () => {
    // The secretary never sent the invitations, so the state stayed 'picked': only the dates open
    // the start list, and a component that dropped them showed the plain state text instead.
    const event = heldIn2021({ resultsPublished: true, startListPublished: true, state: 'picked' })
    render(<EventStateInfo event={event} />, { wrapper: Wrapper })

    expect(screen.getByRole('link', { name: 'viewResults' })).toBeInTheDocument()
  })

  it('shows no link for a classless event left picked whose day has not come', () => {
    // The flag alone does not open it: neither the state nor the dates have reached the invitations.
    const event = eventOf({ startListPublished: true, state: 'picked' })
    render(<EventStateInfo event={event} text={'entry closed'} />, { wrapper: Wrapper })

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('entry closed')).toBeInTheDocument()
  })

  it('should render state info for tenatative event', () => {
    render(<EventStateInfo event={eventOf({ state: 'tentative' })} />, { wrapper: Wrapper })

    expect(screen.getByText('event.states.tentative_info')).toBeInTheDocument()
  })

  it('should render state info for cancelled event', () => {
    render(<EventStateInfo event={eventOf({ state: 'cancelled' })} />, { wrapper: Wrapper })

    expect(screen.getByText('event.states.cancelled_info')).toBeInTheDocument()
  })

  it('should render text', () => {
    render(<EventStateInfo event={heldIn2021({ state: 'confirmed' })} text={'anything'} />, {
      wrapper: Wrapper,
    })

    expect(screen.getByText('anything')).toBeInTheDocument()
  })
})
