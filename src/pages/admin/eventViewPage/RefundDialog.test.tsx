import type { ReactNode } from 'react'
import type { Transaction } from '@/types'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'jotai'
import { ConfirmProvider } from 'material-ui-confirm'
import { useSnackbar } from 'notistack'
import { Suspense } from 'react'
import { eventWithStaticDates } from '@/__mockData__/events'
import { registrationWithStaticDates } from '@/__mockData__/registrations'
import { APIError } from '@/api/http'
import theme from '@/assets/Theme'
import { locales } from '@/i18n'
import { describeWithTranslations } from '@/test-utils/language'
import { flushPromises } from '@/test-utils/utils'
import AppSnackbarProvider from '../../components/AppSnackbarProvider'
import { RefundDailog as RefundDialog } from './RefundDialog'

// Mock the useAdminRegistrationActions hook
vi.mock('../state/registrations/actions', async () => ({
  useAdminRegistrationActions: () => ({
    putInternalNotes: vi.fn().mockResolvedValue({}),
    refund: vi.fn().mockImplementation(mockRefundImplementation),
    transactions: vi.fn().mockResolvedValue(mockTransactions),
  }),
}))

// The file's other tests read keys; the English one reads the app's real English (KOE-1511).
vi.mock('react-i18next', async (importOriginal) =>
  (await import('@/test-utils/language')).spyOnUseTranslation(importOriginal)
)

vi.mock('notistack', async () => ({
  ...(await vi.importActual<typeof import('notistack')>('notistack')),
  useSnackbar: vi.fn(),
}))

// Mock transaction data
const defaultMockTransactions: Transaction[] = [
  {
    amount: 5000, // 50€
    createdAt: new Date('2024-01-01T12:00:00Z'),
    items: [
      {
        amount: 5000,
        description: 'registration-fee',
        eventId: 'event-123',
        merchantId: 'merchant-123',
        registrationId: 'item-ref-123',
        stamp: 'item-stamp-123',
      },
    ],
    provider: 'nordea',
    reference: 'ref-123',
    stamp: 'stamp-123',
    status: 'ok',
    transactionId: 'payment-123',
    type: 'payment',
  },
  {
    amount: 2000, // 20€
    createdAt: new Date('2024-01-02T12:00:00Z'),
    provider: 'nordea',
    reference: 'ref-456',
    stamp: 'stamp-456',
    status: 'ok',
    transactionId: 'refund-123',
    type: 'refund',
    user: 'admin',
  },
]
let mockTransactions = defaultMockTransactions

// Mock refund implementation for different test scenarios
let mockRefundImplementation = vi.fn().mockResolvedValue({ status: 'ok' })

const Wrapper = ({ children }: { readonly children: ReactNode }) => {
  return (
    <ThemeProvider theme={theme}>
      <Provider>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <AppSnackbarProvider>
            <ConfirmProvider>
              <Suspense fallback={<>loading...</>}>{children}</Suspense>
            </ConfirmProvider>
          </AppSnackbarProvider>
        </LocalizationProvider>
      </Provider>
    </ThemeProvider>
  )
}

