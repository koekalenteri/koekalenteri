import type { CreatePaymentResponse } from '../types'

import { Suspense } from 'react'
import { defer, type RouteObject, useParams } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { registrationWithStaticDatesAndClass } from '../__mockData__/registrations'
import theme from '../assets/Theme'
import { locales } from '../i18n'
import { Path } from '../routeConfig'
import { DataMemoryRouter, flushPromises } from '../test-utils/utils'

import { PaymentPage } from './PaymentPage'

jest.mock('../api/event')
jest.mock('../api/payment')
jest.mock('../api/registration')

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: jest.fn(),
}))
const mockUseParams = useParams as jest.Mock

describe('PaymentPage', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('renders loading indicator while loader is pending', async () => {
    mockUseParams.mockImplementation(() => ({
      registrationId: registrationWithStaticDatesAndClass.id,
      id: registrationWithStaticDatesAndClass.eventId,
    }))

    const response: CreatePaymentResponse = {
      transactionId: '',
      href: '',
      terms: '',
      groups: [],
      reference: '',
      providers: [],
      customProviders: {},
    }

    const path = Path.payment(registrationWithStaticDatesAndClass)
    const routes: RouteObject[] = [
      {
        path,
        element: <PaymentPage />,
        loader: async () =>
          defer({
            response: new Promise(() => {}),
          }),
      },
    ]

    const { container } = render(
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
    expect(container).toMatchSnapshot()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })
})
