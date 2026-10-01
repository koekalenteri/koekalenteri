import { useCallback, useEffect, useRef } from 'react'

interface DebounceOptions {
  /**
   * Deliver a pending call at once when focus leaves the element that had it when the call was made:
   * the field a value is typed into. A value typed just before the next field or Tallenna is clicked
   * is then there for that click to see, instead of arriving after it (KOE-1483).
   */
  readonly flushOnBlur?: boolean
}

export default function useDebouncedCallback<T extends (...args: any[]) => ReturnType<T>>(
  callback?: T,
  wait = 100,
  { flushOnBlur = false }: DebounceOptions = {}
): (...args: Parameters<T>) => unknown {
  const timeout = useRef<ReturnType<typeof globalThis.setTimeout> | undefined>(undefined)
  const pending = useRef<(() => void) | undefined>(undefined)
  const blurTarget = useRef<Element | undefined>(undefined)
  const cb = useRef(callback)
  cb.current = callback

  const flush = useCallback(() => {
    const run = pending.current
    globalThis.clearTimeout(timeout.current)
    timeout.current = undefined
    pending.current = undefined
    blurTarget.current?.removeEventListener('focusout', flush)
    blurTarget.current = undefined
    run?.()
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: we need to clear the timeout when wait changes
  useEffect(
    () => () => {
      globalThis.clearTimeout(timeout.current)
      timeout.current = undefined
      pending.current = undefined
      blurTarget.current?.removeEventListener('focusout', flush)
      blurTarget.current = undefined
    },
    [wait]
  )

  return useCallback(
    (...args) => {
      clearTimeout(timeout.current)
      pending.current = () => cb.current?.apply(null, args)
      timeout.current = globalThis.setTimeout(flush, wait)

      const focused = document.activeElement
      if (!flushOnBlur || !focused || focused === document.body || focused === blurTarget.current) return
      blurTarget.current?.removeEventListener('focusout', flush)
      blurTarget.current = focused
      focused.addEventListener('focusout', flush)
    },
    [flush, flushOnBlur, wait]
  )
}
