import type { ConfirmedEvent, Registration } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import { registrationWithStaticDates } from '@/__mockData__/registrations'
import { eventWithStations } from '@/__mockData__/resultsEvent'
import theme from '@/assets/Theme'
import RegistrationIcons from './RegistrationIcons'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 8, width: 320 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// The fee is 40, the member price 35.
const event: ConfirmedEvent = { ...eventWithStations, cost: 40, costMember: 35 }

const paid = (paidAmount: number, membership: boolean): Registration => ({
  ...registrationWithStaticDates,
  eventId: event.id,
  eventType: event.eventType,
  handler: { ...registrationWithStaticDates.handler, membership },
  id: `paid-${paidAmount}`,
  internalNotes: '',
  notes: '',
  owner: { ...registrationWithStaticDates.owner, membership },
  paidAmount,
})

// Three rows the secretary tells apart by the euro sign alone: paid as it reads, a member price
// paid by a non-member (KOE-722), and the full price paid by a member (KOE-1382). The last two
// turn the sign amber - the money does not match the fee, whichever way.
it('turns the payment mark amber when the fee and the payment no longer match', async () => {
  const screen = await render(
    <Frame>
      <RegistrationIcons event={event} reg={paid(40, false)} />
      <RegistrationIcons event={event} reg={paid(35, false)} />
      <RegistrationIcons event={event} reg={paid(40, true)} />
    </Frame>
  )

  await expect.element(screen.getByTestId('visual-root')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('payment-mark-unsettled')
})
