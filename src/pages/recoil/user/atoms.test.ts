import i18n from 'i18next'
import { snapshot_UNSTABLE } from 'recoil'

import { languageAtom } from './atoms'

jest.mock('i18next')

describe('languageAtom', () => {
  describe('should default to i18n.language', () => {
    it('when "fi"', () => {
      i18n.language = 'fi'
      const snapshot = snapshot_UNSTABLE()
      expect(snapshot.getLoadable(languageAtom).valueOrThrow()).toEqual('fi')
    })
    it('when "en"', () => {
      i18n.language = 'en'
      const snapshot = snapshot_UNSTABLE()
      expect(snapshot.getLoadable(languageAtom).valueOrThrow()).toEqual('en')
    })
    it('when unsupported, it should fallback to "en"', () => {
      i18n.language = 'sv'
      const snapshot = snapshot_UNSTABLE()
      expect(snapshot.getLoadable(languageAtom).valueOrThrow()).toEqual('en')
    })
  })
})
