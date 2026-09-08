import { docsPageFor, docsPagesFor, releaseNotesFor } from './docs'

describe('docs', () => {
  describe('docsPagesFor', () => {
    it('gives the pages in the reader’s language', () => {
      expect(docsPagesFor('en').map((page) => page.title)).toEqual([
        'Entering a trial',
        'Before entry opens',
        'While entry is open',
        'After entry closes',
      ])
      expect(docsPagesFor('fi').map((page) => page.title)).toEqual([
        'Kokeeseen ilmoittautuminen',
        'Ennen ilmoittautumisajan alkua',
        'Ilmoittautumisaikana',
        'Ilmoittautumisajan jälkeen',
      ])
    })

    // i18next hands out tags like en-GB, and the docs are keyed by the plain language.
    it('narrows a language tag to its language', () => {
      expect(docsPagesFor('en-GB')).toEqual(docsPagesFor('en'))
    })

    it('falls back to Finnish for a language with no pages', () => {
      expect(docsPagesFor('sv')).toEqual(docsPagesFor('fi'))
    })
  })

  describe('releaseNotesFor', () => {
    it('gives the releases newest first, in the reader’s language', () => {
      const versions = releaseNotesFor('en').map((note) => note.version)
      expect(versions.slice(0, 2)).toEqual(['1.11.2', '1.11.1'])
      expect(releaseNotesFor('en')[0].html).toContain('<h2>New</h2>')
      expect(releaseNotesFor('fi')[0].html).toContain('<h2>Uutta</h2>')
    })

    it('falls back to Finnish for a language with no notes', () => {
      expect(releaseNotesFor('sv')).toEqual(releaseNotesFor('fi'))
    })
  })

  describe('docsPageFor', () => {
    it('finds a page by its path', () => {
      expect(docsPageFor('fi', 'ilmoittautujalle/ilmoittautuminen')?.audience).toBe('participant')
    })

    it('returns nothing for a path that has no page', () => {
      expect(docsPageFor('fi', 'ilmoittautujalle/ei-tallaista')).toBeUndefined()
    })
  })
})
