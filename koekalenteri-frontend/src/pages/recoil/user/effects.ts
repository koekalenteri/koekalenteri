import i18n from 'i18next'
import { Language, User } from 'koekalenteri-shared/model'
import { AtomEffect } from 'recoil'

import { getUser } from '../../../api/user'

import { idTokenSelector } from './selectors'

const stringToLang = (str: string): Language => (!str || str === 'fi' ? 'fi' : 'en')

export const i18nextEffect: AtomEffect<Language> = ({ onSet, setSelf, trigger }) => {
  if (trigger === 'get') {
    setSelf(stringToLang(i18n.language))
  }
  onSet((language) => i18n.changeLanguage(language))
}

export const remoteUserEffect: AtomEffect<User | null> = ({ setSelf, getPromise, trigger }) => {
  if (trigger === 'get') {
    getPromise(idTokenSelector).then((token) => {
      if (!token) {
        setSelf(null)
      } else {
        console.log(token)
        getUser(token)
          .then(setSelf)
          .catch((err) => {
            console.error(err)
            setSelf(null)
          })
      }
    })
  }
}
