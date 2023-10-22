import type { Language } from '../types'

import i18n from 'i18next'

import { formatDateSpan, formatDistance, getDateFormatter, locales } from './dates'
import { en, enBreed, enBreedAbbr, fi, fiBreed, fiBreedAbbr } from './locales'

export { locales }
export { i18n }
export type { Language }
export type ValidationErrorKey = typeof fi.validation

i18n
  .init({
    lng: 'fi',
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
