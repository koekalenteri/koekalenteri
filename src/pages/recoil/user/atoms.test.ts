import i18n from 'i18next'
import { snapshot_UNSTABLE } from 'recoil'
import { idTokenAtom, languageAtom } from './atoms'
import { validIdTokenSelector } from './selectors'

const encodeBase64Url = (value: string) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
const makeToken = (payload: object) => `header.${encodeBase64Url(JSON.stringify(payload))}.signature`

describe('idTokenAtom', () => {
  beforeEach(() => {
    localStorage.removeItem('idToken')
  })

  it('has a synchronous empty default', () => {
    const snapshot = snapshot_UNSTABLE()

    expect(snapshot.getLoadable(idTokenAtom).valueOrThrow()).toBeUndefined()
  })

  it('restores a valid persisted token', async () => {
    const token = makeToken({ exp: Date.now() / 1000 + 3600 })
    localStorage.setItem('idToken', JSON.stringify(token))

    const snapshot = snapshot_UNSTABLE()

    await expect(snapshot.getPromise(idTokenAtom)).resolves.toBe(token)
    expect(localStorage.getItem('idToken')).toBe(JSON.stringify(token))
  })

  it('keeps an expired persisted token for session refresh but does not expose it as valid', async () => {
    const token = makeToken({ exp: Date.now() / 1000 - 60 })
    localStorage.setItem('idToken', JSON.stringify(token))

    const snapshot = snapshot_UNSTABLE()

    await expect(snapshot.getPromise(idTokenAtom)).resolves.toBe(token)
    await expect(snapshot.getPromise(validIdTokenSelector)).resolves.toBeUndefined()
    expect(localStorage.getItem('idToken')).toBe(JSON.stringify(token))
  })
})

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
    it('when unsupported, it should fallback to "fi"', () => {
      i18n.language = 'sv'
      const snapshot = snapshot_UNSTABLE()
      expect(snapshot.getLoadable(languageAtom).valueOrThrow()).toEqual('fi')
    })
  })
})
