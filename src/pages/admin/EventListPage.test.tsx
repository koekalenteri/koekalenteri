import { ThemeProvider } from '@mui/material'
import { act, fireEvent, screen, within } from '@testing-library/react'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import {
  eventWithEntryClosed,
  eventWithEntryNotYetOpen,
  eventWithEntryOpenButNoEntries,
  eventWithParticipantsInvited,
} from '../../__mockData__/events'
import { putEvent } from '../../api/event'
import { getUser } from '../../api/user'
import theme from '../../assets/Theme'
import { Path } from '../../routeConfig'
import { expectConsoleOutput } from '../../test-utils/consoleGuard'
import { AtomObserver, flushPromises, renderSuspendedWithUserEvents, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import EventListPage, { canViewEvent, getEventDoubleClickPath } from './EventListPage'
import { adminEventIdAtom, adminEventsAtom, adminNewEventAtom } from './state'

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
    const { user } = await renderSuspendedWithUserEvents(
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

    const rows = screen.getAllByRole('row')
    expect(rows.length).toBeGreaterThan(1)

    await user.click(rows[1])
    await flushPromises()

    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenCalledWith(undefined)
    expect(onChange).toHaveBeenCalledWith('testEntryClosed')
  })

  const renderPage = () =>
    renderSuspendedWithUserEvents(
      <ThemeProvider theme={theme}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
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

  it('offers an admin the copy to another environment (KOE-1471)', async () => {
    await renderPage()
    await flushPromises()

    expect(screen.getByRole('button', { name: 'copyToEnvironment' })).toBeInTheDocument()
  })

  it('offers the copy to another environment to admins only', async () => {
    const admin = await getUser(TEST_ID_TOKEN)
    vi.mocked(getUser).mockResolvedValue({ ...admin, admin: false, roles: { org: 'admin' } })
    try {
      await renderPage()
      await flushPromises()

      expect(screen.getByRole('button', { name: 'copy' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'copyToEnvironment' })).not.toBeInTheDocument()
    } finally {
      vi.mocked(getUser)
        .mockReset()
        .mockImplementation(async () => admin)
    }
  })

  it('keeps the page mounted when a row is selected', async () => {
    // A suspending read of the selected event would swap the whole page for the Suspense fallback,
    // dropping the grid's scroll position and focus on every selection.
    const Fallback = vi.fn(() => <div>loading...</div>)
    await renderSuspendedWithUserEvents(
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

  it('opens the double-clicked row, with no click to select it first', async () => {
    // The handler used to navigate to whatever the selection state held, which a double click has
    // not yet settled: the first double click on a row did nothing at all.
    const Where = () => <div data-testid="where">{useLocation().pathname}</div>
    await renderSuspendedWithUserEvents(
      <ThemeProvider theme={theme}>
        <Provider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            set(adminEventIdAtom, undefined)
          }}
        >
          <MemoryRouter>
            <Where />
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

    const rows = screen.getAllByRole('row')
    // The double click navigates and something on the way suspends. fireEvent wraps the dispatch in
    // a synchronous act, which cannot wait for that and says so; an awaited act around it can.
    await act(async () => {
      fireEvent.doubleClick(rows[1])
    })
    await flushPromises()

    expect(screen.getByTestId('where')).toHaveTextContent(/^\/admin\/event\//)
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
  describe('toolbar actions', () => {
    // The draft and the selection live in localStorage; each case starts from its own.
    afterEach(() => localStorage.clear())

    const Where = () => <div data-testid="where">{useLocation().pathname}</div>

    const renderWith = (initialize: Parameters<typeof Provider>[0]['initializeState']) =>
      renderSuspendedWithUserEvents(
        <ThemeProvider theme={theme}>
          <Provider initializeState={initialize}>
            <MemoryRouter>
              <Where />
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

    it('opens a new event straight away when there is no draft', async () => {
      await renderWith(({ set }) => set(idTokenAtom, TEST_ID_TOKEN))
      await flushPromises()

      // Opening the form suspends on the way; an awaited act waits for it, as in the double-click case.
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'createEvent' }))
      })
      await flushPromises()

      expect(screen.getByTestId('where')).toHaveTextContent(Path.admin.newEvent)
    })

    it('asks before starting over from an unsaved draft', async () => {
      const { user } = await renderWith(({ set }) => {
        set(idTokenAtom, TEST_ID_TOKEN)
        set(adminNewEventAtom, { ...eventWithEntryNotYetOpen, id: '', modifiedAt: new Date(), name: 'draft' })
      })
      await flushPromises()

      await user.click(screen.getByRole('button', { name: 'createEvent' }))
      await flushPromises()
      await act(async () => {
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'eventDraft.createNew' }))
      })
      await flushPromises()

      expect(screen.getByTestId('where')).toHaveTextContent(Path.admin.newEvent)
      expect(JSON.parse(localStorage.getItem('newEvent') ?? '{}').name).not.toBe('draft')
    })

    it('keeps the draft when told to stay with it', async () => {
      const { user } = await renderWith(({ set }) => {
        set(idTokenAtom, TEST_ID_TOKEN)
        set(adminNewEventAtom, { ...eventWithEntryNotYetOpen, id: '', modifiedAt: new Date(), name: 'draft' })
      })
      await flushPromises()

      await user.click(screen.getByRole('button', { name: 'createEvent' }))
      await flushPromises()
      await act(async () => {
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'unsavedChanges.stay' }))
      })
      await flushPromises()

      expect(screen.getByTestId('where')).toHaveTextContent(Path.admin.newEvent)
      expect(JSON.parse(localStorage.getItem('newEvent') ?? '{}').name).toBe('draft')
    })

    it('copies the selected event into a new one', async () => {
      await renderWith(({ set }) => {
        set(idTokenAtom, TEST_ID_TOKEN)
        set(adminEventIdAtom, eventWithEntryClosed.id)
      })
      await flushPromises()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'copy' }))
      })
      await flushPromises()

      expect(screen.getByTestId('where')).toHaveTextContent(Path.admin.newEvent)
    })

    it('reports a deletion the server refuses instead of leaving it unhandled', async () => {
      // Only an event nobody can have entered yet is deletable. The mock server does not know this
      // one, so the save rejects, and the rejection has to reach reportError.
      const tentative = { ...eventWithEntryNotYetOpen, id: 'tentative', state: 'tentative' as const }
      expectConsoleOutput('reportError Error: not found')
      const { user } = await renderWith(({ set }) => {
        set(idTokenAtom, TEST_ID_TOKEN)
        set(adminEventsAtom, [tentative])
        set(adminEventIdAtom, tentative.id)
      })
      await flushPromises()

      await user.click(screen.getByRole('button', { name: 'delete' }))
      await flushPromises()
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'delete' }))
      await flushPromises()

      expect(putEvent).toHaveBeenLastCalledWith(
        expect.objectContaining({ deletedAt: expect.any(Date), id: tentative.id }),
        TEST_ID_TOKEN
      )
    })
  })
})
