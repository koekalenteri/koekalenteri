import type { PublicDogEvent, Registration } from '../../types'
import { ThemeProvider } from '@mui/material/styles'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { eventWithStaticDates } from '../../__mockData__/events'
import { registrationWithStaticDates, unpaidRegistrationWithStaticDates } from '../../__mockData__/registrations'
import theme from '../../assets/Theme'
import RegistrationList from './RegistrationList'

const noop = () => {}

/** The fee is 123, what registrationWithStaticDates has paid; paying at entry unless told otherwise. */
const eventCosting = (paymentTime: PublicDogEvent['paymentTime'] = 'registration'): PublicDogEvent => ({
  ...eventWithStaticDates,
  cost: 123,
  costMember: 123,
  paymentTime,
})

const renderList = (event: PublicDogEvent, row: Registration, paymentVerificationInProgress = false) =>
  render(
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <RegistrationList
          event={event}
          rows={[row]}
          onUnregister={noop}
          paymentVerificationInProgress={paymentVerificationInProgress}
        />
      </MemoryRouter>
    </ThemeProvider>
  )

const payAction = () => screen.queryByRole('button', { name: 'registration.actions.pay' })

// Paying stays on the row as a button beside the menu (KOE-973); only editing and cancelling are
// behind it. Whether to offer it is the server's `shouldPay`, the same answer the status box's pay
// button reads: only the server knows the group (KOE-1526).
describe('RegistrationList', () => {
  it("offers paying when the server's shouldPay says so", () => {
    renderList(eventCosting(), { ...registrationWithStaticDates, shouldPay: true })

    expect(payAction()).toBeInTheDocument()
  })

  it("does not offer paying when the server's shouldPay says not to", () => {
    renderList(eventCosting(), { ...registrationWithStaticDates, shouldPay: false })

    expect(payAction()).not.toBeInTheDocument()
  })

  it('offers paying to a place picked but not yet confirmed when the trial is paid at confirmation', () => {
    renderList(eventCosting('confirmation'), {
      ...unpaidRegistrationWithStaticDates,
      confirmed: false,
      messagesSent: { picked: true },
      shouldPay: true,
    })

    expect(payAction()).toBeInTheDocument()
  })

  it('does not offer paying to a confirmed entry moved back to the reserve list', () => {
    renderList(eventCosting('confirmation'), {
      ...unpaidRegistrationWithStaticDates,
      confirmed: true,
      shouldPay: false,
    })

    expect(payAction()).not.toBeInTheDocument()
  })

  it('does not offer paying a payment charged twice', () => {
    renderList(eventCosting(), { ...unpaidRegistrationWithStaticDates, paymentStatus: 'DUPLICATE', shouldPay: true })

    expect(payAction()).not.toBeInTheDocument()
  })

  it('does not offer paying while a payment is being verified', () => {
    renderList(eventCosting(), { ...unpaidRegistrationWithStaticDates, shouldPay: true }, true)

    expect(payAction()).not.toBeInTheDocument()
  })
})
