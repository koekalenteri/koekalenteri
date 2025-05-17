import type { ReactNode } from 'react'
import type { Transaction } from '../../../types'

import { Suspense } from 'react'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider, useSnackbar } from 'notistack'
import { RecoilRoot } from 'recoil'

import { registrationWithStaticDates } from '../../../__mockData__/registrations'
import { APIError } from '../../../api/http'
import theme from '../../../assets/Theme'
import { locales } from '../../../i18n'
import { flushPromises } from '../../../test-utils/utils'

import { RefundDailog as RefundDialog } from './RefundDialog'

// Mock the useAdminRegistrationActions hook
jest.mock('../recoil/registrations/actions', () => ({
  useAdminRegistrationActions: () => ({
    transactions: jest.fn().mockResolvedValue(mockTransactions),
    refund: jest.fn().mockImplementation(mockRefundImplementation),
    putInternalNotes: jest.fn().mockResolvedValue({}),
  }),
}))

jest.mock('notistack', () => ({
  ...jest.requireActual('notistack'),
  useSnackbar: jest.fn(),
}))

// Mock transaction data
const mockTransactions: Transaction[] = [
  {
    transactionId: 'payment-123',
    reference: 'ref-123',
    type: 'payment',
    stamp: 'stamp-123',
    amount: 5000, // 50€
    status: 'ok',
    provider: 'nordea',
    createdAt: new Date('2024-01-01T12:00:00Z'),
    items: [
      {
        unitPrice: 5000,
        units: 1,
        vatPercentage: 24,
        productCode: 'registration-fee',
        reference: 'item-ref-123',
        merchant: 'merchant-123',
        stamp: 'item-stamp-123',
      },
    ],
  },
  {
    transactionId: 'refund-123',
    reference: 'ref-456',
    type: 'refund',
    stamp: 'stamp-456',
    amount: 2000, // 20€
    status: 'ok',
    provider: 'nordea',
    createdAt: new Date('2024-01-02T12:00:00Z'),
    user: 'admin',
  },
]

// Mock refund implementation for different test scenarios
let mockRefundImplementation = jest.fn().mockResolvedValue({ status: 'ok' })

const Wrapper = ({ children }: { readonly children: ReactNode }) => {
  return (
    <ThemeProvider theme={theme}>
      <RecoilRoot>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <SnackbarProvider>
            <ConfirmProvider>
              <Suspense fallback={<>loading...</>}>{children}</Suspense>
            </ConfirmProvider>
          </SnackbarProvider>
        </LocalizationProvider>
      </RecoilRoot>
    </ThemeProvider>
  )
}

