import type { AtomEffect } from 'recoil'
import type { Language, User } from '../../../types'

import i18n from 'i18next'

import { getUser } from '../../../api/user'

import { idTokenAtom } from './atoms'

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

export const remoteUserEffect: AtomEffect<User | null> = ({ setSelf, getPromise, onSet, trigger }) => {
  const fetchUser = () => {
    getPromise(idTokenAtom).then((token) => {
      if (!token) {
        setSelf(null)
      } else {
        getUser(token)
          .then(setSelf)
          .catch((err) => {
            console.error(err)
            setSelf(null)
          })
      }
    })
  }

  if (trigger === 'get') {
    fetchUser()
  }

  onSet((_newValue, _oldValue, reset) => {
    if (reset) {
      // re-fetch on reset
      fetchUser()
    }
  })
}
