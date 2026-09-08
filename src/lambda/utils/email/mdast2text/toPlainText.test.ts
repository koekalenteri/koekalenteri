import type { Parent } from 'mdast'
import { toPlainText } from './toPlainText'

// The plain-text half of an email template. Handlebars is rendered into whatever this produces, so
// a stray or missing newline here is a stray or missing line in every message that uses it.
describe('toPlainText', () => {
  const text = (value: string) => ({ type: 'text', value })
  const parent = (type: string, children: unknown[]) => ({ children, type }) as unknown as Parent

  it('returns the value of a literal node', () => {
    expect(toPlainText(text('Ilmoittautuminen'))).toBe('Ilmoittautuminen')
  })

  // The templates lay out their tables as "Koe          :| {{...}}", so the label cell ends in a
  // colon. Without the space the value would be glued to it in the text part.
  it('adds a space after a value that ends in a colon', () => {
    expect(toPlainText(text('Koe:'))).toBe('Koe: ')
  })

  it('joins the children of a parent', () => {
    expect(toPlainText(parent('strong', [text('Koira'), text(' 1')]))).toBe('Koira 1')
  })

  it('ends a paragraph and a heading with a blank line', () => {
    expect(toPlainText(parent('paragraph', [text('Terveisin')]))).toBe('Terveisin\n\n')
    expect(toPlainText(parent('heading', [text('Koekutsu')]))).toBe('Koekutsu\n\n')
  })

  it('ends a table row and a table with a single newline', () => {
    expect(toPlainText(parent('tableRow', [text('Koe: '), text('NOME-B')]))).toBe('Koe: NOME-B\n')
    expect(toPlainText(parent('table', [parent('tableRow', [text('rivi')])]))).toBe('rivi\n\n')
  })

  it('walks an array of nodes without adding anything of its own', () => {
    expect(toPlainText([text('a'), text('b')] as unknown as Parent)).toBe('ab')
  })

  it('returns an empty string for anything that is neither a literal nor a parent', () => {
    expect(toPlainText({ type: 'thematicBreak' } as unknown as Parent)).toBe('')
    expect(toPlainText(undefined as unknown as Parent)).toBe('')
  })
})
