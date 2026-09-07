import { render, screen } from '@testing-library/react'
import { eventWithStaticDatesAndClass } from '../../__mockData__/events'
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
