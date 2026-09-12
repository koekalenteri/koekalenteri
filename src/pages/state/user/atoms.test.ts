import i18n from 'i18next'
import { createStore } from 'jotai'
import { idTokenAtom, languageAtom, readStoredIdToken } from './atoms'
import { validIdTokenAtom } from './derivedAtoms'

const encodeBase64Url = (value: string) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
const makeToken = (payload: object) => `header.${encodeBase64Url(JSON.stringify(payload))}.signature`

describe('idTokenAtom', () => {
  beforeEach(() => {
    localStorage.removeItem('idToken')
  })

  it('has a synchronous empty default', () => {
    const snapshot = createStore()

    expect(snapshot.get(idTokenAtom)).toBeUndefined()
  })

  it('restores a valid persisted token', async () => {
    const token = makeToken({ exp: Date.now() / 1000 + 3600 })
    localStorage.setItem('idToken', JSON.stringify(token))

    const snapshot = createStore()

    expect(snapshot.get(idTokenAtom)).toBe(token)
    expect(localStorage.getItem('idToken')).toBe(JSON.stringify(token))
  })

  it('keeps an expired persisted token for session refresh but does not expose it as valid', async () => {
    const token = makeToken({ exp: Date.now() / 1000 - 60 })
    localStorage.setItem('idToken', JSON.stringify(token))

    const snapshot = createStore()

    expect(snapshot.get(idTokenAtom)).toBe(token)
    expect(snapshot.get(validIdTokenAtom)).toBeUndefined()
    expect(localStorage.getItem('idToken')).toBe(JSON.stringify(token))
  })
})

afterEach(async () => {
  // Recoil releases standalone snapshots on the next task.
  await new Promise((resolve) => setTimeout(resolve, 20))
})

describe('languageAtom', () => {
  describe('should default to i18n.language', () => {
    it.each([
      ['fi', 'fi'],
      ['en', 'en'],
      ['sv', 'fi'],
    ])('maps %s to %s', (language, expected) => {
      i18n.language = language
      const snapshot = createStore()
      expect(snapshot.get(languageAtom)).toEqual(expected)
    })
  })
})

describe('readStoredIdToken', () => {
  beforeEach(() => {
    localStorage.removeItem('idToken')
  })

  it('reads a valid stored token for code outside the store', () => {
    const token = makeToken({ exp: Date.now() / 1000 + 3600 })
    localStorage.setItem('idToken', JSON.stringify(token))

    expect(readStoredIdToken()).toBe(token)
  })

  it.each([
    ['nothing stored', undefined],
    ['an expired token', JSON.stringify(makeToken({ exp: Date.now() / 1000 - 60 }))],
    ['a value that is not a token', JSON.stringify({ token: true })],
    ['unparseable storage', '{not json'],
  ])('reads no token for %s', (_case, stored) => {
    if (stored !== undefined) localStorage.setItem('idToken', stored)

    expect(readStoredIdToken()).toBeUndefined()
  })
})
