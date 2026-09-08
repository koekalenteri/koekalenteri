import type { Transaction } from '../../../types'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { render } from 'vitest-browser-react'
import { eventWithStaticDates } from '../../../__mockData__/events'
import { registrationWithStaticDates } from '../../../__mockData__/registrations'
import theme from '../../../assets/Theme'
import { locales } from '../../../i18n'
import { RefundDailog as RefundDialog } from './RefundDialog'

// RefundDialog reaches for the real registration-actions hook to fetch transactions; give it a
// fixed dataset instead of hitting the network, the same way RefundDialog.test.tsx does.
vi.mock('../state/registrations/actions', () => ({
  useAdminRegistrationActions: () => ({
    putInternalNotes: async () => ({}),
    refund: async () => ({ status: 'ok' }),
    transactions: async (): Promise<Transaction[]> => [
      {
        amount: 5000,
        createdAt: new Date('2026-01-01T12:00:00Z'),
        provider: 'nordea',
        reference: 'ref-123',
        stamp: 'stamp-123',
        status: 'ok',
        transactionId: 'payment-123',
        type: 'payment',
      },
    ],
  }),
}))

it('lines up the transaction amount and the handling cost with the currency', async () => {
  const screen = await render(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <SnackbarProvider>
          <ConfirmProvider>
            <RefundDialog event={eventWithStaticDates} open registration={registrationWithStaticDates} />
          </ConfirmProvider>
        </SnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  )

  // The dialog renders through a portal, so the capture is the dialog itself, not a frame around it.
  await expect.element(screen.getByText('50,00 €').first()).toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot('refund-dialog-open')
})

// The participant paid 123 for a place that costs 100 (KOE-1382): the dialog opens on giving the
// 23 back, and shows the whole-payment refund beside it as the other choice.
it('offers the overpaid part first', async () => {
  const screen = await render(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <SnackbarProvider>
          <ConfirmProvider>
            <RefundDialog
              event={{ ...eventWithStaticDates, cost: 100, costMember: 100 }}
              open
              registration={{ ...registrationWithStaticDates, group: { key: '2021-02-10-ap', number: 1 } }}
            />
          </ConfirmProvider>
        </SnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  )

  await expect.element(screen.getByText('Palauta liikaa maksettu osuus 23,00 €')).toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot('refund-dialog-excess')
})
