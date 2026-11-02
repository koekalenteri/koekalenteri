import type { KcDogReport, KcPreviewResponse } from '@/lib/kennelliittoResults'
import { useCallback, useRef, useState } from 'react'

/**
 * Where each dog of the trial stands with Kennelliitto, as the send dialog's preview says it, read each
 * time `refresh` is called: the results page gives it to `useResultsLock` as the read it makes on open,
 * since a preview reads the trial's state too, and calls it after each save. Of two reads under way, the
 * one asked for last is kept, whichever answers last.
 */
export const useKennelliittoDogs = (preview: () => Promise<KcPreviewResponse>) => {
  const [dogs, setDogs] = useState<KcDogReport[]>()
  const asked = useRef(0)

  const refresh = useCallback(async () => {
    const read = ++asked.current
    const answer = await preview()
    if (read === asked.current) setDogs(answer.dogs)
  }, [preview])

  return { dogs, refresh }
}
