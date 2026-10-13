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

// KOE-1526: a reserve that had its whole fee back owes nothing, so its piggy bank stays plain; lifted
// into a place it owes the fee again and turns amber.
it('keeps the refund mark plain for a reserve whose fee was refunded', async () => {
  const refunded = (key: string): Registration => ({
    ...paid(40, false),
    group: { key, number: 1 },
    id: `refunded-${key}`,
    refundAmount: 40,
    refundAt: registrationWithStaticDates.createdAt,
    refundHandlingCost: 0,
    refundStatus: 'SUCCESS',
  })
  const screen = await render(
    <Frame>
      <RegistrationIcons event={event} reg={refunded('reserve')} />
      <RegistrationIcons event={event} reg={refunded('2021-02-10-ap')} />
    </Frame>
  )

  await expect.element(screen.getByTestId('visual-root')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('payment-mark-refunded-reserve')
})

// KOE-1104: the overpaid part can still be returned, so the row gets its own mark instead of the
// amber euro sign. The condition is money, not group: an overpaid reserve shows it too.
it('shows the overpaid mark when the fee is paid over', async () => {
  const screen = await render(
    <Frame>
      <RegistrationIcons event={event} reg={{ ...paid(45, false), group: { key: '2021-02-10-ap', number: 1 } }} />
      <RegistrationIcons
        event={event}
        reg={{ ...paid(45, false), group: { key: 'reserve', number: 1 }, id: 'overpaid-reserve' }}
      />
    </Frame>
  )

  await expect.element(screen.getByTestId('visual-root')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('payment-mark-overpaid')
})

// KOE-1526 review: refunded as a reserve, lifted into a place and paid again. The fee is paid and
// settled, so the euro sign shows as for any paid place, not the piggy bank of a fee that went back.
it('shows a refunded fee paid again as paid', async () => {
  const paidAgain: Registration = {
    ...paid(80, false),
    group: { key: '2021-02-10-ap', number: 1 },
    id: 'paid-again',
    refundAmount: 40,
    refundAt: registrationWithStaticDates.createdAt,
    refundHandlingCost: 0,
    refundStatus: 'SUCCESS',
  }
  const screen = await render(
    <Frame>
      <RegistrationIcons event={event} reg={paidAgain} />
    </Frame>
  )

  await expect.element(screen.getByTestId('visual-root')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('payment-mark-paid-again')
})
