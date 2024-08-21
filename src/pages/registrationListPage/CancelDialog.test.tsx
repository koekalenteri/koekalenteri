import { render, screen } from '@testing-library/react'
import { t } from 'i18next'

import { eventWithStaticDatesAndClass } from '../../__mockData__/events'
import { registrationWithStaticDatesAndClass } from '../../__mockData__/registrations'
import { sanitizeDogEvent } from '../../lib/event'

import { CancelDialog } from './CancelDialog'

const publicEventWithStaticDatesAndClass = sanitizeDogEvent(eventWithStaticDatesAndClass)

describe('CancelDialog', () => {
  it('should display secretary contact info when disabled', () => {
    const { baseElement } = render(
      <CancelDialog
        disabled
        event={publicEventWithStaticDatesAndClass}
        open
        registration={registrationWithStaticDatesAndClass}
        t={t}
      />
    )

    const { name = 'secretary name', phone = 'secretary phone' } =
      publicEventWithStaticDatesAndClass.contactInfo?.secretary ?? {}

    expect(
      screen.getByText(
        `Ilmoittautumisen voi perua kokeen alkamispäivänä ja kokeen alkamista edeltävänä päivänä vain ottamalla yhteyttä suoraan koesihteeriin ${name} ${phone}`
      )
    ).toBeInTheDocument()
    expect(baseElement).toMatchSnapshot()
  })

  it('should render when not disabled', () => {
    const { baseElement } = render(
      <CancelDialog
        event={publicEventWithStaticDatesAndClass}
        open
        registration={registrationWithStaticDatesAndClass}
        t={t}
      />
    )

    expect(baseElement).toMatchSnapshot()
  })
})
