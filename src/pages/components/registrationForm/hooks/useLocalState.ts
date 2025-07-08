import { useEffect, useState } from 'react'

import useDebouncedCallback from '../../../../hooks/useDebouncedCallback'

/**
 * Hook to manage local state for form inputs with debounced updates to parent
 *
 * @param initialValue The initial value of the state
 * @param onChange Callback function to notify parent of changes
 * @param debounceTime Debounce time in milliseconds
 * @returns [localValue, setLocalValue, isPending]
 */
export function useLocalState<T>(
  initialValue: T,
  onChange?: (value: T) => void,
  debounceTime = 300
): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  const [localValue, setLocalValue] = useState<T>(initialValue)
  const [isPending, setIsPending] = useState(false)

  // Update local state when initialValue changes from parent
  useEffect(() => {
    setLocalValue(initialValue)
  }, [initialValue])

  // Debounced callback to notify parent of changes
  const debouncedOnChange = useDebouncedCallback((value: T) => {
    onChange?.(value)
    setIsPending(false)
  }, debounceTime)

  // Function to update local state and trigger debounced update
  const updateValue = (value: T | ((prev: T) => T)) => {
    setIsPending(true)
    setLocalValue((prev) => {
      const newValue = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value

      if (newValue === prev) return prev

      debouncedOnChange(newValue)
      return newValue
    })
  }

  return [localValue, updateValue, isPending]
}
