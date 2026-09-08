import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { remarkPlainText } from './remarkPlainText'
import { removeTableHead } from './table'

const toText = async (source: string) =>
  String(await unified().use(remarkParse).use(remarkGfm).use(removeTableHead).use(remarkPlainText).process(source))

const table = `otsikko | poistetaan
:-- | ----
Koe          :| NOME-B
Luokka       :| ALO
`

// The templates use a table to line up label and value, and its header row is there only because
// GFM requires one. It has no place in the plain-text part.
describe('removeTableHead', () => {
  it('drops the header row and keeps the rest', async () => {
    await expect(toText(table)).resolves.toBe('Koe          : NOME-B\nLuokka       : ALO\n\n')
  })

  it('drops the header of every table, not just the first', async () => {
    await expect(toText(`${table}\n${table}`)).resolves.toBe(
      'Koe          : NOME-B\nLuokka       : ALO\n\nKoe          : NOME-B\nLuokka       : ALO\n\n'
    )
  })

  it('leaves a table with nothing but a header empty', async () => {
    await expect(toText('otsikko | poistetaan\n:-- | ----\n')).resolves.toBe('\n')
  })
})
