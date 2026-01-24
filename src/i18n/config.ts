import type { InitOptions } from 'i18next'
import { isDevEnv } from '../lib/env'
import { en, enBreed, enBreedAbbr, enCountry, fi, fiBreed, fiBreedAbbr, fiCountry } from './locales'

export const i18nInit: InitOptions = {
  debug: isDevEnv(),
  fallbackLng: 'fi',
  interpolation: {
    escapeValue: false,
  },
  lng: 'fi',
  ns: ['translation', 'breed', 'breedAbbr', 'country'],
  resources: {
    en: { breed: enBreed, breedAbbr: enBreedAbbr, country: enCountry, translation: en },
    fi: { breed: fiBreed, breedAbbr: fiBreedAbbr, country: fiCountry, translation: fi },
  },
  supportedLngs: ['fi', 'en'],
}
