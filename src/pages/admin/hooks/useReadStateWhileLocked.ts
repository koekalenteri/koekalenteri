import type { KcState } from '@/types'
import { useCallback, useEffect, useRef } from 'react'
import { reportError } from '@/lib/client/error'
import { isResultsLocked } from '@/lib/kennelliittoResults'

/**
 * A page that is locked reads Kennelliitto's state once it is: the state is what locks, so a judge who
 * has sent the trial back opens it again without anyone asking. One read per time it becomes locked, not
 * one per render, whatever identity `read` has (KOE-1140).
 */
export const useReadStateWhileLocked = (locked: boolean, read: () => Promise<unknown>) => {
  const latest = useRef(read)
  useEffect(() => {
    latest.current = read
  })

  useEffect(() => {
    if (locked) latest.current().catch(reportError)
  }, [locked])
}

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
