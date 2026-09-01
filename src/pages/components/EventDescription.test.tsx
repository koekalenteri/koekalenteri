import { render, screen } from '@testing-library/react'
import { EventDescription } from './EventDescription'

describe('EventDescription', () => {
  it('renders nothing without a description', () => {
    const { container } = render(<EventDescription />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for an empty description', () => {
    const { container } = render(<EventDescription description="" />)

    expect(container).toBeEmptyDOMElement()
  })

  it('keeps the paragraph breaks the secretary typed', () => {
    // KOE-740: the stored text has always had the newlines, the rendering collapsed them.
    const description = 'Ensimmäinen kappale.\n\nToinen kappale.\nSaman kappaleen toinen rivi.'
    render(<EventDescription description={description} />)

    const text = screen.getByText(/Ensimmäinen kappale/)

    expect(text).toHaveTextContent(description, { normalizeWhitespace: false })
    expect(text).toHaveStyle({ whiteSpace: 'pre-line' })
  })

  it('breaks a long unspaced word instead of overflowing the column', () => {
    render(<EventDescription description={'a'.repeat(120)} />)

    expect(screen.getByText(/a{120}/)).toHaveStyle({ overflowWrap: 'break-word' })
  })
})
