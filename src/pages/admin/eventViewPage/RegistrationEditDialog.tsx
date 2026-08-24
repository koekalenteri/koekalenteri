import type { AuditRecord, DogEvent } from '../../../types'
import { useAtom, useAtomValue } from 'jotai'
import { useResetAtom } from 'jotai/utils'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getRegistrationAuditTrail } from '../../../api/registration'
import { mergeAuditTrail, useAuditTrailSubscription } from '../../../hooks/useAuditTrailSubscription'
import { reportError } from '../../../lib/client/error'
import { getChanges, isEmptyObject } from '../../../lib/utils'
import { validIdTokenAtom } from '../../state'
import { adminEditableEventRegistrationByEventIdAndIdAtom, adminEventRegistrationAtom } from '../state'
import RegistrationDialogBase from './RegistrationDialogBase'

interface Props {
  readonly event: DogEvent
  readonly onClose?: () => void
  readonly open: boolean
  readonly registrationId: string
}

export default function RegistrationEditDialog({ event, registrationId, open, onClose }: Props) {
  const savedRegistration = useAtomValue(adminEventRegistrationAtom({ eventId: event.id, id: registrationId }))
  const key = { eventId: event.id, id: registrationId }
  const [registration, setRegistration] = useAtom(adminEditableEventRegistrationByEventIdAndIdAtom(key))
  const resetRegistration = useResetAtom(adminEditableEventRegistrationByEventIdAndIdAtom(key))
  const token = useAtomValue(validIdTokenAtom)
  const initialRegistration = useRef(savedRegistration)
  if (!open) initialRegistration.current = savedRegistration
  if (!initialRegistration.current && savedRegistration) initialRegistration.current = savedRegistration
  const registrationChanges = useMemo(() => getChanges(initialRegistration.current, registration), [registration])
  const changes = !isEmptyObject(registrationChanges)
  const [auditTrail, setAuditTrail] = useState<AuditRecord[]>([])
  useAuditTrailSubscription(`${event.id}:${registrationId}`, open, setAuditTrail)

  useEffect(() => {
    if (!open || !token) return
    resetRegistration()
    setAuditTrail([])
    getRegistrationAuditTrail(event.id, registrationId, token)
      .then((at) => setAuditTrail((current) => mergeAuditTrail(at ?? [], current)))
      .catch((e) => {
        reportError(e)
        setAuditTrail([])
      })
  }, [registrationId, resetRegistration, event.id, open, token])

  useEffect(() => {
    if (!open || !token) return
    if (registration?.eventId !== event.id) return
    if (registration.eventType !== event.eventType) {
      setRegistration({ ...registration, eventType: event.eventType })
    }
    if (!event.classes.length && registration.class) {
      setRegistration({ ...registration, class: null })
    }
  }, [event, registration, open, setRegistration, token])

  return (
    <RegistrationDialogBase
      changes={changes}
      event={event}
      onClose={onClose}
      open={open}
      registration={registration}
      savedRegistration={savedRegistration}
      patchBase={initialRegistration.current}
      resetRegistration={resetRegistration}
      setRegistration={setRegistration}
      auditTrail={auditTrail}
    />
  )
}
