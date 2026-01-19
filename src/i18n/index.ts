import type { Localization } from '@mui/material/locale'
import type { Language } from '../types'
import type { fi } from './locales'

import { initReactI18next } from 'react-i18next'
import { I18n } from '@aws-amplify/core'
import { enUS, fiFI } from '@mui/material/locale'
import { enUS as genUS, fiFI as gfiFI } from '@mui/x-data-grid/locales'
import { enUS as denUS, fiFI as dfiFI } from '@mui/x-date-pickers/locales'
import i18n from 'i18next'

import { fiAuthenticationDict } from './locales/fi/auth'
import { i18nInit } from './config'
import { locales } from './dates'
import { registerFormatters } from './formatters'

export { locales }
export type { Language }
export type ValidationErrorKey = typeof fi.validation

export const muiLocales: Record<Language, Localization> = {
  fi: { ...fiFI, components: { ...fiFI.components, ...gfiFI.components, ...dfiFI.components } },
  en: { ...enUS, components: { ...enUS.components, ...genUS.components, ...denUS.components } },
}

try {
  await i18n.use(initReactI18next).init(i18nInit)
} catch (err) {
  console.error(err)
}

//  additional formats
registerFormatters(i18n)

I18n.putVocabularies({ fi: fiAuthenticationDict })
I18n.setLanguage('fi')
