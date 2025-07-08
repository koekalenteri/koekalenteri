import type { RouteObject } from 'react-router'

import { Suspense } from 'react'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render, screen } from '@testing-library/react'
import { format } from 'date-fns'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { eventWithStaticDates, eventWithStaticDatesAnd3Classes } from '../__mockData__/events'
import theme from '../assets/Theme'
import { locales } from '../i18n'
import { DataMemoryRouter, flushPromises } from '../test-utils/utils'

import { ErrorPage } from './ErrorPage'
import { Component as RegistrationCreatePage } from './RegistrationCreatePage'

jest.mock('../api/user')
jest.mock('../api/event')
jest.mock('../api/eventType')
jest.mock('../api/judge')
jest.mock('../api/official')
jest.mock('../api/organizer')
jest.mock('../api/registration')

describe('RegistrationCreatePage', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  const renderWithRouter = (path: string) => {
    const routes: RouteObject[] = [
      {
        path: '/event/:eventType/:id',
        element: <RegistrationCreatePage />,
        hydrateFallbackElement: <>hydrate fallback</>,
      },
      {
        path: '/event/:eventType/:id/:class',
        element: <RegistrationCreatePage />,
        hydrateFallbackElement: <>hydrate fallback</>,
      },
      {
        path: '/event/:eventType/:id/:class/:date',
        element: <RegistrationCreatePage />,
        hydrateFallbackElement: <>hydrate fallback</>,
      },
    ]

    return render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <RecoilRoot>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <DataMemoryRouter initialEntries={[path]} routes={routes} />
              </SnackbarProvider>
            </Suspense>
          </RecoilRoot>
        </LocalizationProvider>
      </ThemeProvider>
    )
  }

  it('should render with event/eventType/id path', async () => {
    const { eventType, id } = eventWithStaticDates
    const path = `/event/${eventType}/${id}`

    const { container } = renderWithRouter(path)
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('should select the class on event/eventType/id/class path', async () => {
    const { eventType, id, classes } = eventWithStaticDatesAnd3Classes
    const path = `/event/${eventType}/${id}/${classes[1].class}`

    renderWithRouter(path)
    await flushPromises()
    const input = screen.getByRole('combobox', { name: 'registration.class' })
    expect(input).toHaveValue(classes[1].class)
  })

  it('should select the date on event/eventType/id/class/date path', async () => {
    const { eventType, id, classes } = eventWithStaticDatesAnd3Classes
    const date = format(classes[2].date ?? new Date(), 'dd.MM.')
    const path = `/event/${eventType}/${id}/${classes[2].class}/${date}`

    const { container } = renderWithRouter(path)
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('should throw 404 for non-existent event', async () => {
    const mockConsoleError = jest.spyOn(console, 'error').mockImplementation()

    const path = `/event/qwerty/asdf`
    const routes: RouteObject[] = [
      {
        path: '/event/:eventType/:id',
        element: <RegistrationCreatePage />,
        errorElement: <ErrorPage />,
        hydrateFallbackElement: <>hydrate fallback</>,
      },
    ]

    render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <RecoilRoot>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <DataMemoryRouter initialEntries={[path]} routes={routes} />
              </SnackbarProvider>
            </Suspense>
          </RecoilRoot>
        </LocalizationProvider>
      </ThemeProvider>
    )

    await flushPromises()
    expect(mockConsoleError).toHaveBeenCalled()
    expect(screen).toMatchSnapshot()
  })
})
