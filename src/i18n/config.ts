import type { InitOptions } from 'i18next'
import { isDevEnv } from '../lib/env'
import { en, enBreed, enBreedAbbr, enCountry, fi, fiBreed, fiBreedAbbr, fiCountry } from './locales'

// A function rather than a const: as a const its initializer calls isDevEnv(), which esbuild has
// to assume has side effects, so the object -- and the ~125 kB of locale JSON it names -- was
// emitted into every lambda bundle that transitively imported this file, even where nothing read
// it. Inside a function body it goes away with the function when nobody calls it.
export const i18nInitOptions = (): InitOptions => ({
  debug: isDevEnv(),
  fallbackLng: 'fi',
  interpolation: {
    escapeValue: false,
  },
  resources: {
    en: { breed: enBreed, breedAbbr: enBreedAbbr, country: enCountry, translation: en },
    fi: { breed: fiBreed, breedAbbr: fiBreedAbbr, country: fiCountry, translation: fi },
  },
})
