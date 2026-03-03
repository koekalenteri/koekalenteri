import type { Localization } from '@mui/material/locale'
import type { Language } from '../types'
import type { fi } from './locales'

import { initReactI18next } from 'react-i18next'
import { enUS, fiFI } from '@mui/material/locale'
import { enUS as genUS, fiFI as gfiFI } from '@mui/x-data-grid/locales'
import { enUS as denUS, fiFI as dfiFI } from '@mui/x-date-pickers/locales'
import i18n from 'i18next'

import { i18nInit } from './config'
import { registerFormatters } from './formatters'

export { locales } from './dates'
export type { Language } from '../types'
export type ValidationErrorKey = typeof fi.validation

export const muiLocales: Record<Language, Localization> = {
  fi: { ...fiFI, components: { ...fiFI.components, ...gfiFI.components, ...dfiFI.components } },
  en: { ...enUS, components: { ...enUS.components, ...genUS.components, ...denUS.components } },
}

i18n
  .use(initReactI18next)
  .init(i18nInit)
  .catch((error_) => console.error(error_))

//  additional formats
registerFormatters(i18n)
