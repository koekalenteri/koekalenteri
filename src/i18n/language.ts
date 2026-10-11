import type { Language } from '../types'
import { LANGUAGES } from '../types'

// Widened to unknown so membership can be asked of any value; has() alone narrows nothing.
const languageSet: ReadonlySet<unknown> = new Set(LANGUAGES)

export const isLanguage = (value: unknown): value is Language => languageSet.has(value)

/** The one rule for what counts as a language: one the app has, and Finnish for anything else. */
export const stringToLang = (value?: string | null): Language => (isLanguage(value) ? value : 'fi')

/**
 * Makes the document's `lang` say the language the app is in. The root is taken as an argument so
 * this stays free of DOM types: lambda code type-checks this folder too.
 */
export const setDocumentLanguage = (root: { lang: string }, language: string): void => {
  root.lang = stringToLang(language)
}
