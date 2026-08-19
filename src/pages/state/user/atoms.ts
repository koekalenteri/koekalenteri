import type { Language } from '../../../types'
import i18n from 'i18next'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { atomWithLocalStorage, atomWithSessionStorage } from '../storage'
import { stringToLang } from './language'

export const idTokenAtom = atomWithLocalStorage<string | undefined>('idToken', undefined)
export const tokenValidityRevisionAtom = atom(0)

const storedLanguageAtom = atomWithLocalStorage<Language>('language', 'fi', {
  getInitialValue: () => stringToLang(i18n.language),
})
export const languageAtom = atom(
  (get) => get(storedLanguageAtom),
  (get, set, value: Language | ((previous: Language) => Language)) => {
    const language = stringToLang(typeof value === 'function' ? value(get(storedLanguageAtom)) : value)
    set(storedLanguageAtom, language)
    if (i18n.language !== language) void i18n.changeLanguage(language)
    document.documentElement.lang = language
  }
)

export const spaAtom = atom(false)
export const loginPathAtom = atomWithSessionStorage<string | undefined>('loginPath', '/')

/** Used to force-refresh the user atom after mutations (e.g. updating own name). */
export const userRefreshAtom = atom(0)

export const openedEventAtom = atomFamily((eventId: string) =>
  atomWithSessionStorage(`open/eventId__${eventId}`, false)
)
