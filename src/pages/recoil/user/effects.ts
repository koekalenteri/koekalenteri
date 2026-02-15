import type { AtomEffect } from 'recoil'
import type { Language } from '../../../types'
import i18n from 'i18next'

export const stringToLang = (str?: string | null): Language => (str === 'en' ? 'en' : 'fi')

export const i18nextEffect: AtomEffect<Language> = ({ onSet, setSelf, trigger }) => {
  if (trigger === 'get') {
    setSelf(stringToLang(i18n.language))
  }
  onSet((value) => {
    const language = stringToLang(value)
    if (i18n.language !== language) {
      i18n.changeLanguage(language)
    }
    if (document.documentElement.lang !== language) {
      document.documentElement.lang = language
    }
    // In case the value vas not valid, change it.
    if (value !== language) {
      setSelf(language)
    }
  })
}
