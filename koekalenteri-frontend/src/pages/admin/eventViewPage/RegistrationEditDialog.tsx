import { useEffect, useMemo, useState } from 'react'
import { AuditRecord, Event } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil'

import { getRegistrationAuditTrail } from '../../../api/registration'
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
  const [auditTrail, setAuditTrail] = useState<AuditRecord[]>([])

  useEffect(() => {
    if (!open) return
    resetRegistration()
    getRegistrationAuditTrail(event.id, registrationId)
      .then((at) => setAuditTrail(at ?? []))
      .catch((e) => {
        console.error(e)
        setAuditTrail([])
      })
  }, [registrationId, savedRegistration, resetRegistration, event.id, open])

  return (
    <RegistrationDialogBase
      changes={changes}
      event={event}
      onClose={onClose}
      open={open}
      registration={registration}
      resetRegistration={resetRegistration}
      setRegistration={setRegistration}
      auditTrail={auditTrail}
    />
  )
}
