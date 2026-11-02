import type { KcDogReport, KcPreviewResponse } from '@/lib/kennelliittoResults'
import type { Registration } from '@/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useDebouncedCallback from '@/hooks/useDebouncedCallback'
import { reportError } from '@/lib/client/error'

/** Changes this close together are read once: a post saving dog after dog on the trial day is one read. */
export const KC_DOGS_REREAD_MS = 3000

/**
 * What of the dogs can move a status the preview gives: a result saved (by this page, a post or another
 * secretary), a sending recorded, a dog cancelled, moved or renamed. The event's own edits (judges, posts)
 * count by its `modifiedAt`. The stamps go in as they are: `JSON.stringify` writes a Date as its instant.
 */
const statusInputsOf = (registrations: readonly Registration[], eventModifiedAt: Date | undefined): string =>
  JSON.stringify([
    eventModifiedAt,
    registrations.map(({ cancelled, dog, eventResult, group, id, kcResult, startGroup }) => [
      id,
      eventResult?.updatedAt,
      kcResult?.at,
      kcResult?.status,
      cancelled,
      group?.key,
      group?.date,
      startGroup?.key,
      dog.name,
      dog.regNo,
    ]),
  ])

/**
 * Where each dog of the trial stands with Kennelliitto, as the send dialog's preview says it. `refresh` reads
 * it: the results page gives it to `useResultsLock` as the read it makes on open, since a preview reads the
 * trial's state too. After that it is read again a moment after the dogs change, whoever changed them, the
 * page's own saves included. Of two reads under way, the one asked for last is kept, whichever answers last;
 * a read that fails is reported and leaves the last answer standing.
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
  const inputs = useMemo(() => statusInputsOf(registrations, eventModifiedAt), [registrations, eventModifiedAt])
  const seen = useRef(inputs)
  useEffect(() => {
    if (seen.current === inputs) return
    seen.current = inputs
    if (enabled) reread()
  }, [enabled, inputs, reread])

  return { dogs, refresh }
}
