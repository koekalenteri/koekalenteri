import { docsPageFor, docsPagesFor, releaseNotesFor, rulesDocumentFor, rulesFor } from './docs'

describe('docs', () => {
  describe('docsPagesFor', () => {
    it('gives the pages in the reader’s language', () => {
      // In reading order, then by path: the index groups them by audience on top of this.
      expect(docsPagesFor('en').map((page) => page.title)).toEqual([
        'Entering a trial',
        'Before entry opens',
        'Your entry',
        'While entry is open',
        'Start list and results',
        'After entry closes',
        'Payments',
        'The trial day and the results',
        'Users and access',
        'Judges and officials',
        'Statistics',
        'For the application administrator',
      ])
      expect(docsPagesFor('fi').map((page) => page.title)).toEqual([
        'Kokeeseen ilmoittautuminen',
        'Ennen ilmoittautumisajan alkua',
        'Oma ilmoittautumisesi',
        'Ilmoittautumisaikana',
        'Starttilista ja tulokset',
        'Ilmoittautumisajan jälkeen',
        'Maksuliikenne',
        'Koepäivä ja tulokset',
        'Käyttäjät ja käyttöoikeudet',
        'Tuomarit ja koetoimitsijat',
        'Tilastot',
        'Koekalenterin pääkäyttäjälle',
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
      expect(rulesFor('fi').map((document) => document.path)).toEqual(['rules/retriever-trials'])
    })

    it('finds a section by the number the application links to', () => {
      const document = rulesDocumentFor('fi', 'rules/retriever-trials')
      const sections = document?.parts.flatMap((part) => part.chapters.flatMap((chapter) => chapter.sections)) ?? []
      const prizes = sections.find((section) => section.id === 's-4-4')
      expect(prizes?.title).toBe('PALKITSEMINEN')
      expect(prizes?.html).toContain('nolla (0)')
      expect(sections).toHaveLength(130)
    })
  })

  describe('docsPageFor', () => {
    it('finds a page by its path', () => {
      expect(docsPageFor('fi', 'participant/entering')?.audience).toBe('participant')
    })

    it('returns nothing for a path that has no page', () => {
      expect(docsPageFor('fi', 'participant/no-such-page')).toBeUndefined()
    })
  })
})
