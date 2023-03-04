import 'i18next'

import { fi, fiBreed } from './locales'

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: {
      translation: typeof fi
      breed: typeof fiBreed
    }
  }
}
