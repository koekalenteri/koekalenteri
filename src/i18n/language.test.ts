import { LANGUAGES } from '../types'
import { isLanguage, setDocumentLanguage, stringToLang } from './language'

describe('isLanguage', () => {
  it.each(LANGUAGES)('accepts %s', (language) => {
    expect(isLanguage(language)).toBe(true)
  })

  it.each([['sv'], ['EN'], [''], [undefined], [null], [1], [{}]])('rejects %j', (value) => {
    expect(isLanguage(value)).toBe(false)
  })
})

describe('stringToLang', () => {
  it.each(LANGUAGES)('keeps %s', (language) => {
    expect(stringToLang(language)).toBe(language)
  })

  it.each([['sv'], ['en-US'], [undefined], [null]])('reads %j as Finnish', (value) => {
    expect(stringToLang(value)).toBe('fi')
  })
})

describe('setDocumentLanguage', () => {
  it('writes the language to the root', () => {
    const root = { lang: 'fi' }

    setDocumentLanguage(root, 'en')

    expect(root.lang).toBe('en')
  })

  // i18next reports whatever it was given; the document only ever says a language the app has.
  it('writes Finnish for a language the app does not have', () => {
    const root = { lang: 'en' }

    setDocumentLanguage(root, 'sv')

    expect(root.lang).toBe('fi')
  })
})
