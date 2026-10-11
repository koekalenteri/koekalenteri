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

/**
 * Registrations whose language this tab has settled, for a tab whose sessionStorage cannot be
 * written (a private window, blocked site data): it then holds for as long as the page is loaded.
 */
const settledInMemory = new Set<string>()

const registrationLanguageKey = (registrationId: string) => `registrationLanguage/${registrationId}`

/**
 * Whether this tab has already decided which language a registrant's pages are shown in: switched to
 * the registration's language when the page was opened from a link, or kept as it was when opened
 * from the admin side. A settled registration never switches again, so a language picked from the
 * menu stays across the registration and payment pages, a reload and the payment provider's return
 * (KOE-1512). Kept per tab, so a link opened again in a new tab decides afresh.
 */
export const isRegistrationLanguageSettled = (registrationId: string): boolean => {
  if (settledInMemory.has(registrationId)) return true
  try {
    return sessionStorage.getItem(registrationLanguageKey(registrationId)) !== null
  } catch {
    return false
  }
}

export const settleRegistrationLanguage = (registrationId: string) => {
  try {
    sessionStorage.setItem(registrationLanguageKey(registrationId), 'true')
  } catch {
    settledInMemory.add(registrationId)
  }
}
