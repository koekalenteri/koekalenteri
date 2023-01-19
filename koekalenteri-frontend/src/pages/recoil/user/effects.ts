import i18n from 'i18next'
import { Language } from 'koekalenteri-shared/model'
import { AtomEffect } from 'recoil'

export const i18nextEffect: AtomEffect<Language> = ({ onSet }) => {
  onSet((language) => i18n.changeLanguage(language))
}
