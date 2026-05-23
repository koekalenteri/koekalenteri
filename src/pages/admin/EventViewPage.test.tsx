import type { RouteObject } from 'react-router'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render, screen, waitFor } from '@testing-library/react'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { RecoilRoot } from 'recoil'
import { eventWithStaticDates, eventWithStaticDatesAndClass } from '../../__mockData__/events'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { Path } from '../../routeConfig'
import { DataMemoryRouter, flushPromises } from '../../test-utils/utils'
import EventViewPage from './EventViewPage'
import { adminEventClassAtom, adminEventIdAtom } from './recoil'

jest.mock('../../hooks/useAdminWebSocket', () => ({
  useAdminWebSocketSubscription: jest.fn(() => ({ viewers: [] })),
}))

jest.mock('../recoil/user/selectors', () => {
  const { selector } = jest.requireActual('recoil')
  return {
    userSelector: selector({
      get: () => ({ id: 'user1', name: 'Current User' }),
      key: 'userSelectorEventViewPageTest',
    }),
  }
})

jest.mock('../../api/event')
jest.mock('../../api/eventType')
jest.mock('../../api/judge')
jest.mock('../../api/official')
jest.mock('../../api/organizer')
jest.mock('../../api/registration')
jest.mock('../../api/email')
jest.mock('../../api/user')

describe('EventViewPage', () => {
  const { useAdminWebSocketSubscription } = jest.requireMock('../../hooks/useAdminWebSocket') as {
    useAdminWebSocketSubscription: jest.Mock
  }

  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  beforeEach(() => {
    useAdminWebSocketSubscription.mockReturnValue({ viewers: [] })
  })

  it('renders properly for event without classes', async () => {
    const routes: RouteObject[] = [
      {
        element: <EventViewPage />,
        path: Path.admin.viewEvent(),
      },
    ]

    const { container } = render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <RecoilRoot>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <ConfirmProvider>
                  <DataMemoryRouter initialEntries={[Path.admin.viewEvent(eventWithStaticDates.id)]} routes={routes} />
                </ConfirmProvider>
              </SnackbarProvider>
            </Suspense>
          </RecoilRoot>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('renders properly for event with classes', async () => {
    const routes: RouteObject[] = [
      {
        element: <EventViewPage />,
        path: Path.admin.viewEvent(),
      },
    ]

    const { container } = render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <RecoilRoot>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <ConfirmProvider>
                  <DataMemoryRouter
                    initialEntries={[Path.admin.viewEvent(eventWithStaticDatesAndClass.id)]}
                    routes={routes}
                  />
                </ConfirmProvider>
              </SnackbarProvider>
            </Suspense>
          </RecoilRoot>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('uses the route event id instead of stale admin event selection state', async () => {
    const routes: RouteObject[] = [
      {
        element: <EventViewPage />,
        path: Path.admin.viewEvent(),
      },
    ]

    const { container } = render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <RecoilRoot
            initializeState={({ set }) => {
              set(adminEventIdAtom, 'stale-event-id')
              set(adminEventClassAtom, 'VOI')
            }}
          >
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <ConfirmProvider>
                  <DataMemoryRouter
                    initialEntries={[Path.admin.viewEvent(eventWithStaticDatesAndClass.id)]}
                    routes={routes}
                  />
                </ConfirmProvider>
              </SnackbarProvider>
            </Suspense>
          </RecoilRoot>
        </LocalizationProvider>
      </ThemeProvider>
    )

    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('shows other viewers and hides the current user from the viewer banner', async () => {
    useAdminWebSocketSubscription.mockReturnValue({
      viewers: [
        { name: 'Current User', userId: 'user1' },
        { name: 'Viewer Two', userId: 'user2' },
      ],
    })

    const routes: RouteObject[] = [
      {
        element: <EventViewPage />,
        path: Path.admin.viewEvent(),
      },
    ]

    render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <RecoilRoot>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <ConfirmProvider>
                  <DataMemoryRouter initialEntries={[Path.admin.viewEvent(eventWithStaticDates.id)]} routes={routes} />
                </ConfirmProvider>
              </SnackbarProvider>
            </Suspense>
          </RecoilRoot>
        </LocalizationProvider>
      </ThemeProvider>
    )

    await flushPromises()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('event.viewerBanner.one names')
  })
})
