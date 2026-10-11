import type { Localization } from '@mui/material/locale'
import type { Language } from '../types'
import { I18n } from '@aws-amplify/core'
import { enUS, fiFI } from '@mui/material/locale'
import { enUS as genUS, fiFI as gfiFI } from '@mui/x-data-grid/locales'
import { enUS as denUS, fiFI as dfiFI } from '@mui/x-date-pickers/locales'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { i18nInitOptions } from './config'
import { registerFormatters } from './formatters'
import { readStoredLanguage } from './language'
import { fiAuthenticationDict } from './locales/fi/auth'

export type { Language } from '../types'
export { locales } from './dates'

export const muiLocales: Record<Language, Localization> = {
  en: { ...enUS, components: { ...enUS.components, ...genUS.components, ...denUS.components } },
  fi: { ...fiFI, components: { ...fiFI.components, ...gfiFI.components, ...dfiFI.components } },
}

// Boot in the reader's stored choice rather than the fallback: App realigns i18next only in its own
// effect, and React runs its children's effects first, so anything they translate on mount would
// otherwise be Finnish for a reader who chose English (KOE-1457, KOE-1268). App's effect stays as the
// guard for a choice that changes later.
const storedLanguage = readStoredLanguage()
document.documentElement.lang = storedLanguage

i18n
  .use(initReactI18next)
  .init({ ...i18nInitOptions(), lng: storedLanguage })
  .catch((error_) => console.error(error_))

//  additional formats
registerFormatters(i18n)

I18n.putVocabularies({ fi: fiAuthenticationDict })
I18n.setLanguage('fi')
