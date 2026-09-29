import { useEffect, useReducer } from 'react'

/**
 * Re-renders the component every `intervalMs` while `active` holds, so a duration shown against the
 * clock ("8 min") stays honest without anything else changing.
 */
export const useTickWhile = (active: boolean, intervalMs: number) => {
  const [, tick] = useReducer((count: number) => count + 1, 0)

  useEffect(() => {
    if (!active) return
    const timer = setInterval(tick, intervalMs)
    return () => clearInterval(timer)
  }, [active, intervalMs])
}
