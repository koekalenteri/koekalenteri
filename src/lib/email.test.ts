import { KNOWN_TLDS } from './domains/topLevelDomains'
import { validEmail } from './email'

describe('email', () => {
  describe('validEmail', () => {
    it.each(['user@domain.com', 'user.name@domain.fi', 'long.user.name@long.domain.name.blog', 'user@äö.com'])(
      'should return true for %p',
      (value) => {
        expect(validEmail(value, KNOWN_TLDS)).toEqual(true)
      }
    )
    it.each([
      '',
      '@',
      'a@b',
      'user@-domain.com',
      'user@domain.com-',
      'user@.domain.com',
      'user@domain.com.',
      'user name@domain.com',
      'something@something',
      'äö@domain.com',
      'too.many.parts.in.user.name@domain.com',
      'user@too.many.parts.in.domain.name',
      'user@localhost', // no dot in domain part
      'joo@ei.com444',
    ])('should return false for %p', (value) => {
      expect(validEmail(value, KNOWN_TLDS)).toEqual(false)
    })

    // The list is loaded on demand on the frontend; before it arrives, an ending that looks like a
    // top-level domain passes, and one that cannot be one still fails.
    it('accepts an unknown but plausible top-level domain without the list, and rejects it with', () => {
      expect(validEmail('user@domain.notatld')).toEqual(true)
      expect(validEmail('user@domain.notatld', KNOWN_TLDS)).toEqual(false)
      expect(validEmail('joo@ei.com444')).toEqual(false)
    })
  })
})