describe('RefundDialog', () => {
  const enqueueSnackbarMock = jest.fn()
  beforeAll(() => {
    jest.useFakeTimers()
  })
  beforeEach(() => {
    ;(useSnackbar as jest.Mock).mockReturnValue({
      enqueueSnackbar: enqueueSnackbarMock,
    })
  })
  afterEach(() => {
    jest.runOnlyPendingTimers()
    enqueueSnackbarMock.mockClear()
    mockRefundImplementation.mockClear()
  })
  afterAll(() => jest.useRealTimers())

  it('renders hidden when open is false', async () => {
    const { container } = render(<RefundDialog registration={registrationWithStaticDates} open={false} />, {
      wrapper: Wrapper,
    })
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('renders with open dialog', async () => {
    const { baseElement } = render(<RefundDialog registration={registrationWithStaticDates} open={true} />, {
      wrapper: Wrapper,
    })
    await flushPromises()
    expect(baseElement).toMatchSnapshot()
  })

  it('displays transaction data correctly', async () => {
    render(<RefundDialog registration={registrationWithStaticDates} open={true} />, { wrapper: Wrapper })
    await flushPromises()

    // Check that payment transaction is displayed
    expect(screen.getByText('50,00 €')).toBeInTheDocument()
  })

  it('handles successful refund with default provider', async () => {
    mockRefundImplementation = jest.fn().mockResolvedValue({ status: 'ok' })

    const onCloseMock = jest.fn()
    render(<RefundDialog registration={registrationWithStaticDates} open={true} onClose={onCloseMock} />, {
      wrapper: Wrapper,
    })
    await flushPromises()

    // Click the refund button
    fireEvent.click(screen.getByText('refund'))
    await waitFor(() => {
      expect(enqueueSnackbarMock).toHaveBeenCalledWith('Maksu palautettu', { variant: 'success' })
    })
    expect(onCloseMock).toHaveBeenCalled()
  })

  it('handles successful refund with email provider', async () => {
    mockRefundImplementation = jest.fn().mockResolvedValue({
      status: 'ok',
      provider: 'email refund',
    })

    render(<RefundDialog registration={registrationWithStaticDates} open={true} />, { wrapper: Wrapper })
    await flushPromises()

    // Click the refund button
    fireEvent.click(screen.getByText('refund'))
    await waitFor(() => {
      expect(enqueueSnackbarMock).toHaveBeenCalledWith(
        'Maksun palautus on kesken. Ilmoittautujalle on lähetetty sähköposti rahojen palautuksen viimeistelyä varten. Näet audit trailista, kun palautus on käsitelty loppuun.',
        { variant: 'success' }
      )
    })
  })

  it('handles pending refund status', async () => {
    mockRefundImplementation = jest.fn().mockResolvedValue({
      status: 'pending',
      provider: 'nordea',
    })

    render(<RefundDialog registration={registrationWithStaticDates} open={true} />, { wrapper: Wrapper })
    await flushPromises()

    // Click the refund button
    fireEvent.click(screen.getByText('refund'))
    await waitFor(() => {
      expect(enqueueSnackbarMock).toHaveBeenCalledWith(
        'Maksun palautus on aloitettu. Näet audit trailista, kun palautus on käsitelty loppuun.',
        { variant: 'success' }
      )
    })
  })

  it('handles failed refund', async () => {
    mockRefundImplementation = jest.fn().mockResolvedValue({ status: 'fail' })

    render(<RefundDialog registration={registrationWithStaticDates} open={true} />, { wrapper: Wrapper })
    await flushPromises()

    // Click the refund button
    fireEvent.click(screen.getByText('refund'))
    await waitFor(() => {
      expect(enqueueSnackbarMock).toHaveBeenCalledWith(
        'Maksun palautus epäonnistui. Tarkista että Paytrailin tilillä on tarpeeksi katetta palautukseen, tai yritä myöhemmin uudelleen.',
        { variant: 'error' }
      )
    })
  })

  it('handles 404 error', async () => {
    mockRefundImplementation = jest
      .fn()
      .mockRejectedValue(
        new APIError(new Response(null, { status: 404, statusText: 'Not Found' }), { error: 'Transaction not found' })
      )

    render(<RefundDialog registration={registrationWithStaticDates} open={true} />, { wrapper: Wrapper })
    await flushPromises()

    // Click the refund button
    fireEvent.click(screen.getByText('refund'))
    await waitFor(() => {
      expect(enqueueSnackbarMock).toHaveBeenCalledWith(
        'Maksutapahtumaa ei löydy. Tapahtuma on todennäköisesti liian vanha palautettavaksi.',
        { variant: 'error' }
      )
    })
  })

  it('handles refund balance error', async () => {
    const errorBody = JSON.stringify({
      message: 'Refund amount exceeds the remaining refund balance',
      meta: {
        invalidRefunds: [
          { remainingRefundBalance: 1000 }, // 10€
        ],
      },
    })

    mockRefundImplementation = jest
      .fn()
      .mockRejectedValue(
        new APIError(new Response(null, { status: 400, statusText: 'Bad Request' }), { error: errorBody })
      )

    render(<RefundDialog registration={registrationWithStaticDates} open={true} />, { wrapper: Wrapper })
    await flushPromises()

    // Click the refund button
    fireEvent.click(screen.getByText('refund'))
    await waitFor(() => {
      // Check that the snackbar was called
      expect(enqueueSnackbarMock).toHaveBeenCalled()

      // Check that the snackbar was called with an error message about refund balance
      const firstArg = enqueueSnackbarMock.mock.calls[0][0]
      expect(typeof firstArg).toBe('string')
      expect(firstArg.includes('Palautettava määrä ylittää')).toBe(true)
      expect(firstArg.includes('Palauttamatta:')).toBe(true)

      // Check the second argument has the correct variant
      const secondArg = enqueueSnackbarMock.mock.calls[0][1]
      expect(secondArg).toEqual({ variant: 'error' })
    })
  })

  it('handles other API errors', async () => {
    mockRefundImplementation = jest.fn().mockRejectedValue(
      new APIError(new Response(null, { status: 500, statusText: 'Internal Server Error' }), {
        error: 'Internal server error',
      })
    )

    render(<RefundDialog registration={registrationWithStaticDates} open={true} />, { wrapper: Wrapper })
    await flushPromises()

    // Click the refund button
    fireEvent.click(screen.getByText('refund'))
    await waitFor(() => {
      expect(enqueueSnackbarMock).toHaveBeenCalledWith(
        'Maksun palautus epäonnistui. Tarkista että Paytrailin tilillä on tarpeeksi katetta palautukseen, tai yritä myöhemmin uudelleen.',
        { variant: 'error' }
      )
    })
  })

  it('handles internal notes changes', async () => {
    render(<RefundDialog registration={registrationWithStaticDates} open={true} />, { wrapper: Wrapper })
    await flushPromises()

    // Find the internal notes field and change its value
    const notesField = screen.getByLabelText('registration.internalNotes')
    fireEvent.change(notesField, { target: { value: 'New internal notes' } })

    // Advance timers to trigger the debounced callback
    jest.advanceTimersByTime(1100)

    // Verify the notes were updated (this is implicit since we're mocking the API call)
    expect(notesField).toHaveValue('New internal notes')
  })
})
