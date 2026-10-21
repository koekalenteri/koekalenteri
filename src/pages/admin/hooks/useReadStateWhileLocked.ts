import { useEffect, useRef } from 'react'
import { reportError } from '@/lib/client/error'

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
