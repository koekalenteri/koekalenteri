import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { linkAsText } from './link'
import { remarkPlainText } from './remarkPlainText'

const toText = async (source: string) =>
  String(await unified().use(remarkParse).use(remarkGfm).use(linkAsText).use(remarkPlainText).process(source))

// A plain-text email cannot hide a URL behind its label, so the label carries it.
describe('linkAsText', () => {
  it('appends the url to the link text', async () => {
    await expect(toText('[Katso ilmoittautuminen](https://koekalenteri.snj.fi/r/1)')).resolves.toBe(
      'Katso ilmoittautuminen: https://koekalenteri.snj.fi/r/1\n\n'
    )
  })

  it('leaves an autolink alone, where the text is already the url', async () => {
    await expect(toText('<https://koekalenteri.snj.fi/>')).resolves.toBe(
      'https://koekalenteri.snj.fi/: https://koekalenteri.snj.fi/\n\n'
    )
  })

  it('leaves text without links untouched', async () => {
    await expect(toText('Terveisin')).resolves.toBe('Terveisin\n\n')
  })
})
