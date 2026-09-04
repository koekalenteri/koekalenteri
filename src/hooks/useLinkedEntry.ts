import { useEffect, useState } from 'react'

/**
 * What a tokenized link loads (KOE-1258, KOE-1267): the fetch, its abort, and the one outcome a wrong
 * token, a revoked one and a thing that never existed all share — the link opens nothing, and the
 * screen says no more than that.
 *
 * The loaded data is state rather than a cache: a link has no socket to hear its own writes on, so
 * every screen built on one folds its save's answer back in through `setEntry`.
 */
export const useLinkedEntry = <T>(load: (signal: AbortSignal) => Promise<T>) => {
  const [entry, setEntry] = useState<T>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const abort = new AbortController()

    load(abort.signal)
      .then((data) => setEntry(data))
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true)
      })

    return () => abort.abort()
  }, [load])

  return { entry, failed, setEntry }
}
