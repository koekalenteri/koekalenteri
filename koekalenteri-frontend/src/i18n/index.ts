import { initReactI18next } from 'react-i18next'
import { enUS, fiFI, Localization } from '@mui/material/locale'
import { enUS as genUS, fiFI as gfiFI, GridLocaleText } from '@mui/x-data-grid'
import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { Language } from 'koekalenteri-shared/model'

import { formatDate, formatDateSpan, formatDistance, locales } from './dates'
import { en, enBreed, fi, fiBreed } from './locales'

type MuiLocalization = Localization & {
  components: {
    MuiDataGrid: {
      defaultProps: {
        localeText: Partial<GridLocaleText>
      }
    }
  }
}


export { locales }
export type { Language }
export type ValidationErrorKey = typeof fi.validation

export const muiLocales: Record<Language, MuiLocalization> = {
  fi: { ...fiFI, ...gfiFI },
  en: { ...enUS, ...genUS },
}


i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    lng: process.env.NODE_ENV === 'test' ? 'fi' : undefined,
    ns: ['translation', 'breed'],
    resources: {
      fi: { translation: fi, breed: fiBreed },
      en: { translation: en, breed: enBreed },
    },
    fallbackLng: 'fi',
    supportedLngs: ['fi', 'en'],
    debug: process.env.NODE_ENV === 'development',
    interpolation: {
      escapeValue: false,
    },
  })

//  additional formats
i18n.services.formatter?.add('dtshort', formatDate('eeeeee d.M. HH:mm'))
i18n.services.formatter?.add('short', formatDate('eeeeee d.M.'))
i18n.services.formatter?.add('weekday', formatDate('eeeeee'))
i18n.services.formatter?.add('datespan', formatDateSpan)
i18n.services.formatter?.add('distance', formatDistance)
i18n.services.formatter?.add('lowercase', value => value.toLowerCase())
i18n.services.formatter?.add('date', formatDate('d.M.yyyy'))
