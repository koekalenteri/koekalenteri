import type { RouteObject } from 'react-router'
import type { Language } from '../../i18n'
import type { DogEvent } from '../../types'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { cleanup, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet } from 'react-router'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithStaticDates } from '../../__mockData__/events'
import { putEvent } from '../../api/event'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { Path } from '../../routeConfig'
import { DataMemoryRouter, flushPromises, renderSuspended, TEST_ID_TOKEN } from '../../test-utils/utils'
import AppSnackbarProvider from '../components/AppSnackbarProvider'
import { idTokenAtom } from '../state'
import EventEditPage from './EventEditPage'
import { adminEventRegistrationsAtom } from './state'
import { renderAdminRoutes } from './test-utils/adminRoutes'

vi.mock('../../api/user')
vi.mock('../../api/event')
vi.mock('../../api/eventType')
vi.mock('../../api/judge')
vi.mock('../../api/location')
vi.mock('../../api/official')
vi.mock('../../api/organizer')
vi.mock('../../api/registration')

const mockSubscribeEvent = vi.fn()
const mockUnsubscribeEvent = vi.fn()
let mockViewers: Array<{ name: string; userId: string }> = []

vi.mock('../../hooks/useWebSocketContext', () => ({
  useWebSocketContext: () => ({
    subscribeEvent: mockSubscribeEvent,
    unsubscribeEvent: mockUnsubscribeEvent,
    viewers: mockViewers,
  }),
}))

describe('EventEditPage', () => {
  let consoleDebug: import('vitest').MockInstance<typeof console.debug>

  beforeAll(() => vi.useFakeTimers())
  beforeEach(() => {
    consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  })
  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
    consoleDebug.mockRestore()
    mockSubscribeEvent.mockClear()
    mockUnsubscribeEvent.mockClear()
    mockViewers = []
  })
  afterAll(() => vi.useRealTimers())

  it('renders properly', async () => {
    const { i18n } = useTranslation()
    const language = i18n.language as Language

    const routes: RouteObject[] = [
      {
        element: <EventEditPage />,
        path: Path.admin.editEvent(),
      },
    ]

    const { unmount } = await renderSuspended(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
          <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
            <Suspense fallback={<div>loading...</div>}>
              <AppSnackbarProvider>
                <DataMemoryRouter initialEntries={[Path.admin.editEvent(eventWithStaticDates.id)]} routes={routes} />
              </AppSnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()
    expect(screen.getByLabelText('event.name (locale.fi)')).toHaveValue(eventWithStaticDates.name)
    expect(screen.getByRole('group', { name: 'event.startDate' })).toHaveTextContent('10.02.2021')
    unmount()
    expect(consoleDebug).toHaveBeenCalledTimes(2)
    expect(consoleDebug).toHaveBeenNthCalledWith(1, 'ws:event-subscription mount', { eventId: eventWithStaticDates.id })
    expect(consoleDebug).toHaveBeenNthCalledWith(2, 'ws:event-subscription cleanup', {
      eventId: eventWithStaticDates.id,
    })
  })

  it('subscribes to event viewers and shows viewer notification', async () => {
    mockViewers = [{ name: 'Other Admin', userId: 'other-admin' }]
    const { i18n } = useTranslation()
    const language = i18n.language as Language

    const routes: RouteObject[] = [
      {
        element: <EventEditPage />,
        path: Path.admin.editEvent(),
      },
    ]

    const { unmount } = await renderSuspended(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
          <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
            <Suspense fallback={<div>loading...</div>}>
              <AppSnackbarProvider>
                <DataMemoryRouter initialEntries={[Path.admin.editEvent(eventWithStaticDates.id)]} routes={routes} />
              </AppSnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()

    expect(mockSubscribeEvent).toHaveBeenCalledWith(eventWithStaticDates.id)
    expect(screen.getByRole('alert')).toHaveTextContent('event.viewerBanner_one count, names')

    unmount()

    expect(mockUnsubscribeEvent).toHaveBeenCalledTimes(1)
    expect(consoleDebug).toHaveBeenCalledTimes(2)
    expect(consoleDebug).toHaveBeenNthCalledWith(1, 'ws:event-subscription mount', { eventId: eventWithStaticDates.id })
    expect(consoleDebug).toHaveBeenNthCalledWith(2, 'ws:event-subscription cleanup', {
      eventId: eventWithStaticDates.id,
    })
  })

  // The ways out that do not ask. Whether leaving with a change asks is in EventEditPage.leave.test.tsx
  // (KOE-1700).
  describe('an unsaved change', () => {
    // A past trial's form is read-only unless it is a draft, and with no payment time the form sets one
    // as it opens.
    const editable: DogEvent = { ...eventWithStaticDates, paymentTime: 'registration', state: 'draft' }
    const EDIT_DRAFT_KEY = `adminEditableEvent/edit/Id__${editable.id}`
    const description = () => screen.getByLabelText('event.description (locale.fi)')

    const openPage = async () => {
      const rendered = await renderAdminRoutes({
        events: [editable],
        initialEntry: Path.admin.editEvent(editable.id),
        initializeState: ({ set }) => set(adminEventRegistrationsAtom(editable.id), []),
        routes: [
          {
            children: [
              { element: <EventEditPage />, path: Path.admin.editEvent() },
              { element: <div>event list</div>, path: Path.admin.events },
              { element: <div>elsewhere</div>, path: '/elsewhere' },
            ],
            element: (
              <>
                <Link to="/elsewhere">menu</Link>
                <Outlet />
              </>
            ),
          },
        ],
      })
      await flushPromises()
      return rendered
    }
    const change = async (user: Awaited<ReturnType<typeof openPage>>['user']) => {
      await user.type(description(), 'Muutos')
      await flushPromises()
    }

    afterEach(() => sessionStorage.clear())

    it('goes straight on with nothing changed', async () => {
      const { user } = await openPage()

      await user.click(screen.getByRole('link', { name: 'menu' }))
      await flushPromises()

      expect(screen.getByText('elsewhere')).toBeInTheDocument()
      expect(screen.queryByText('unsavedChanges.title')).not.toBeInTheDocument()
    })

    it('is discarded on cancel at once, without asking', async () => {
      const { user } = await openPage()
      await change(user)

      await user.click(screen.getByRole('button', { name: 'cancel' }))
      await flushPromises()

      expect(screen.queryByText('unsavedChanges.title')).not.toBeInTheDocument()
      expect(screen.getByText('event list')).toBeInTheDocument()
      expect(sessionStorage.getItem(EDIT_DRAFT_KEY)).toBeNull()
    })

    it('goes to the event list after a save, without asking', async () => {
      vi.mocked(putEvent).mockResolvedValueOnce(editable)
      const { user } = await openPage()
      await change(user)

      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()

      expect(screen.queryByText('unsavedChanges.title')).not.toBeInTheDocument()
      expect(screen.getByText('event list')).toBeInTheDocument()
    })
  })
})
