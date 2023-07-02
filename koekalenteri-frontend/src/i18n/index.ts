import { initReactI18next } from 'react-i18next'
import { enUS, fiFI, Localization } from '@mui/material/locale'
import { enUS as genUS, fiFI as gfiFI, GridLocaleText } from '@mui/x-data-grid'
import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { Language } from 'koekalenteri-shared/model'

import { formatDateSpan, formatDistance, getDateFormatter, locales } from './dates'
import { en, enBreed, enBreedAbbr, fi, fiBreed, fiBreedAbbr } from './locales'

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
    ns: ['translation', 'breed', 'breedAbbr'],
    resources: {
      fi: { translation: fi, breed: fiBreed, breedAbbr: fiBreedAbbr },
      en: { translation: en, breed: enBreed, breedAbbr: enBreedAbbr },
    },
    fallbackLng: 'fi',
    supportedLngs: ['fi', 'en'],
    debug: process.env.NODE_ENV === 'development',
    interpolation: {
      escapeValue: false,
    },
  })
  .catch((reason) => console.error(reason))

//  additional formats
i18n.services.formatter?.add('dtshort', getDateFormatter('eeeeee d.M. HH:mm'))
i18n.services.formatter?.add('wdshort', getDateFormatter('eeeeee d.M.'))
i18n.services.formatter?.add('weekday', getDateFormatter('eeeeee'))
i18n.services.formatter?.add('short', getDateFormatter('dd.MM.'))
i18n.services.formatter?.add('datespan', formatDateSpan)
i18n.services.formatter?.add('distance', formatDistance)
i18n.services.formatter?.add('lowercase', (value) => value.toLowerCase())
i18n.services.formatter?.add('date', getDateFormatter('d.M.yyyy'))
i18n.services.formatter?.add('isodate', getDateFormatter('dd.MM.yyyy'))
i18n.services.formatter?.add('long', getDateFormatter('dd.MM.yyyy HH:mm'))
