import type { Language } from '../types'

/** The localStorage key the reader's language choice is kept under (`languageAtom`). */
export const languageStorageKey = 'language'

export const stringToLang = (value?: unknown): Language => (value === 'en' ? 'en' : 'fi')

/**
 * The reader's stored language choice, for code that runs before the atom store: i18next has to boot
 * in it, or everything rendered before App's realign effect is Finnish (KOE-1457). Anything missing,
 * unreadable or unknown is the fallback, Finnish.
 */
export const readStoredLanguage = (): Language => {
  try {
    const stored = localStorage.getItem(languageStorageKey)
    return stored === null ? 'fi' : stringToLang(JSON.parse(stored))
  } catch {
    return 'fi'
  }
}
