import { atom, useSetAtom } from 'jotai'
import { useEffect } from 'react'

/**
 * The guide page the current view claims for itself, when its route alone cannot say — the event
 * page's guide is one page while entry is open and another after. Unset, the header falls back to
 * the route (KOE-1402).
 */
export const helpPathAtom = atom<string | undefined>(undefined)

/** Claims the guide page for as long as the view is mounted. */
export const useHelpPath = (path: string | undefined) => {
  const setHelpPath = useSetAtom(helpPathAtom)

  useEffect(() => {
    setHelpPath(path)

    return () => setHelpPath(undefined)
  }, [path, setHelpPath])
}
