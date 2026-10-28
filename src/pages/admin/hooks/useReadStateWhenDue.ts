import { useEffect, useRef } from 'react'
import { reportError } from '@/lib/client/error'

/**
 * Reads Kennelliitto's state each time a read falls due, which is when `due` turns true: a page that
 * reads on open (`due` from the start), or a trial that shows locked, since the state is what locks and a
 * judge who has sent the trial back opens it again without anyone asking. One read per time it falls due,
 * not one per render, whatever identity `read` has (KOE-1140, KOE-1222).
 */
export const useReadStateWhenDue = (due: boolean, read: () => Promise<unknown>) => {
  const latest = useRef(read)
  useEffect(() => {
    latest.current = read
  })

  useEffect(() => {
    if (due) latest.current().catch(reportError)
  }, [due])
}
