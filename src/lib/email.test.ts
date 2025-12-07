import { validEmail } from './email'

describe('email', () => {
  describe('validEmail', () => {
    it.each([
      'user@domain.com',
      'user.name@domain.fi',
      'long.user.name@long.domain.name.blog',
      'user@äö.com',
    ])('should return true for %p', (value) => {
      expect(validEmail(value)).toEqual(true)
    })
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
      expect(validEmail(value)).toEqual(false)
    })
  })
})
