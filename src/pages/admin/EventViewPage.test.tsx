import type { RouteObject } from 'react-router-dom'

import { Suspense } from 'react'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { eventWithStaticDates, eventWithStaticDatesAndClass } from '../../__mockData__/events'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { Path } from '../../routeConfig'
import { DataMemoryRouter, flushPromises } from '../../test-utils/utils'

import EventViewPage from './EventViewPage'

jest.mock('../../api/event')
jest.mock('../../api/eventType')
jest.mock('../../api/judge')
jest.mock('../../api/official')
jest.mock('../../api/organizer')
jest.mock('../../api/registration')
jest.mock('../../api/email')
jest.mock('../../api/user')

describe('EventViewPage', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('renders properly for event without classes', async () => {
    const routes: RouteObject[] = [
      {
        path: Path.admin.viewEvent(),
        element: <EventViewPage />,
      },
    ]

    const { container } = render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <RecoilRoot>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <DataMemoryRouter initialEntries={[Path.admin.viewEvent(eventWithStaticDates.id)]} routes={routes} />
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
        path: Path.admin.viewEvent(),
        element: <EventViewPage />,
      },
    ]

    const { container } = render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <RecoilRoot>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <DataMemoryRouter
                  initialEntries={[Path.admin.viewEvent(eventWithStaticDatesAndClass.id)]}
                  routes={routes}
                />
              </SnackbarProvider>
            </Suspense>
          </RecoilRoot>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()
    expect(container).toMatchSnapshot()
  })
})
