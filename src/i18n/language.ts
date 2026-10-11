import type { Language } from '../types'

/** The one rule for what counts as a language: English when it says so, Finnish otherwise. */
export const stringToLang = (value?: unknown): Language => (value === 'en' ? 'en' : 'fi')
