import { useEffect, useState } from 'react'

export function useDebouncedValue<T>(value: T, wait: number = 100) {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedValue(value), wait)
    return () => clearTimeout(timeout)
  }, [value, wait])
  return debouncedValue
}