describe('RefundDialog', () => {
  const enqueueSnackbarMock = vi.fn()
  beforeAll(() => {
    vi.useFakeTimers()
  })
  beforeEach(() => {
    mockTransactions = defaultMockTransactions
    ;(useSnackbar as import('vitest').Mock).mockReturnValue({
      enqueueSnackbar: enqueueSnackbarMock,
    })
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    enqueueSnackbarMock.mockClear()
    mockRefundImplementation.mockClear()
  })
  afterAll(() => vi.useRealTimers())

  it('renders hidden when open is false', async () => {
    render(<RefundDialog event={eventWithStaticDates} registration={registrationWithStaticDates} open={false} />, {
      wrapper: Wrapper,
    })
    await flushPromises()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders with open dialog', async () => {
    render(<RefundDialog event={eventWithStaticDates} registration={registrationWithStaticDates} open={true} />, {
      wrapper: Wrapper,
    })
    await flushPromises()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('displays transaction data correctly', async () => {
    render(<RefundDialog event={eventWithStaticDates} registration={registrationWithStaticDates} open={true} />, {
      wrapper: Wrapper,
    })
    await flushPromises()

    // Check that payment transaction is displayed
    expect(screen.getByText('50,00 €')).toBeInTheDocument()
  })

  it('does not charge a handling cost by default for a reserve registration', async () => {
    mockRefundImplementation = vi.fn().mockResolvedValue({ status: 'ok' })

    const registration = {
      ...registrationWithStaticDates,
      cancelled: true,
      group: { key: 'reserve', number: 1 },
    }
    const onCloseMock = vi.fn()
    render(
      <RefundDialog event={eventWithStaticDates} registration={registration} open={true} onClose={onCloseMock} />,
      {
        wrapper: Wrapper,
      }
    )
    await flushPromises()

    // Click the refund button
    fireEvent.click(screen.getByText('refund'))
    await waitFor(() => {
      expect(enqueueSnackbarMock).toHaveBeenCalledWith('registration.refundDialog.status.ok', { variant: 'success' })
    })
    expect(mockRefundImplementation).toHaveBeenCalledWith(registration, 'payment-123', 3000, 0)
    expect(onCloseMock).toHaveBeenCalled()
  })

  it('charges the default handling cost for a non-reserve registration', async () => {
    mockRefundImplementation = vi.fn().mockResolvedValue({ status: 'ok' })

    const registration = {
      ...registrationWithStaticDates,
      group: { key: '2024-01-01-ALO-ap', number: 1 },
    }
    render(<RefundDialog event={eventWithStaticDates} registration={registration} open={true} />, {
      wrapper: Wrapper,
    })
    await flushPromises()

    fireEvent.click(screen.getByText('refund'))
    await waitFor(() => {
      expect(enqueueSnackbarMock).toHaveBeenCalledWith('registration.refundDialog.status.ok', { variant: 'success' })
    })
    expect(mockRefundImplementation).toHaveBeenCalledWith(registration, 'payment-123', 2500, 500)
  })

  it('does not charge another handling cost for a partial refund', async () => {
    mockRefundImplementation = vi.fn().mockResolvedValue({ status: 'ok' })

    const registration = {
      ...registrationWithStaticDates,
      group: { key: 'cancelled', number: 1 },
      refundHandlingCost: 7,
    }
    render(<RefundDialog event={eventWithStaticDates} registration={registration} open={true} />, {
      wrapper: Wrapper,
    })
    await flushPromises()

    const previouslyChargedLabel = screen.getByText('registration.refundDialog.previouslyChargedHandlingCost:')
    expect(previouslyChargedLabel).toBeInTheDocument()
    // The breakdown above the table also shows a kept handling fee (KOE-1103), so the amount is
    // scoped to this paragraph rather than asserted uniquely on the page.
    expect(within(previouslyChargedLabel.closest('p') as HTMLElement).getByText('7,00 €')).toBeInTheDocument()

    fireEvent.click(screen.getByText('refund'))
    await waitFor(() => {
      expect(enqueueSnackbarMock).toHaveBeenCalledWith('registration.refundDialog.status.ok', { variant: 'success' })
    })
    expect(mockRefundImplementation).toHaveBeenCalledWith(registration, 'payment-123', 3000, 0)
  })

  it('preserves an explicitly waived handling cost for a partial refund', async () => {
    const registration = {
      ...registrationWithStaticDates,
      group: { key: 'cancelled', number: 1 },
      refundHandlingCost: 0,
    }

    render(<RefundDialog event={eventWithStaticDates} registration={registration} open={true} />, { wrapper: Wrapper })
    await flushPromises()

    fireEvent.click(screen.getByText('refund'))
    await waitFor(() => {
      expect(mockRefundImplementation).toHaveBeenCalledWith(registration, 'payment-123', 3000, 0)
    })
  })

  it('does not offer a previously charged handling cost for refund again', async () => {
    mockTransactions = [
      { ...defaultMockTransactions[0], amount: 3000 },
      { ...defaultMockTransactions[1], amount: 2500, handlingCost: 500 },
    ]
    const registration = {
      ...registrationWithStaticDates,
      group: { key: 'cancelled', number: 1 },
      paidAmount: 30,
      refundAmount: 25,
      refundHandlingCost: 5,
    }

    render(<RefundDialog event={eventWithStaticDates} registration={registration} open={true} />, { wrapper: Wrapper })
    await flushPromises()

    expect(screen.getByRole('button', { name: 'refund' })).toBeDisabled()
    // The breakdown above the table can also read 0,00 € once a reserve's fee is accounted for
    // (KOE-1103), so the total is read from the transactions table's own footer row.
    expect(
      within(screen.getByRole('row', { name: /registration.refundDialog.total/ })).getByText('0,00 €')
    ).toBeInTheDocument()
  })

  it('refunds a second payment in full without charging another handling cost', async () => {
    mockTransactions = [
      { ...defaultMockTransactions[0], amount: 3000 },
      {
        ...defaultMockTransactions[0],
        amount: 2000,
        createdAt: new Date('2024-01-02T12:00:00Z'),
        transactionId: 'payment-456',
      },
      {
        ...defaultMockTransactions[1],
        amount: 2500,
        createdAt: new Date('2024-01-03T12:00:00Z'),
        handlingCost: 500,
      },
    ]
    const registration = {
      ...registrationWithStaticDates,
      group: { key: 'cancelled', number: 1 },
      paidAmount: 50,
      refundAmount: 25,
      refundHandlingCost: 5,
    }

    render(<RefundDialog event={eventWithStaticDates} registration={registration} open={true} />, { wrapper: Wrapper })
    await flushPromises()

    const secondPaymentRow = screen.getByRole('row', {
      name: /registration.refundDialog.transactionType.payment 20,00/,
    })
    fireEvent.click(within(secondPaymentRow).getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'refund' }))

    await waitFor(() => {
      expect(mockRefundImplementation).toHaveBeenCalledWith(registration, 'payment-456', 2000, 0)
    })
  })

  it('handles successful refund with email provider', async () => {
    mockRefundImplementation = vi.fn().mockResolvedValue({
      provider: 'email refund',
      status: 'ok',
    })

    render(<RefundDialog event={eventWithStaticDates} registration={registrationWithStaticDates} open={true} />, {
      wrapper: Wrapper,
    })
    await flushPromises()

    // Click the refund button
    fireEvent.click(screen.getByText('refund'))
    await waitFor(() => {
      expect(enqueueSnackbarMock).toHaveBeenCalledWith('registration.refundDialog.status.okEmail', {
        variant: 'success',
      })
    })
  })

  it('handles pending refund status', async () => {
    mockRefundImplementation = vi.fn().mockResolvedValue({
      provider: 'nordea',
      status: 'pending',
    })

    render(<RefundDialog event={eventWithStaticDates} registration={registrationWithStaticDates} open={true} />, {
      wrapper: Wrapper,
    })
    await flushPromises()

    // Click the refund button
    fireEvent.click(screen.getByText('refund'))
    await waitFor(() => {
      expect(enqueueSnackbarMock).toHaveBeenCalledWith('registration.refundDialog.status.pending', {
        variant: 'success',
      })
    })
  })

  it('handles failed refund', async () => {
    mockRefundImplementation = vi.fn().mockResolvedValue({ status: 'fail' })

    render(<RefundDialog event={eventWithStaticDates} registration={registrationWithStaticDates} open={true} />, {
      wrapper: Wrapper,
    })
    await flushPromises()

    // Click the refund button
    fireEvent.click(screen.getByText('refund'))
    await waitFor(() => {
      expect(enqueueSnackbarMock).toHaveBeenCalledWith('registration.refundDialog.error.default', {
        persist: true,
        variant: 'error',
      })
    })
  })

  it('handles 404 error', async () => {
    mockRefundImplementation = vi
      .fn()
      .mockRejectedValue(
        new APIError(new Response(null, { status: 404, statusText: 'Not Found' }), { error: 'Transaction not found' })
      )

    render(<RefundDialog event={eventWithStaticDates} registration={registrationWithStaticDates} open={true} />, {
      wrapper: Wrapper,
    })
    await flushPromises()

    // Click the refund button
    fireEvent.click(screen.getByText('refund'))
    await waitFor(() => {
      expect(enqueueSnackbarMock).toHaveBeenCalledWith('registration.refundDialog.error.notFound', {
        persist: true,
        variant: 'error',
      })
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

    mockRefundImplementation = vi
      .fn()
      .mockRejectedValue(
        new APIError(new Response(null, { status: 400, statusText: 'Bad Request' }), { error: errorBody })
      )

    render(<RefundDialog event={eventWithStaticDates} registration={registrationWithStaticDates} open={true} />, {
      wrapper: Wrapper,
    })
    await flushPromises()

    // Click the refund button
    fireEvent.click(screen.getByText('refund'))
    await waitFor(() => {
      // Check that the snackbar was called
      expect(enqueueSnackbarMock).toHaveBeenCalled()

      expect(enqueueSnackbarMock).toHaveBeenCalledWith(
        expect.stringContaining('registration.refundDialog.error.balance'),
        {
          persist: true,
          variant: 'error',
        }
      )
      expect(enqueueSnackbarMock).toHaveBeenCalledWith(expect.stringContaining('remaining'), {
        persist: true,
        variant: 'error',
      })
    })
  })

  it('takes only a well-formed Paytrail refusal for one', async () => {
    mockRefundImplementation = vi
      .fn()
      .mockRejectedValue(
        new APIError(new Response(null, { status: 502, statusText: 'Bad Gateway' }), { provider: 'paytrail' })
      )

    render(<RefundDialog event={eventWithStaticDates} registration={registrationWithStaticDates} open={true} />, {
      wrapper: Wrapper,
    })
    await flushPromises()

    fireEvent.click(screen.getByText('refund'))
    await waitFor(() => {
      expect(enqueueSnackbarMock).toHaveBeenCalledWith('registration.refundDialog.error.default', {
        persist: true,
        variant: 'error',
      })
    })
  })

  it('handles other API errors', async () => {
    mockRefundImplementation = vi.fn().mockRejectedValue(
      new APIError(new Response(null, { status: 500, statusText: 'Internal Server Error' }), {
        error: 'Internal server error',
      })
    )

    render(<RefundDialog event={eventWithStaticDates} registration={registrationWithStaticDates} open={true} />, {
      wrapper: Wrapper,
    })
    await flushPromises()

    // Click the refund button
    fireEvent.click(screen.getByText('refund'))
    await waitFor(() => {
      expect(enqueueSnackbarMock).toHaveBeenCalledWith('registration.refundDialog.error.default', {
        persist: true,
        variant: 'error',
      })
    })
  })

  it('shows the parsed Paytrail error with its status', async () => {
    const paytrailMessage =
      'API refund failed and provider does not support email refunds. Provider message: Revert failed'

    mockRefundImplementation = vi.fn().mockRejectedValue(
      new APIError(new Response(null, { status: 400, statusText: 'Bad Request' }), {
        error: JSON.stringify({ message: paytrailMessage, status: 'error' }),
        provider: 'paytrail',
      })
    )

    render(<RefundDialog event={eventWithStaticDates} registration={registrationWithStaticDates} open={true} />, {
      wrapper: Wrapper,
    })
    await flushPromises()

    fireEvent.click(screen.getByText('refund'))
    await waitFor(() => {
      expect(enqueueSnackbarMock).toHaveBeenCalledWith('audit.messages.refundPaytrailFailed error, status', {
        persist: true,
        variant: 'error',
      })
    })
  })

  // The refusal in the reading language (KOE-1511).
  describeWithTranslations('en', () => {
    it('shows the Paytrail refusal in the reading language, not the Finnish audit text', async () => {
      mockRefundImplementation = vi.fn().mockRejectedValue(
        new APIError(new Response(null, { status: 400, statusText: 'Bad Request' }), {
          error: JSON.stringify({ message: 'Revert failed', status: 'error' }),
          message: 'Maksun palautus epäonnistui Paytrailissa (400): Revert failed',
          provider: 'paytrail',
        })
      )

      render(<RefundDialog event={eventWithStaticDates} registration={registrationWithStaticDates} open={true} />, {
        wrapper: Wrapper,
      })
      await flushPromises()

      fireEvent.click(screen.getByRole('button', { name: 'Refund' }))
      await waitFor(() => {
        expect(enqueueSnackbarMock).toHaveBeenCalledWith('Refund failed at Paytrail (400): Revert failed', {
          persist: true,
          variant: 'error',
        })
      })
    })

    // Paytrail does not always answer JSON: an HTML or plain 5xx comes as its text, a request that
    // never got an answer as the reason it failed, and some answers have no words at all. None of
    // them is the balance problem the default message guesses at.
    it.each([
      ['a plain-text answer', 503, 'Service Unavailable', 'Refund failed at Paytrail (503): Service Unavailable'],
      ['a request that failed', 500, 'fetch failed', 'Refund failed at Paytrail (500): fetch failed'],
      ['an answer without words', 502, '', 'Refund failed at Paytrail (502): Unknown error'],
    ])('names %s as Paytrail gave it', async (_case, status, error, expected) => {
      mockRefundImplementation = vi
        .fn()
        .mockRejectedValue(
          new APIError(new Response(null, { status, statusText: 'Error' }), { error, provider: 'paytrail' })
        )

      render(<RefundDialog event={eventWithStaticDates} registration={registrationWithStaticDates} open={true} />, {
        wrapper: Wrapper,
      })
      await flushPromises()

      fireEvent.click(screen.getByRole('button', { name: 'Refund' }))
      await waitFor(() => {
        expect(enqueueSnackbarMock).toHaveBeenCalledWith(expected, { persist: true, variant: 'error' })
      })
    })
  })

  it('handles internal notes changes', async () => {
    render(<RefundDialog event={eventWithStaticDates} registration={registrationWithStaticDates} open={true} />, {
      wrapper: Wrapper,
    })
    await flushPromises()

    // Find the internal notes field and change its value
    const notesField = screen.getByLabelText('registration.internalNotes')
    fireEvent.change(notesField, { target: { value: 'New internal notes' } })

    // Advance timers to trigger the debounced callback
    vi.advanceTimersByTime(1100)

    // Verify the notes were updated (this is implicit since we're mocking the API call)
    expect(notesField).toHaveValue('New internal notes')
  })

  // The breakdown shown on the payment page goes above the transactions table too (KOE-1103), so
  // the secretary sees what is in the cart now, not just the raw payment rows.
  describeWithTranslations('fi', () => {
    it("shows the registration's payment breakdown above the transactions table", async () => {
      const registration = {
        ...registrationWithStaticDates,
        group: { key: '2024-01-01-ALO-ap', number: 1 },
        paidAmount: 30,
        refundAmount: 25,
      }
      render(<RefundDialog event={eventWithStaticDates} registration={registration} open={true} />, {
        wrapper: Wrapper,
      })
      await flushPromises()

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText('Osallistumismaksu')).toBeInTheDocument()
      expect(within(dialog).getByText('Maksettu')).toBeInTheDocument()
      expect(within(dialog).getByText('Palautettu')).toBeInTheDocument()
    })
  })

  describe('overpaid fee (KOE-1382)', () => {
    // The trial costs 100; the participant paid 123 (registrationWithStaticDates), so 23 is theirs.
    const cheaperEvent = { ...eventWithStaticDates, cost: 100, costMember: 100 }
    const participant = {
      ...registrationWithStaticDates,
      group: { key: '2024-01-01-ALO-ap', number: 1 },
    }

    it('refunds the overpaid part alone by default, without a handling cost', async () => {
      mockRefundImplementation = vi.fn().mockResolvedValue({ status: 'ok' })
      render(<RefundDialog event={cheaperEvent} registration={participant} open={true} />, { wrapper: Wrapper })
      await flushPromises()

      expect(screen.getByRole('radio', { name: /registration.refundDialog.excessOnly/ })).toBeChecked()
      expect(screen.getByText('registration.refundDialog.excessText')).toBeInTheDocument()

      fireEvent.click(screen.getByText('refund'))
      await waitFor(() => {
        expect(mockRefundImplementation).toHaveBeenCalledWith(participant, 'payment-123', 2300, 0)
      })
    })

    it('still lets the secretary refund the whole payment less the handling cost', async () => {
      mockRefundImplementation = vi.fn().mockResolvedValue({ status: 'ok' })
      render(<RefundDialog event={cheaperEvent} registration={participant} open={true} />, { wrapper: Wrapper })
      await flushPromises()

      fireEvent.click(screen.getByRole('radio', { name: 'registration.refundDialog.wholePayment' }))
      expect(screen.getByText('registration.refundDialog.costsText')).toBeInTheDocument()

      fireEvent.click(screen.getByText('refund'))
      await waitFor(() => {
        expect(mockRefundImplementation).toHaveBeenCalledWith(participant, 'payment-123', 2500, 500)
      })
    })

    it('picks the payment the overpaid part comes out of when there are several', async () => {
      // 100 € first, then a 23 € top-up that turned out not to be owed: the top-up covers the excess.
      mockTransactions = [
        { ...defaultMockTransactions[0], amount: 10000 },
        {
          ...defaultMockTransactions[0],
          amount: 2300,
          createdAt: new Date('2024-01-02T12:00:00Z'),
          transactionId: 'payment-456',
        },
      ]
      mockRefundImplementation = vi.fn().mockResolvedValue({ status: 'ok' })
      render(<RefundDialog event={cheaperEvent} registration={participant} open={true} />, { wrapper: Wrapper })
      await flushPromises()

      expect(screen.getByRole('radio', { name: /registration.refundDialog.excessOnly/ })).toBeChecked()
      expect(screen.getByText('registration.refundDialog.excessText')).toBeInTheDocument()

      fireEvent.click(screen.getByText('refund'))
      await waitFor(() => {
        expect(mockRefundImplementation).toHaveBeenCalledWith(participant, 'payment-456', 2300, 0)
      })
    })

    it('returns the excess from the larger payment when the latest does not cover it', async () => {
      mockTransactions = [
        { ...defaultMockTransactions[0], amount: 11000 },
        {
          ...defaultMockTransactions[0],
          amount: 1300,
          createdAt: new Date('2024-01-02T12:00:00Z'),
          transactionId: 'payment-456',
        },
      ]
      mockRefundImplementation = vi.fn().mockResolvedValue({ status: 'ok' })
      render(<RefundDialog event={cheaperEvent} registration={participant} open={true} />, { wrapper: Wrapper })
      await flushPromises()

      fireEvent.click(screen.getByText('refund'))
      await waitFor(() => {
        expect(mockRefundImplementation).toHaveBeenCalledWith(participant, 'payment-123', 2300, 0)
      })
    })

    it('leaves a cancelled entry to the ordinary refund', async () => {
      render(
        <RefundDialog
          event={cheaperEvent}
          registration={{ ...participant, cancelled: true, group: { key: 'cancelled', number: 1 } }}
          open={true}
        />,
        { wrapper: Wrapper }
      )
      await flushPromises()

      expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    })
  })
})
