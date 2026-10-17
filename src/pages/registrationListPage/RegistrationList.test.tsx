import type { PaymentPicture, PublicDogEvent, Registration } from '../../types'
import { ThemeProvider } from '@mui/material/styles'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { eventWithStaticDates } from '../../__mockData__/events'
import { paymentPictureWith } from '../../__mockData__/paymentPicture'
import { registrationWithStaticDates, unpaidRegistrationWithStaticDates } from '../../__mockData__/registrations'
import theme from '../../assets/Theme'
import { DIM_OPACITY } from '../components/icons/constants'
import RegistrationList from './RegistrationList'

const noop = () => {}

/** The fee is 123, what registrationWithStaticDates has paid; paying at entry unless told otherwise. */
const eventCosting = (paymentTime: PublicDogEvent['paymentTime'] = 'registration'): PublicDogEvent => ({
  ...eventWithStaticDates,
  cost: 123,
  costMember: 123,
  paymentTime,
})

const renderList = (
  event: PublicDogEvent,
  row: Registration,
  payment: PaymentPicture,
  paymentVerificationInProgress = false
) =>
  render(
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <RegistrationList
          event={event}
          rows={[{ ...row, payment }]}
          onUnregister={noop}
          paymentVerificationInProgress={paymentVerificationInProgress}
        />
      </MemoryRouter>
    </ThemeProvider>
  )

const payAction = () => screen.queryByRole('button', { name: 'registration.actions.pay' })

const owing = paymentPictureWith({ canPay: true, due: 123, standing: false, status: 'unpaid' })

// Paying stays on the row as a button beside the menu (KOE-973); only editing and cancelling are
// behind it. Whether to offer it is the server's picture, the same answer the status box's pay
// button reads: only the server knows the group (KOE-1526, KOE-1530). The row beside it says
// nothing: each test gives a row that disagrees with the picture.
describe('RegistrationList', () => {
  it("offers paying when the server's picture says so", () => {
    renderList(eventCosting(), registrationWithStaticDates, owing)

    expect(payAction()).toBeInTheDocument()
  })

  it("does not offer paying when the server's picture says not to", () => {
    renderList(eventCosting(), unpaidRegistrationWithStaticDates, paymentPictureWith())

    expect(payAction()).not.toBeInTheDocument()
  })

  it('offers paying to a place picked but not yet confirmed when the trial is paid at confirmation', () => {
    renderList(
      eventCosting('confirmation'),
      { ...unpaidRegistrationWithStaticDates, confirmed: false, messagesSent: { picked: true } },
      owing
    )

    expect(payAction()).toBeInTheDocument()
  })

  it('does not offer paying to a confirmed entry moved back to the reserve list', () => {
    renderList(
      eventCosting('confirmation'),
      { ...unpaidRegistrationWithStaticDates, confirmed: true },
      paymentPictureWith({ due: 123, standing: false, status: 'waitingForPlace' })
    )

    expect(payAction()).not.toBeInTheDocument()
  })

  it('does not offer paying a payment charged twice', () => {
    renderList(eventCosting(), unpaidRegistrationWithStaticDates, paymentPictureWith({ due: 123, status: 'duplicate' }))

    expect(payAction()).not.toBeInTheDocument()
  })

  // KOE-1526 review: the screenshot comparator lets an icon-only change through, so the dimming of
  // the row's euro sign is pinned here: a fee that went back is not paid, a paid fee is.
  it.each([
    [
      'a fee that went back',
      paymentPictureWith({ refundedAmount: 123, standing: false, status: 'refunded' }),
      String(DIM_OPACITY),
    ],
    ['a paid fee', paymentPictureWith(), '1'],
    ['a fee paid over', paymentPictureWith({ excess: 5, status: 'overpaid' }), '1'],
  ])('dims the euro sign of %s', (_name, payment, opacity) => {
    renderList(eventCosting(), registrationWithStaticDates, payment)

    expect(screen.getAllByTestId('EuroOutlinedIcon')[0]).toHaveAttribute('opacity', opacity)
  })

  it('does not offer paying while a payment is being verified', () => {
    renderList(eventCosting(), unpaidRegistrationWithStaticDates, owing, true)

    expect(payAction()).not.toBeInTheDocument()
  })
})
