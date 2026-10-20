import type { PaymentEvent } from './types'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { freezeClockAt } from '@/test-utils/freezeClock'
import PaymentSection from './PaymentSection'

freezeClockAt('2026-04-01')

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 1000 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// Pinned dates: the early-bird row prints the days its rate runs from the entry start.
const event: PaymentEvent = {
  cost: {
    breed: { '122': 30 },
    earlyBird: { cost: 30, days: 7 },
    normal: 40,
    optionalAdditionalCosts: [{ cost: 10, description: { fi: 'Ruokailu' } }],
  },
  costMember: {
    breed: { '122': 25 },
    earlyBird: { cost: 25, days: 7 },
    normal: 35,
    optionalAdditionalCosts: [{ cost: 10, description: { fi: 'Ruokailu' } }],
  },
  entryStartDate: '2026-04-25',
  paymentTime: 'registration',
}

it('shows the payment details locked, and why, once the event has registrations (KOE-1568)', async () => {
  const screen = await render(
    <Frame>
      <PaymentSection event={event} locked open />
    </Frame>
  )

  await expect.element(screen.getByText(/joten hintoja ja maksuajankohtaa ei voi enää muuttaa/)).toBeVisible()
  await expect.element(screen.getByRole('button', { name: 'Lisää osallistumismaksu' })).toBeDisabled()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('payment-section-locked')
})
