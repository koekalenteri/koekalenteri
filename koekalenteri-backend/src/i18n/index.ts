import i18n from 'i18next'
import { Language } from 'koekalenteri-shared/model'

import { en, enBreed, enBreedAbbr, fi, fiBreed, fiBreedAbbr } from './locales/index'
import { createDateFormatter } from './dates'

export type { Language }
export { i18n }

i18n.init({
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
i18n.services.formatter?.add('weekday', createDateFormatter('eeeeee d.M.'))

console.log('i18next initialized')
