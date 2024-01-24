import type { AtomEffect } from 'recoil'
import type { Language } from '../../../types'

import i18n from 'i18next'

const stringToLang = (str: string): Language => (!str || str === 'fi' ? 'fi' : 'en')

export const i18nextEffect: AtomEffect<Language> = ({ onSet, setSelf, trigger }) => {
  if (trigger === 'get') {
    setSelf(stringToLang(i18n.language))
  }
  onSet((language) => {
    if (i18n.language !== language) {
      i18n.changeLanguage(language)
    }
    if (document.documentElement.lang !== language) {
      document.documentElement.lang = language
    }
  })
}
