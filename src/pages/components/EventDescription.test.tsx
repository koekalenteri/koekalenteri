import type { Language } from '../../types'
import { render, screen } from '@testing-library/react'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { languageAtom } from '../state'
import { EventDescription } from './EventDescription'

describe('EventDescription', () => {
  const setup = (
    event: { description: string; descriptions?: Partial<Record<Language, string>> },
    language?: Language
  ) =>
    render(<EventDescription event={event} />, {
      wrapper: ({ children }) => (
        <Provider initializeState={({ set }) => set(languageAtom, language ?? 'fi')}>{children}</Provider>
      ),
    })

  it('renders nothing for an empty description', () => {
    const { container } = setup({ description: '' })

    expect(container).toBeEmptyDOMElement()
  })

  it('keeps the paragraph breaks the secretary typed', () => {
    // KOE-740: the stored text has always had the newlines, the rendering collapsed them.
    const description = 'Ensimmäinen kappale.\n\nToinen kappale.\nSaman kappaleen toinen rivi.'
    setup({ description })

    const text = screen.getByText(/Ensimmäinen kappale/)

    expect(text).toHaveTextContent(description, { normalizeWhitespace: false })
    expect(text).toHaveStyle({ whiteSpace: 'pre-line' })
  })

  it('breaks a long unspaced word instead of overflowing the column', () => {
    setup({ description: 'a'.repeat(120) })

    expect(screen.getByText(/a{120}/)).toHaveStyle({ overflowWrap: 'break-word' })
  })

  it('shows the translation for the viewer language when the secretary gave one', () => {
    // KOE-1263
    setup({ description: 'Suomeksi', descriptions: { en: 'In English' } }, 'en')

    expect(screen.getByText('In English')).toBeVisible()
  })

  it('falls back to the Finnish text without a translation', () => {
    setup({ description: 'Suomeksi', descriptions: { en: '' } }, 'en')

    expect(screen.getByText('Suomeksi')).toBeVisible()
  })
})
