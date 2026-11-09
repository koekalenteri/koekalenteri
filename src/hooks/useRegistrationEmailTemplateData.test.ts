import type { ConfirmedEvent, Registration } from '../types'
import { renderHook } from '@testing-library/react'
import { eventWithStaticDatesAndClass } from '../__mockData__/events'
import { registrationWithStaticDatesAndClass } from '../__mockData__/registrations'
import { useRegistrationEmailTemplateData } from './useRegistrationEmailTemplateData'

describe('useRegistrationEmailTemplateData', () => {
  // KOE-674: the secretary's message preview shows an own class as the email will, by its name.
  it('previews an own class by its name, as the email reads it', () => {
    const event: ConfirmedEvent = {
      ...eventWithStaticDatesAndClass,
      classes: eventWithStaticDatesAndClass.classes.map((eventClass) => ({ ...eventClass, class: 'DERBY' })),
      eventType: 'WT-harjoitus',
      ownClasses: [{ code: 'DERBY', name: { fi: 'Derby-luokka' } }],
    }
    const registration: Registration = { ...registrationWithStaticDatesAndClass, class: 'DERBY', language: 'fi' }

    const { result } = renderHook(() => useRegistrationEmailTemplateData(registration, event, '', 'text'))

    expect(result.current).toMatchObject({ reg: { class: 'Derby-luokka' } })
  })
})
