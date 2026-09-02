import { ThemeProvider } from '@mui/material'
import { fireEvent, screen } from '@testing-library/react'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import {
  eventWithEntryClosed,
  eventWithEntryNotYetOpen,
  eventWithEntryOpenButNoEntries,
  eventWithParticipantsInvited,
} from '../../__mockData__/events'
import theme from '../../assets/Theme'
import { AtomObserver, flushPromises, renderWithUserEvents, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import EventListPage, { canViewEvent, getEventDoubleClickPath } from './EventListPage'
import { adminEventIdAtom } from './state'

vi.mock('../../api/event')
vi.mock('../../api/judge')
vi.mock('../../api/organizer')
vi.mock('../../api/registration')
vi.mock('../../api/user')

describe('EventListPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('renders', async () => {
    const onChange = vi.fn()
    const { container, user } = renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <AtomObserver node={adminEventIdAtom} onChange={onChange} />
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <ConfirmProvider>
                  <EventListPage />
                </ConfirmProvider>
              </SnackbarProvider>
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>,
      undefined,
      { advanceTimers: vi.advanceTimersByTime }
    )
    await flushPromises()
    expect(container).toMatchSnapshot()

    const rows = screen.getAllByRole('row')
    expect(rows.length).toBeGreaterThan(1)

    await user.click(rows[1])
    await flushPromises()

    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenCalledWith(undefined)
    expect(onChange).toHaveBeenCalledWith('testEntryClosed')
  })

  it('keeps the page mounted when a row is selected', async () => {
    // A suspending read of the selected event would swap the whole page for the Suspense fallback,
    // dropping the grid's scroll position and focus on every selection.
    const Fallback = vi.fn(() => <div>loading...</div>)
    renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <Provider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            // localStorage survives from the previous test; start with nothing selected so the click changes it.
            set(adminEventIdAtom, undefined)
          }}
        >
          <MemoryRouter>
            <Suspense fallback={<Fallback />}>
              <SnackbarProvider>
                <ConfirmProvider>
                  <EventListPage />
                </ConfirmProvider>
              </SnackbarProvider>
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>,
      undefined,
      { advanceTimers: vi.advanceTimersByTime }
    )
    await flushPromises()
    const fallbackRendersWhileLoading = Fallback.mock.calls.length

    // fireEvent commits the click's render before the microtask queue runs, the way a browser does;
    // userEvent's awaits would let a pending promise settle first and hide the suspension.
    const rows = screen.getAllByRole('row')
    fireEvent.click(rows[1])
    await flushPromises()

    expect(rows[1]).toHaveClass('Mui-selected')
    expect(Fallback).toHaveBeenCalledTimes(fallbackRendersWhileLoading)
  })

  it('selects the double-click destination based on entry start and event state', () => {
    expect(getEventDoubleClickPath(eventWithEntryOpenButNoEntries, eventWithEntryOpenButNoEntries.entryStartDate)).toBe(
      '/admin/event/view/test3'
    )
    expect(getEventDoubleClickPath(eventWithEntryClosed)).toBe('/admin/event/view/testEntryClosed')

    const justBeforeEntryStarts = new Date(eventWithEntryNotYetOpen.entryStartDate.valueOf() - 1)
    expect(getEventDoubleClickPath(eventWithEntryNotYetOpen, justBeforeEntryStarts)).toBe('/admin/event/edit/test4')
    expect(getEventDoubleClickPath({ ...eventWithEntryNotYetOpen, entries: 1 }, justBeforeEntryStarts)).toBe(
      '/admin/event/view/test4'
    )
    expect(getEventDoubleClickPath(eventWithParticipantsInvited, eventWithParticipantsInvited.entryStartDate)).toBe(
      '/admin/event/view/testInvited'
    )

    expect(getEventDoubleClickPath({ ...eventWithEntryOpenButNoEntries, state: 'draft' })).toBe(
      '/admin/event/edit/test3'
    )
  })

  it('only enables the registrations view for confirmed events', () => {
    expect(canViewEvent(eventWithEntryOpenButNoEntries)).toBe(true)
    expect(canViewEvent({ ...eventWithEntryOpenButNoEntries, state: 'draft' })).toBe(false)
  })
})
