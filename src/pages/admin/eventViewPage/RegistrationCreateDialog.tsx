import type { DogEvent, RegistrationClass } from '../../../types'
import { useCallback, useEffect } from 'react'
import { useRecoilState } from 'recoil'
import { adminNewRegistrationAtom, createAdminNewRegistration } from '../recoil'
import RegistrationDialogBase from './RegistrationDialogBase'

interface Props {
  readonly event: DogEvent
  readonly eventClass?: RegistrationClass
  readonly onClose?: () => void
  readonly open: boolean
}

export default function RegistrationCreateDialog({ event, eventClass, open, onClose }: Props) {
  const [registration, setRegistration] = useRecoilState(adminNewRegistrationAtom)
  const resetRegistration = useCallback(() => {
    setRegistration(createAdminNewRegistration())
  }, [setRegistration])

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
        class: eventClass,
        eventId: event.id,
        eventType: event.eventType,
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
