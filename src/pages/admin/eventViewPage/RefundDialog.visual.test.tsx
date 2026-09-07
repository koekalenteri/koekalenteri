import type { Transaction } from '../../../types'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { render } from 'vitest-browser-react'
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
            <RefundDialog open registration={registrationWithStaticDates} />
          </ConfirmProvider>
        </SnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  )

  // The dialog renders through a portal, so the capture is the dialog itself, not a frame around it.
  await expect.element(screen.getByText('50,00 €').first()).toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot('refund-dialog-open')
})
