import { docsPageFor, docsPagesFor, releaseNotesFor, rulesDocumentFor, rulesFor } from './docs'

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

  describe('rulesFor', () => {
    // The Kennel Club's rules exist in Finnish only, so every language gets the Finnish text.
    it('gives every language the Finnish rules', () => {
      expect(rulesFor('en')).toEqual(rulesFor('fi'))
      expect(rulesFor('fi').map((document) => document.path)).toEqual(['saannot/noutajien-kokeet'])
    })

    it('finds a section by the number the application links to', () => {
      const document = rulesDocumentFor('fi', 'saannot/noutajien-kokeet')
      const sections = document?.parts.flatMap((part) => part.chapters.flatMap((chapter) => chapter.sections)) ?? []
      const prizes = sections.find((section) => section.id === 's-4-4')
      expect(prizes?.title).toBe('PALKITSEMINEN')
      expect(prizes?.html).toContain('nolla (0)')
      expect(sections).toHaveLength(130)
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
