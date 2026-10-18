import { render, screen } from '@testing-library/react'
import { eventWithStaticDatesAndClass } from '../../__mockData__/events'
import { paymentPictureWith } from '../../__mockData__/paymentPicture'
import {
  registrationWithStaticDatesAndClass,
  unpaidRegistrationWithStaticDatesAndClass,
} from '../../__mockData__/registrations'
import { sanitizeDogEvent } from '../../lib/event'
import { renderWithUserEvents } from '../../test-utils/utils'
import CancelDialog from './CancelDialog'

const publicEventWithStaticDatesAndClass = sanitizeDogEvent(eventWithStaticDatesAndClass)

describe('CancelDialog', () => {
  it('should display secretary contact info when disabled', () => {
    render(
      <CancelDialog
        disabled
        event={publicEventWithStaticDatesAndClass}
        open
        registration={registrationWithStaticDatesAndClass}
      />
    )

    expect(screen.getByText(`registration.cancelDialog.lateText contact, event, registration`)).toBeInTheDocument()
    expect(screen.queryByLabelText('registration.cancelDialog.reason')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'registration.cancelDialog.cta' })).not.toBeInTheDocument()
  })

  it('should render when not disabled', () => {
    render(
      <CancelDialog
        event={publicEventWithStaticDatesAndClass}
        open
        registration={registrationWithStaticDatesAndClass}
      />
    )

    expect(screen.getByLabelText('registration.cancelDialog.reason')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'registration.cancelDialog.cta' })).toBeInTheDocument()
  })

  it.each(['handler-sick', 'dog-sick'])('should display additional info when reason is %p', (reason) => {
    render(
      <CancelDialog
        event={publicEventWithStaticDatesAndClass}
        open
        registration={{ ...registrationWithStaticDatesAndClass, cancelReason: reason }}
      />
    )

    expect(screen.getByText(`registration.cancelReason.${reason}-info`)).toBeInTheDocument()
  })

  it('should offer the unpaid reason to an admin cancelling an unpaid registration', async () => {
    const { user } = renderWithUserEvents(
      <CancelDialog
        admin
        event={publicEventWithStaticDatesAndClass}
        open
        registration={unpaidRegistrationWithStaticDatesAndClass}
      />
    )

    await user.click(screen.getByLabelText('registration.cancelDialog.reason'))

    expect(screen.getByRole('option', { name: 'registration.cancelReason.unpaid' })).toBeInTheDocument()
  })

  // KOE-1526: a reserve whose fee went back and that was then lifted into a place has paid nothing
  // for it, so it can be cancelled as unpaid like any other.
  it('should offer the unpaid reason when the payment went back', async () => {
    const { user } = renderWithUserEvents(
      <CancelDialog
        admin
        event={publicEventWithStaticDatesAndClass}
        open
        registration={{ ...registrationWithStaticDatesAndClass, refundAmount: 123, refundHandlingCost: 0 }}
      />
    )

    await user.click(screen.getByLabelText('registration.cancelDialog.reason'))

    expect(screen.getByRole('option', { name: 'registration.cancelReason.unpaid' })).toBeInTheDocument()
  })

  // The unpaid reason by the payment rule in a confirmed trial; by the mark of a payment in one not
  // confirmed yet, which has no fee to read (KOE-1526).
  it.each([
    [
      'a paid entry in a confirmed trial',
      publicEventWithStaticDatesAndClass,
      registrationWithStaticDatesAndClass,
      false,
    ],
    [
      'a paid entry in a tentative trial',
      { ...publicEventWithStaticDatesAndClass, state: 'tentative' as const },
      registrationWithStaticDatesAndClass,
      false,
    ],
    [
      'an unpaid entry in a tentative trial',
      { ...publicEventWithStaticDatesAndClass, state: 'tentative' as const },
      unpaidRegistrationWithStaticDatesAndClass,
      true,
    ],
    // A fee of nothing counts as paid for a place, but only in a confirmed trial (KOE-1552).
    [
      'an unpaid entry in a free tentative trial',
      { ...publicEventWithStaticDatesAndClass, cost: 0, costMember: 0, state: 'tentative' as const },
      unpaidRegistrationWithStaticDatesAndClass,
      true,
    ],
  ])('offers the unpaid reason for %s: %s', async (_name, event, registration, offered) => {
    const { user } = renderWithUserEvents(<CancelDialog admin event={event} open registration={registration} />)

    await user.click(screen.getByLabelText('registration.cancelDialog.reason'))

    expect(Boolean(screen.queryByRole('option', { name: 'registration.cancelReason.unpaid' }))).toBe(offered)
  })

  // KOE-1530: the participant's dialog takes whether the place is paid for from the server's picture,
  // whatever the row beside it says; the secretary's row has none and is read as above.
  it.each([
    ['a paid place', paymentPictureWith(), false],
    ['an unpaid place', paymentPictureWith({ paidForPlace: false, standing: false, status: 'unpaid' }), true],
  ])('offers the unpaid reason by the picture of %s: %s', async (_name, payment, offered) => {
    const { user } = renderWithUserEvents(
      <CancelDialog
        admin
        event={publicEventWithStaticDatesAndClass}
        open
        registration={{
          ...(offered ? registrationWithStaticDatesAndClass : unpaidRegistrationWithStaticDatesAndClass),
          payment,
        }}
      />
    )

    await user.click(screen.getByLabelText('registration.cancelDialog.reason'))

    expect(Boolean(screen.queryByRole('option', { name: 'registration.cancelReason.unpaid' }))).toBe(offered)
  })

  it('should render for admin, with reason preselected', () => {
    render(
      <CancelDialog
        admin
        event={publicEventWithStaticDatesAndClass}
        open
        registration={{ ...registrationWithStaticDatesAndClass, cancelReason: 'handler-sick' }}
      />
    )

    expect(screen.queryByText(`registration.cancelReason.handler-sick-info`)).not.toBeInTheDocument()
    expect(screen.getByText('registration.cancelReason.handler-sick')).toBeInTheDocument()
  })
})
