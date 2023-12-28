import type { Localization } from '@mui/material/locale'
import type { Language } from '../types'

import { initReactI18next } from 'react-i18next'
import { enUS, fiFI } from '@mui/material/locale'
import { enUS as genUS, fiFI as gfiFI } from '@mui/x-data-grid/locales'
import { enUS as denUS, fiFI as dfiFI } from '@mui/x-date-pickers/locales'
import i18n from 'i18next'

import { formatDateSpan, formatDistance, getDateFormatter, locales } from './dates'
import { en, enBreed, enBreedAbbr, enCountry, fi, fiBreed, fiBreedAbbr, fiCountry } from './locales'

export { locales }
export type { Language }
export type ValidationErrorKey = typeof fi.validation

export const muiLocales: Record<Language, Localization> = {
  fi: { ...fiFI, components: { ...fiFI.components, ...gfiFI.components, ...dfiFI.components } },
  en: { ...enUS, components: { ...enUS.components, ...genUS.components, ...denUS.components } },
}

i18n
  .use(initReactI18next)
  .init({
    lng: 'fi',
    ns: ['translation', 'breed', 'breedAbbr', 'country'],
    resources: {
      fi: { translation: fi, breed: fiBreed, breedAbbr: fiBreedAbbr, country: fiCountry },
      en: { translation: en, breed: enBreed, breedAbbr: enBreedAbbr, country: enCountry },
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
