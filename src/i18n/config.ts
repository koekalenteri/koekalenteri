import type { InitOptions } from 'i18next'

import { isDevEnv } from '../lib/env'

import { en, enBreed, enBreedAbbr, enCountry, fi, fiBreed, fiBreedAbbr, fiCountry } from './locales'

export const i18nInit: InitOptions = {
  lng: 'fi',
  ns: ['translation', 'breed', 'breedAbbr', 'country'],
  resources: {
    fi: { translation: fi, breed: fiBreed, breedAbbr: fiBreedAbbr, country: fiCountry },
    en: { translation: en, breed: enBreed, breedAbbr: enBreedAbbr, country: enCountry },
  },
  fallbackLng: 'fi',
  supportedLngs: ['fi', 'en'],
  debug: isDevEnv(),
  interpolation: {
    escapeValue: false,
  },
  // suppress spam
  showSupportNotice: false,
}
