import { isFromAdmin, markParticipantLinksFromAdmin, Path } from './routeConfig'

describe('routeConfig', () => {
  describe('Path.registrationFromAdmin', () => {
    it.each([
      [{ eventId: 'event-1', id: 'registration-1' }, '/r/event-1/registration-1?from=admin'],
      [
        { editToken: 'to/ken', eventId: 'event-1', id: 'registration-1' },
        '/r/event-1/registration-1/access/to%2Fken?from=admin',
      ],
    ])('marks the registrant page of %o as opened from the admin side', (registration, expected) => {
      const path = Path.registrationFromAdmin(registration)

      expect(path).toBe(expected)
      expect(isFromAdmin(new URL(path, 'https://koekalenteri.test').search)).toBe(true)
    })
  })

  describe('isFromAdmin', () => {
    it.each(['', '?from=email', '?admin', '?payment=verifying'])('is false for %j', (search) => {
      expect(isFromAdmin(search)).toBe(false)
    })
  })

  describe('markParticipantLinksFromAdmin', () => {
    const hrefs = (html: string) =>
      [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('a')].map((a) => a.getAttribute('href'))

    it('marks every link to a registrant page, also the ones a template appends to', () => {
      const html = markParticipantLinksFromAdmin(
        [
          '<p><a href="/r/event-1/registration-1">open</a></p>',
          '<a href="/r/event-1/registration-1/cancel">cancel</a>',
          '<a href="/r/event-1/registration-1/access/to%2Fken/invitation">invitation</a>',
          '<a href="/p/event-1/registration-1?payment=1#top">pay</a>',
        ].join('')
      )

      expect(hrefs(html)).toEqual([
        '/r/event-1/registration-1?from=admin',
        '/r/event-1/registration-1/cancel?from=admin',
        '/r/event-1/registration-1/access/to%2Fken/invitation?from=admin',
        '/p/event-1/registration-1?payment=1&from=admin#top',
      ])
    })

    it('leaves other links alone', () => {
      const html = markParticipantLinksFromAdmin(
        '<a href="https://koekalenteri.snj.fi/r/event-1/registration-1">site</a><a href="/event/NOU/event-1">event</a><a>none</a>'
      )

      expect(hrefs(html)).toEqual(['https://koekalenteri.snj.fi/r/event-1/registration-1', '/event/NOU/event-1', null])
    })

    it('returns HTML without such links as it was', () => {
      const html = '<h1>Hello</h1><a href="mailto:secretary@example.test">mail</a>'

      expect(markParticipantLinksFromAdmin(html)).toBe(html)
    })
  })
})
