import { useCallback, useEffect, useRef } from 'react'

export default function useDebouncedCallback<T extends (...args: any[]) => ReturnType<T>>(
  callback?: T,
  wait = 100
): (...args: Parameters<T>) => unknown {
  const timeout = useRef<ReturnType<typeof globalThis.setTimeout> | undefined>()
  const cb = useRef(callback)
  cb.current = callback

  // biome-ignore lint/correctness/useExhaustiveDependencies: we need to clear the timeout when wait changes
  useEffect(
    () => () => {
      globalThis.clearTimeout(timeout.current)
      timeout.current = undefined
    },
    [wait]
  )

  return useCallback(
    (...args) => {
      clearTimeout(timeout.current)
      timeout.current = globalThis.setTimeout(() => {
        timeout.current = undefined
        cb.current?.apply(null, args)
      }, wait)
    },
    [wait]
  )
}
