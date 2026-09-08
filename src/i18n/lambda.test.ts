import i18n from 'i18next'
import { getFixedT } from './lambda'

describe('i18n/lambda', () => {
  // Runs first on purpose: the cases below initialize the shared instance.
  it('does not initialize i18next until a translator is asked for', () => {
    expect(i18n.isInitialized).toBeFalsy()

    getFixedT('fi')

    expect(i18n.isInitialized).toBe(true)
  })

  it('translates on the very first call, without awaiting the init promise', () => {
    // The resources are inline, so i18next loads them synchronously. If that ever stopped being
    // true the first caller would get the key back instead of the text, on the email path.
    expect(getFixedT('fi')('emailTemplate.invitation')).toBe('Koekutsu')
  })

  it('translates in the requested language and defaults to Finnish', () => {
    expect(getFixedT('en')('emailTemplate.invitation')).toBe('Invitation')
    expect(getFixedT()('emailTemplate.invitation')).toBe('Koekutsu')
  })

  it('registers the date formatters', () => {
    expect(getFixedT('fi')('dateFormat.date', { date: '2026-09-08T00:00:00.000Z' })).toBe('8.9.2026')
  })
})
