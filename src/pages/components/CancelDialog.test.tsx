import { render, screen } from '@testing-library/react'

import { eventWithStaticDatesAndClass } from '../../__mockData__/events'
import { registrationWithStaticDatesAndClass } from '../../__mockData__/registrations'
import { sanitizeDogEvent } from '../../lib/event'

import CancelDialog from './CancelDialog'

const publicEventWithStaticDatesAndClass = sanitizeDogEvent(eventWithStaticDatesAndClass)

describe('CancelDialog', () => {
  it('should display secretary contact info when disabled', () => {
    const { baseElement } = render(
      <CancelDialog
        disabled
        event={publicEventWithStaticDatesAndClass}
        open
        registration={registrationWithStaticDatesAndClass}
      />
    )

    expect(screen.getByText(`registration.cancelDialog.lateText registration, event, contact`)).toBeInTheDocument()
    expect(baseElement).toMatchSnapshot()
  })

  it('should render when not disabled', () => {
    const { baseElement } = render(
      <CancelDialog
        event={publicEventWithStaticDatesAndClass}
        open
        registration={registrationWithStaticDatesAndClass}
      />
    )

    expect(baseElement).toMatchSnapshot()
  })

  it.each(['handler-sick', 'dog-sick'])('should display additional info when reason is %p', (reason) => {
    const { baseElement } = render(
      <CancelDialog
        event={publicEventWithStaticDatesAndClass}
        open
        registration={{ ...registrationWithStaticDatesAndClass, cancelReason: reason }}
      />
    )

    expect(screen.getByText(`registration.cancelReason.${reason}-info`)).toBeInTheDocument()
    expect(baseElement).toMatchSnapshot()
  })

  it('should render for admin', () => {
    const { baseElement } = render(
      <CancelDialog
        admin
        event={publicEventWithStaticDatesAndClass}
        open
        registration={registrationWithStaticDatesAndClass}
      />
    )

    expect(baseElement).toMatchSnapshot()
  })

  it('should render for admin, with reason preselected', () => {
    const { baseElement } = render(
      <CancelDialog
        admin
        event={publicEventWithStaticDatesAndClass}
        open
        registration={{ ...registrationWithStaticDatesAndClass, cancelReason: 'handler-sick' }}
      />
    )

    expect(screen.queryByText(`registration.cancelReason.handler-sick-info`)).not.toBeInTheDocument()
    expect(screen.getByText('registration.cancelReason.handler-sick')).toBeInTheDocument()
    expect(baseElement).toMatchSnapshot()
  })
})
