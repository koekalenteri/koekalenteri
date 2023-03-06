import { useEffect, useMemo } from 'react'
import { Event } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil'

import { hasChanges } from '../../../utils'
import { currentAdminRegistrationSelector, editableCurrentAdminEventRegistrationByIdAtom } from '../recoil'

import RegistrationDialogBase from './RegistrationDialogBase'

interface Props {
  event: Event
  onClose?: () => void
  open: boolean
  registrationId: string
}

export default function RegistrationEditDialog({ event, registrationId, open, onClose }: Props) {
  const savedRegistration = useRecoilValue(currentAdminRegistrationSelector)
  const [registration, setRegistration] = useRecoilState(editableCurrentAdminEventRegistrationByIdAtom(registrationId))
  const resetRegistration = useResetRecoilState(editableCurrentAdminEventRegistrationByIdAtom(registrationId))
  const changes = useMemo(
    () => !!registration && !!savedRegistration && hasChanges(savedRegistration, registration),
    [registration, savedRegistration]
  )

  useEffect(() => {
    resetRegistration()
  }, [registrationId, savedRegistration, resetRegistration])

  return (
    <RegistrationDialogBase
      changes={changes}
      event={event}
      onClose={onClose}
      open={open}
      registration={registration}
      resetRegistration={resetRegistration}
      setRegistration={setRegistration}
    />
  )
}
