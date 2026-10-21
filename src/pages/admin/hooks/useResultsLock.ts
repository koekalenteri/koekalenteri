import type { KcState } from '@/types'
import { useCallback } from 'react'
import { isResultsLocked } from '@/lib/kennelliittoResults'
import { useReadStateWhileLocked } from './useReadStateWhileLocked'

/**
 * Whether the trial's results are with the chief judge, and how to read that afresh. Every view that
 * edits or sends results reads the lock the same way: from the event's stored state, read again from
 * Kennelliitto as soon as it is locked, and on demand through `refreshState` (an empty preview, which
 * writes the state it finds onto the event).
 */
export const useResultsLock = (
  event: { readonly kcState?: Pick<KcState, 'code'> } | null | undefined,
  preview: (registrationIds?: string[]) => Promise<unknown>
) => {
  const locked = event ? isResultsLocked(event) : false
  const refreshState = useCallback(() => preview([]), [preview])
  useReadStateWhileLocked(locked, refreshState)
  return { locked, refreshState }
}
