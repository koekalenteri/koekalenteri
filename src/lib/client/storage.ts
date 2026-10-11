import type { Language } from '../../types'
import { isLanguage } from '../../i18n/language'

export const getStorageKeysStartingWith = (prefixes: string[]) => {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    for (const prefix of prefixes) {
      if (key?.startsWith(prefix)) {
        keys.push(key)
        break
      }
    }
  }

  return keys
}

/** The localStorage key the reader's language choice is kept under (`languageAtom`). */
export const languageStorageKey = 'language'

/**
 * The reader's stored language choice, for code that runs before the atom store: i18next has to boot
 * in it, or everything rendered before App's realign effect is Finnish (KOE-1457). It reads the value
 * by the same rule as `languageAtom` (`isLanguage`), so anything missing, unreadable or unknown is
 * Finnish.
 */
export const readStoredLanguage = (): Language => {
  try {
    const stored = localStorage.getItem(languageStorageKey)
    if (stored === null) return 'fi'
    const parsed: unknown = JSON.parse(stored)
    return isLanguage(parsed) ? parsed : 'fi'
  } catch {
    return 'fi'
  }
}
