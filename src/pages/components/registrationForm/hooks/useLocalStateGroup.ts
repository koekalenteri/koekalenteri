import { useCallback, useEffect, useRef, useState } from 'react'
import useDebouncedCallback from '../../../../hooks/useDebouncedCallback'
import { hasChanges } from '../../../../lib/utils'

/**
 * Hook to manage a group of local states with a single debounced update
 * This solves the issue of multiple fields being updated within the debounce period
 * (like during autofill) where only the last field update would be processed
 *
 * @param initialValues The initial values object
 * @param onChange Callback function to notify parent of changes
 * @param debounceTime Debounce time in milliseconds
 * @returns [values, updateField, isPending]
 */
export function useLocalStateGroup<T extends Record<string, any>>(
  initialValues: T,
  onChange?: (values: T) => void,
  debounceTime = 300
): [T, <K extends keyof T>(field: K, value: T[K] | ((prev: T[K]) => T[K])) => void] {
  const [localValues, setLocalValues] = useState<T>(initialValues)
  const pendingUpdates = useRef<Partial<T>>({})
  const pendingFromUser = useRef<boolean>(false)
  const prevInitialValues = useRef<T>(initialValues)

  // Update local state when initialValues change from parent
  useEffect(() => {
    // Only update if the values actually changed (deep comparison)
    if (hasChanges(prevInitialValues.current, initialValues)) {
      setLocalValues(initialValues)
      prevInitialValues.current = initialValues
      // Clear any pending updates since we're getting fresh values from parent
      pendingUpdates.current = {}
      pendingFromUser.current = false
    }
  }, [initialValues])

  // Debounced callback to notify parent of all accumulated changes
  const debouncedOnChange = useDebouncedCallback(() => {
    if (Object.keys(pendingUpdates.current).length > 0 && pendingFromUser.current) {
      const updatedValues = { ...localValues, ...pendingUpdates.current }
      onChange?.(updatedValues)
      pendingUpdates.current = {}
    }

    pendingFromUser.current = false
  }, debounceTime)

  // Function to update a specific field in the local state
  const updateField = useCallback(
    <K extends keyof T>(field: K, value: T[K] | ((prev: T[K]) => T[K])) => {
      setLocalValues((prev) => {
        const newValue = typeof value === 'function' ? (value as (prev: T[K]) => T[K])(prev[field]) : value

        if (newValue === prev[field]) return prev

        // Mark this update as coming from user input
        pendingFromUser.current = true

        // Store the update in pendingUpdates
        pendingUpdates.current[field] = newValue

        // Trigger the debounced update
        debouncedOnChange()

        // Update local state immediately
        return { ...prev, [field]: newValue }
      })
    },
    [debouncedOnChange]
  )

  return [localValues, updateField]
}
