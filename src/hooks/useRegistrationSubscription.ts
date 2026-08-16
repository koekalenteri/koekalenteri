import type { Patch, Registration } from '../types'
import { useCallback, useEffect } from 'react'
import { patchMerge } from '../lib/utils'
import { useWebSocketContext } from './useWebSocket'

export function useRegistrationSubscription(
  registration: Registration | null | undefined,
  setRegistration: (
    value: Registration | ((current: Registration | null | undefined) => Registration | null | undefined)
  ) => void
) {
  const { subscribeRegistration, unsubscribeRegistration } = useWebSocketContext()
  const applyRegistrationPatch = useCallback(
    (patch: Patch<Registration>) => {
      setRegistration((current) => (current ? patchMerge(current, patch) : current))
    },
    [setRegistration]
  )

  useEffect(() => {
    if (!registration?.editToken) return

    subscribeRegistration(registration.eventId, registration.id, registration.editToken, applyRegistrationPatch)
    return unsubscribeRegistration
  }, [
    applyRegistrationPatch,
    registration?.editToken,
    registration?.eventId,
    registration?.id,
    subscribeRegistration,
    unsubscribeRegistration,
  ])
}
