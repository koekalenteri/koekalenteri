import i18n from 'i18next'
import { Language } from 'koekalenteri-shared/model'

import { formatDateSpan } from '../utils/dates'

import { en, enBreed, enBreedAbbr, fi, fiBreed, fiBreedAbbr } from './locales/index'
import { createDateFormatter, formatDistance } from './dates'

export type { Language }
export { i18n }

await i18n.init({
  lng: process.env.NODE_ENV === 'test' ? 'fi' : undefined,
  ns: ['translation', 'breed', 'breedAbbr'],
  resources: {
    fi: { translation: fi, breed: fiBreed, breedAbbr: fiBreedAbbr },
    en: { translation: en, breed: enBreed, breedAbbr: enBreedAbbr },
  },
  fallbackLng: 'fi',
  supportedLngs: ['fi', 'en'],
  debug: true, // process.env.NODE_ENV === 'development',
  interpolation: {
    escapeValue: false,
  },
})

//  additional formats
i18n.services.formatter?.add('lowercase', (value) => value.toLowerCase())

i18n.services.formatter?.add('dtshort', createDateFormatter('eeeeee d.M. HH:mm'))
i18n.services.formatter?.add('wdshort', createDateFormatter('eeeeee d.M.'))
i18n.services.formatter?.add('short', createDateFormatter('dd.MM.'))
i18n.services.formatter?.add('weekday', createDateFormatter('eeeeee'))
i18n.services.formatter?.add('datespan', formatDateSpan)
i18n.services.formatter?.add('distance', formatDistance)
i18n.services.formatter?.add('lowercase', (value) => value.toLowerCase())
i18n.services.formatter?.add('date', createDateFormatter('d.M.yyyy'))
i18n.services.formatter?.add('isodate', createDateFormatter('dd.MM.yyyy'))
i18n.services.formatter?.add('long', createDateFormatter('dd.MM.yyyy HH:mm'))

console.log('i18next initialized')
