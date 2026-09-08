import type { Language } from '../types'
import i18n from 'i18next'
import { i18nInitOptions } from './config'
import { registerFormatters } from './formatters'

let initialized = false

// Initializing on first use rather than at import time keeps this module -- and the ~125 kB of
// breed, country and translation resources behind it -- out of the bundle of every lambda that
// never renders text. Only the email and receipt paths reach it.
//
// The resources are handed to i18next inline, and for those it loads synchronously
// (`if (this.options.resources || !this.options.initAsync) load()`), so the getFixedT call that
// triggers this initialization already translates rather than echoing back keys. lambda.test.ts
// covers that, since it is a property of i18next rather than of this file.
const initialize = () => {
  if (!initialized) {
    initialized = true
    i18n.init(i18nInitOptions()).catch((error_) => console.error(error_))
    registerFormatters(i18n)
  }

  return i18n
}

export const getFixedT = (language: Language = 'fi') => initialize().getFixedT(language)
