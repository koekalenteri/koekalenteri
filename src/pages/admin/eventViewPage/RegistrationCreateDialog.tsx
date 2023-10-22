import type { Event, RegistrationClass } from '../../../types'

import { useEffect } from 'react'
import { useRecoilState, useResetRecoilState } from 'recoil'

import { adminNewRegistrationAtom } from '../recoil'

import RegistrationDialogBase from './RegistrationDialogBase'

interface Props {
  readonly event: Event
  readonly eventClass?: RegistrationClass
  readonly onClose?: () => void
  readonly open: boolean
}

export default function RegistrationCreateDialog({ event, eventClass, open, onClose }: Props) {
  const [registration, setRegistration] = useRecoilState(adminNewRegistrationAtom)
  const resetRegistration = useResetRecoilState(adminNewRegistrationAtom)

  useEffect(() => {
    if (!registration || !open) {
      return
    }
    if (
      registration.eventId !== event.id ||
      registration.eventType !== event.eventType ||
      (eventClass && registration.class !== eventClass)
    ) {
      setRegistration({
        ...registration,
        eventId: event.id,
        eventType: event.eventType,
        class: eventClass,
      })
    }
  }, [registration, event, setRegistration, eventClass, open])

  return (
    <RegistrationDialogBase
      changes
      classDisabled
      event={event}
      onClose={onClose}
      open={open}
      registration={registration}
      resetRegistration={resetRegistration}
      setRegistration={setRegistration}
    />
  )
}
