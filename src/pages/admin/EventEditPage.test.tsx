import type { RouteObject } from 'react-router'
import type { Language } from '../../i18n'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { RecoilRoot } from 'recoil'
import { eventWithStaticDates } from '../../__mockData__/events'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { Path } from '../../routeConfig'
import { DataMemoryRouter, flushPromises } from '../../test-utils/utils'
import EventEditPage from './EventEditPage'

jest.mock('../../api/user')
jest.mock('../../api/event')
jest.mock('../../api/eventType')
jest.mock('../../api/judge')
jest.mock('../../api/official')
jest.mock('../../api/organizer')
jest.mock('../../api/registration')

const mockSubscribeEvent = jest.fn()
const mockUnsubscribeEvent = jest.fn()
let mockViewers: Array<{ name: string; userId: string }> = []

jest.mock('../../hooks/useWebSocket', () => ({
  useWebSocketContext: () => ({
    subscribeEvent: mockSubscribeEvent,
    unsubscribeEvent: mockUnsubscribeEvent,
    viewers: mockViewers,
  }),
}))

describe('EventEditPage', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => {
    jest.runOnlyPendingTimers()
    mockSubscribeEvent.mockClear()
    mockUnsubscribeEvent.mockClear()
    mockViewers = []
  })
  afterAll(() => jest.useRealTimers())

  it('renders properly', async () => {
    const { i18n } = useTranslation()
    const language = i18n.language as Language

    const routes: RouteObject[] = [
      {
        element: <EventEditPage />,
        path: Path.admin.editEvent(),
      },
    ]

    const { container } = render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
          <RecoilRoot>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <DataMemoryRouter initialEntries={[Path.admin.editEvent(eventWithStaticDates.id)]} routes={routes} />
              </SnackbarProvider>
            </Suspense>
          </RecoilRoot>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()
    expect(container).toMatchSnapshot()
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
          <RecoilRoot>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <DataMemoryRouter initialEntries={[Path.admin.editEvent(eventWithStaticDates.id)]} routes={routes} />
              </SnackbarProvider>
            </Suspense>
          </RecoilRoot>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()

    expect(mockSubscribeEvent).toHaveBeenCalledWith(eventWithStaticDates.id)
    expect(screen.getByRole('alert')).toHaveTextContent('event.viewerBanner_one count, names')

    unmount()

    expect(mockUnsubscribeEvent).toHaveBeenCalledTimes(1)
  })
})
