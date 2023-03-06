import i18n from 'i18next'
import { Language } from 'koekalenteri-shared/model'
import { AtomEffect } from 'recoil'

const stringToLang = (str: string): Language => (!str || str === 'fi' ? 'fi' : 'en')

export const i18nextEffect: AtomEffect<Language> = ({ onSet, setSelf, trigger }) => {
  if (trigger === 'get') {
    setSelf(stringToLang(i18n.language))
  }
  onSet((language) => i18n.changeLanguage(language))
}
