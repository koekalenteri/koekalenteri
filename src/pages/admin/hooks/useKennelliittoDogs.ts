import type { KcDogReport, KcPreviewResponse } from '@/lib/kennelliittoResults'
import type { Registration } from '@/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import useDebouncedCallback from '@/hooks/useDebouncedCallback'
import { reportError } from '@/lib/client/error'

/** Changes this close together are read once: a post saving dog after dog on the trial day is one read. */
export const KC_DOGS_REREAD_MS = 3000

/**
 * Where each dog of the trial stands with Kennelliitto, as the send dialog's preview says it. `refresh` reads
 * it: the results page gives it to `useResultsLock` as the read it makes on open, since a preview reads the
 * trial's state too. After that it is read again a moment after the dogs change in any way, whoever changed
 * them (a post, another secretary, a sending, the page's own saves), or after an edit of the event
 * (`modifiedAt`, which a preview's own state write does not move). Of two reads under way, the one asked
 * for last is kept, whichever answers last; a read that fails is reported and leaves the last answer standing.
 */
export const useKennelliittoDogs = (
  preview: () => Promise<KcPreviewResponse>,
  registrations: readonly Registration[],
  eventModifiedAt: Date | undefined,
  enabled: boolean
) => {
  const [dogs, setDogs] = useState<KcDogReport[]>()
  const asked = useRef(0)

  const refresh = useCallback(async () => {
    const read = ++asked.current
    const answer = await preview()
    if (read === asked.current) setDogs(answer.dogs)
  }, [preview])

  const reread = useDebouncedCallback(() => refresh().catch(reportError), KC_DOGS_REREAD_MS)
  const edited = eventModifiedAt?.getTime()
  const seen = useRef({ edited, registrations })
  useEffect(() => {
    if (seen.current.registrations === registrations && seen.current.edited === edited) return
    seen.current = { edited, registrations }
    if (enabled) reread()
  }, [edited, enabled, registrations, reread])

  return { dogs, refresh }
}
