import type { RouteObject } from 'react-router'
import type { Language } from '../../i18n'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { cleanup, render, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithStaticDates } from '../../__mockData__/events'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { Path } from '../../routeConfig'
import { DataMemoryRouter, flushPromises, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import EventEditPage from './EventEditPage'

vi.mock('../../api/user')
vi.mock('../../api/event')
vi.mock('../../api/eventType')
vi.mock('../../api/judge')
vi.mock('../../api/official')
vi.mock('../../api/organizer')
vi.mock('../../api/registration')

const mockSubscribeEvent = vi.fn()
const mockUnsubscribeEvent = vi.fn()
let mockViewers: Array<{ name: string; userId: string }> = []

vi.mock('../../hooks/useWebSocket', () => ({
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

    const { container, unmount } = render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
          <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <DataMemoryRouter initialEntries={[Path.admin.editEvent(eventWithStaticDates.id)]} routes={routes} />
              </SnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()
    expect(container).toMatchSnapshot()
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

    const { unmount } = render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
          <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <DataMemoryRouter initialEntries={[Path.admin.editEvent(eventWithStaticDates.id)]} routes={routes} />
              </SnackbarProvider>
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
})
