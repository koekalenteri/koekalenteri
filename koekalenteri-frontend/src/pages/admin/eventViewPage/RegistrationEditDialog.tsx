import type { AuditRecord, Event } from 'koekalenteri-shared/model'

import { useEffect, useMemo, useState } from 'react'
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil'

import { getRegistrationAuditTrail } from '../../../api/registration'
import { hasChanges } from '../../../utils'
import { idTokenAtom } from '../../recoil'
import { currentAdminRegistrationSelector, editableAdminEventRegistrationByEventIdAndIdAtom } from '../recoil'

import RegistrationDialogBase from './RegistrationDialogBase'

interface Props {
  readonly event: Event
  readonly onClose?: () => void
  readonly open: boolean
  readonly registrationId: string
}

export default function RegistrationEditDialog({ event, registrationId, open, onClose }: Props) {
  const savedRegistration = useRecoilValue(currentAdminRegistrationSelector)
  const key = { eventId: event.id, id: registrationId }
  const [registration, setRegistration] = useRecoilState(editableAdminEventRegistrationByEventIdAndIdAtom(key))
  const resetRegistration = useResetRecoilState(editableAdminEventRegistrationByEventIdAndIdAtom(key))
  const token = useRecoilValue(idTokenAtom)
  const changes = useMemo(
    () => !!registration && !!savedRegistration && hasChanges(savedRegistration, registration),
    [registration, savedRegistration]
  )
  const [auditTrail, setAuditTrail] = useState<AuditRecord[]>([])

  useEffect(() => {
    if (!open) return
    resetRegistration()
    getRegistrationAuditTrail(event.id, registrationId, token)
      .then((at) => setAuditTrail(at ?? []))
      .catch((e) => {
        console.error(e)
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
