import 'i18next'

import { fi, fiBreed, fiBreedAbbr } from './locales'

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: {
      translation: typeof fi
      breed: typeof fiBreed
      breedAbbr: typeof fiBreedAbbr
    }
  }
}
