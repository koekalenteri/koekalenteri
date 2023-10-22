import type { fi, fiBreed, fiBreedAbbr } from './locales'

import 'i18next'

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: {
      translation: typeof fi
      breed: typeof fiBreed
      breedAbbr: typeof fiBreedAbbr
    }
  }
}
