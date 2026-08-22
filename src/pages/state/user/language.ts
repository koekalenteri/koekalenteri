import type { Language } from '../../../types'

export const stringToLang = (value?: string | null): Language => (value === 'en' ? 'en' : 'fi')
