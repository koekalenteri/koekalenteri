import { AtomEffect } from 'recoil'

import { parseJSON } from '../../../utils'

export const parseStorageJSON = (value: string | null) => {
  let parsed
  try {
    if (value !== null) {
      parsed = parseJSON(value)
    }
  } catch (e) {
    console.warn('JSON parse error', e)
  }
  return parsed
}

export const storageEffect: AtomEffect<any> = ({ node, setSelf, onSet }) => {
  const savedValue = localStorage.getItem(node.key)
  if (savedValue !== null) {
    const parsed = parseStorageJSON(savedValue)
    setSelf(parsed)
  }

  onSet((newValue, _, isReset) => {
    if (isReset || newValue === null || newValue === undefined) {
      localStorage.removeItem(node.key)
    } else {
      localStorage.setItem(node.key, JSON.stringify(newValue))
    }
  })

  const handleStorageChange = (e: StorageEvent) => {
    if (e.storageArea === localStorage && e.key === node.key) {
      const parsed = parseStorageJSON(e.newValue)
      console.log('storage change', e.newValue, parsed)
      setSelf(parsed)
    }
  }

  window.addEventListener('storage', handleStorageChange)

  return () => window.removeEventListener('storage', handleStorageChange)
}

export function stringStorageEffect<T extends string>(defaultValue: string): AtomEffect<T> {
  return ({ node, setSelf, onSet }) => {
    const savedValue = localStorage.getItem(node.key)
    if (savedValue !== null) {
      setSelf(savedValue as T)
    }

    onSet((newValue, _, isReset) => {
      if (isReset || newValue === null || newValue === undefined) {
        localStorage.removeItem(node.key)
      } else {
        localStorage.setItem(node.key, newValue)
      }
    })

    const handleStorageChange = (e: StorageEvent) => {
      if (e.storageArea === localStorage && e.key === node.key) {
        const value = e.newValue ?? defaultValue
        console.log('storage change', value)
        setSelf(value as T)
      }
    }

    window.addEventListener('storage', handleStorageChange)

    return () => window.removeEventListener('storage', handleStorageChange)
  }
}
