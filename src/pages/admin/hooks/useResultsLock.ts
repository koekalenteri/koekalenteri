import type { KcState } from '@/types'
import { useCallback } from 'react'
import { isResultsLocked } from '@/lib/kennelliittoResults'
import { useReadStateWhenDue } from './useReadStateWhenDue'

/**
 * Whether the trial's results are with the chief judge, and how to read that afresh. Every view that
 * edits or sends results reads the lock the same way: from the event's stored state, read again from
 * Kennelliitto as soon as it is locked, and on demand through `refreshState` (an empty preview, which
 * writes the state it finds onto the event). A page that edits results asks for `readOnOpen` too, so a
 * trial handed over or confirmed in Omakoira directly locks when the page opens (KOE-1222). The state
 * read reaches the page over the socket, as the event patch the server publishes.
 */
export const useResultsLock = (
  event: { readonly kcState?: Pick<KcState, 'code'> } | null | undefined,
  preview: (registrationIds?: string[]) => Promise<unknown>,
  { readOnOpen = false }: { readonly readOnOpen?: boolean } = {}
) => {
  const locked = event ? isResultsLocked(event) : false
  const refreshState = useCallback(() => preview([]), [preview])
  // Read on open stays due once it is, so the read it makes finding the trial locked reads nothing more.
  useReadStateWhenDue(readOnOpen || locked, refreshState)
  return { locked, refreshState }
}
