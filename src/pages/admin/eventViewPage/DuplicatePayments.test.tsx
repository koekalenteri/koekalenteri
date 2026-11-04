import type { ReactNode } from 'react'
import type { DuplicatePaymentEntry } from '@/types'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { ConfirmProvider } from 'material-ui-confirm'
import { Suspense } from 'react'
import { eventWithStaticDates } from '@/__mockData__/events'
import { getDuplicatePayments } from '@/api/registration'
import theme from '@/assets/Theme'
import { locales } from '@/i18n'
import { expectConsoleOutput } from '@/test-utils/consoleGuard'
import { flushPromises, TEST_ID_TOKEN } from '@/test-utils/utils'
import AppSnackbarProvider from '../../components/AppSnackbarProvider'
import { idTokenAtom } from '../../state/user/atoms'
import { adminDuplicatePaymentsAtom, adminDuplicatePaymentsRefreshAtom } from '../state'
import DuplicatePayments from './DuplicatePayments'

vi.mock('@/api/registration')

const mockTransactions = vi.fn(async () => [])
vi.mock('../state/registrations/actions', async () => ({
  useAdminRegistrationActions: () => ({
    refund: vi.fn(),
    transactions: mockTransactions,
  }),
}))

const entry = (id: string, overrides: Partial<DuplicatePaymentEntry['registration']> = {}): DuplicatePaymentEntry => ({
  amount: 50,
  duplicatePaymentAt: new Date('2026-08-16T10:00:00.000Z'),
  registration: {
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    dog: { name: `Dog ${id}`, regNo: `FI${id}/26` },
    eventId: eventWithStaticDates.id,
    id,
    payer: { name: `Payer ${id}` },
    paymentStatus: 'DUPLICATE',
    ...overrides,
  },
})

const renderSection = async () => {
  const store = createStore()
  store.set(idTokenAtom, TEST_ID_TOKEN)
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <ThemeProvider theme={theme}>
      <Provider store={store}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <AppSnackbarProvider>
            <ConfirmProvider>
              <Suspense fallback={null}>{children}</Suspense>
            </ConfirmProvider>
          </AppSnackbarProvider>
        </LocalizationProvider>
      </Provider>
    </ThemeProvider>
  )
  await act(async () => {
    render(<DuplicatePayments event={eventWithStaticDates} />, { wrapper })
  })
  await flushPromises()
  return store
}

describe('DuplicatePayments', () => {
  beforeAll(() => vi.useFakeTimers())
  afterAll(() => vi.useRealTimers())
  beforeEach(() => vi.mocked(getDuplicatePayments).mockReset())
  afterEach(() => adminDuplicatePaymentsAtom.remove(eventWithStaticDates.id))

  it('shows nothing when there is nothing to refund', async () => {
    vi.mocked(getDuplicatePayments).mockResolvedValue([])
    await renderSection()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('names the dog, the payer, the amount and the date, with a way to refund', async () => {
    vi.mocked(getDuplicatePayments).mockResolvedValue([entry('1')])
    await renderSection()

    expect(screen.getByText('registration.duplicatePayments.title')).toBeInTheDocument()
    expect(screen.getByText('Dog 1 (FI1/26)')).toBeInTheDocument()
    expect(screen.getByText('Payer 1')).toBeInTheDocument()
    expect(screen.getByText('50,00 €')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'refund' })).toBeEnabled()
  })

  it('says a refund is on its way instead of offering another', async () => {
    vi.mocked(getDuplicatePayments).mockResolvedValue([entry('1', { openRefunds: ['r1'] })])
    await renderSection()

    expect(screen.getByText('registration.duplicatePayments.refundPending')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'refund' })).not.toBeInTheDocument()
  })

  it("opens the refund dialog on the row, which loads that row's transactions", async () => {
    vi.mocked(getDuplicatePayments).mockResolvedValue([entry('1'), entry('2')])
    await renderSection()

    fireEvent.click(screen.getAllByRole('button', { name: 'refund' })[1])
    await flushPromises()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(mockTransactions).toHaveBeenCalledWith(eventWithStaticDates.id, '2')
  })

  it('fetches again when asked to, and the row that went back is gone', async () => {
    vi.mocked(getDuplicatePayments).mockResolvedValueOnce([entry('1')])
    const store = await renderSection()
    expect(screen.getByText('Dog 1 (FI1/26)')).toBeInTheDocument()

    vi.mocked(getDuplicatePayments).mockResolvedValueOnce([])
    await act(async () => {
      store.set(adminDuplicatePaymentsRefreshAtom(eventWithStaticDates.id), (count) => count + 1)
    })
    await flushPromises()

    expect(screen.queryByText('Dog 1 (FI1/26)')).not.toBeInTheDocument()
  })

  it('keeps the last list when a fetch fails', async () => {
    vi.mocked(getDuplicatePayments).mockResolvedValueOnce([entry('1')])
    const store = await renderSection()

    vi.mocked(getDuplicatePayments).mockRejectedValueOnce(new Error('network'))
    expectConsoleOutput(/reportError .*network/)
    await act(async () => {
      store.set(adminDuplicatePaymentsRefreshAtom(eventWithStaticDates.id), (count) => count + 1)
    })
    await flushPromises()

    expect(screen.getByText('Dog 1 (FI1/26)')).toBeInTheDocument()
  })
})
