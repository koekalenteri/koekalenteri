import type { RouteObject } from 'react-router'
import type { CreatePaymentResponse } from '../types'

import { Suspense } from 'react'
import { useParams } from 'react-router'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import {
  registrationWithStaticDatesAndClass,
  unpaidRegistrationWithStaticDatesAndClass,
} from '../__mockData__/registrations'
import mockResponse from '../api/__mocks__/paymentCreate.response.json'
import theme from '../assets/Theme'
import { locales } from '../i18n'
import { Path } from '../routeConfig'
import { DataMemoryRouter, flushPromises } from '../test-utils/utils'

import LoadingIndicator from './components/LoadingIndicator'
import { Component as PaymentPage, PaymentPageWithData } from './PaymentPage'

jest.mock('../api/event')
jest.mock('../api/payment')
jest.mock('../api/registration')

jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useParams: jest.fn(),
}))
const mockUseParams = useParams as jest.Mock

const { paymentStatus: _0, paidAt: _1, paidAmount: _2, ...testRegistration } = unpaidRegistrationWithStaticDatesAndClass

describe('PaymentPage', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.clearAllMocks()
  })
  afterAll(() => jest.useRealTimers())

  it('renders loading indicator while loader is pending', async () => {
    mockUseParams.mockImplementation(() => ({
      registrationId: testRegistration.id,
      id: testRegistration.eventId,
    }))

    const path = Path.payment(testRegistration)
    const routes: RouteObject[] = [
      {
        path: Path.registration(testRegistration),
        element: <>Registration Page</>,
        hydrateFallbackElement: <>hydrate fallback</>,
      },
      {
        path,
        element: <PaymentPage />,
        hydrateFallbackElement: <LoadingIndicator />,
        loader: async () => ({
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

  it('renders properly', async () => {
    mockUseParams.mockImplementation(() => ({
      registrationId: testRegistration.id,
      id: testRegistration.eventId,
    }))

    const path = Path.payment(testRegistration)
    const routes: RouteObject[] = [
      {
        path: Path.registration(testRegistration),
        element: <>Registration Page</>,
        hydrateFallbackElement: <>hydrate fallback</>,
      },
      {
        path,
        element: <PaymentPage />,
        hydrateFallbackElement: <LoadingIndicator />,
        loader: async () => ({
          response: Promise.resolve(mockResponse),
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
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  describe('PaymentPageWithData', () => {
    it('should show error message when event is not found', async () => {
      const { container } = render(
        <PaymentPageWithData id="test-id" registrationId="test-reg-id" event={null} registration={testRegistration} />
      )

      await flushPromises()

      expect(container).toHaveTextContent('Tapahtumaa test-id ei löydy.')
    })

    it('should show error message when registration is not found', async () => {
      const { container } = render(
        <PaymentPageWithData
          id="test-id"
          registrationId="test-reg-id"
          event={{ id: 'test-id' } as any}
          registration={null}
        />
      )

      await flushPromises()

      expect(container).toHaveTextContent('Ilmoittautumista test-reg-id ei löydy.')
    })

    it('should navigate to registration page when payment status is SUCCESS', async () => {
      const routes: RouteObject[] = [
        {
          path: Path.registration(registrationWithStaticDatesAndClass),
          element: <>Registration Page</>,
          hydrateFallbackElement: <>hydrate fallback</>,
        },
        {
          path: '/test-path',
          element: (
            <PaymentPageWithData
              id="test-id"
              registrationId="test-reg-id"
              event={{ id: 'test-id' } as any}
              registration={registrationWithStaticDatesAndClass}
              response={mockResponse as CreatePaymentResponse}
            />
          ),
          hydrateFallbackElement: <>hydrate fallback</>,
        },
      ]

      render(<DataMemoryRouter initialEntries={['/test-path']} routes={routes} />)

      await flushPromises()

      expect(screen.getByText('Registration Page')).toBeInTheDocument()
    })

    it('should show error message when response.groups is not available', async () => {
      const { container } = render(
        <PaymentPageWithData
          id="test-id"
          registrationId="test-reg-id"
          event={{ id: 'test-id' } as any}
          registration={testRegistration}
          response={{} as CreatePaymentResponse}
        />
      )

      await flushPromises()

      expect(container).toHaveTextContent('Jotakin meni pieleen')
    })
  })

  it('should reset registration form on mount', async () => {
    // Create a mock for the reset function
    const mockResetRegistration = jest.fn()

    // Mock the useResetRecoilState hook to return our mock function
    jest.spyOn(require('recoil'), 'useResetRecoilState').mockReturnValue(mockResetRegistration)

    mockUseParams.mockImplementation(() => ({
      registrationId: testRegistration.id,
      id: testRegistration.eventId,
    }))

    const path = Path.payment(testRegistration)
    const routes: RouteObject[] = [
      {
        path: Path.registration(testRegistration),
        element: <>Registration Page</>,
        hydrateFallbackElement: <>hydrate fallback</>,
      },
      {
        path,
        element: <PaymentPage />,
        loader: async () => ({
          response: Promise.resolve(mockResponse),
        }),
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

    // The useEffect should call resetRegistration
    expect(mockResetRegistration).toHaveBeenCalled()
  })
})
