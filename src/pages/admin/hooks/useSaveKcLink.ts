import type { DogEvent, Patch } from '@/types'
import { useCallback } from 'react'
import { useAdminEventActions } from '../state'

/**
 * Saving a link picked outside the event form, which has no draft to hold it: the patch goes onto the
 * stored event straight away. The results page header and the Omakoira section of the event view both
 * offer the lookup this way (KOE-452, KOE-1579).
 */
export const useSaveKcLink = (event?: DogEvent | null) => {
  const eventActions = useAdminEventActions()
  return useCallback(
    async (patch: Patch<DogEvent>) => {
      if (event) await eventActions.save({ ...event, ...patch })
    },
    [event, eventActions]
  )
}
