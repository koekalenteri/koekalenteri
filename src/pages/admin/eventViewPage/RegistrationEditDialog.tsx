import type { AuditRecord, DogEvent } from '../../../types'

import { useEffect, useMemo, useState } from 'react'
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil'

import { getRegistrationAuditTrail } from '../../../api/registration'
import { reportError } from '../../../lib/client/error'
import { hasChanges } from '../../../lib/utils'
import { idTokenAtom } from '../../recoil'
import { adminEditableEventRegistrationByEventIdAndIdAtom, adminEventRegistrationSelector } from '../recoil'

import RegistrationDialogBase from './RegistrationDialogBase'

interface Props {
  readonly event: DogEvent
  readonly onClose?: () => void
  readonly open: boolean
  readonly registrationId: string
}

export default function RegistrationEditDialog({ event, registrationId, open, onClose }: Props) {
  const savedRegistration = useRecoilValue(adminEventRegistrationSelector({ eventId: event.id, id: registrationId }))
  const key = { eventId: event.id, id: registrationId }
  const [registration, setRegistration] = useRecoilState(adminEditableEventRegistrationByEventIdAndIdAtom(key))
  const resetRegistration = useResetRecoilState(adminEditableEventRegistrationByEventIdAndIdAtom(key))
  const token = useRecoilValue(idTokenAtom)
  const changes = useMemo(
    () => !!registration && !!savedRegistration && hasChanges(savedRegistration, registration),
    [registration, savedRegistration]
  )
  const [auditTrail, setAuditTrail] = useState<AuditRecord[]>([])

  useEffect(() => {
    if (!open || !token) return
    resetRegistration()
    getRegistrationAuditTrail(event.id, registrationId, token)
      .then((at) => setAuditTrail(at ?? []))
      .catch((e) => {
        reportError(e)
        setAuditTrail([])
      })
  }, [registrationId, savedRegistration, resetRegistration, event.id, open, token])

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
