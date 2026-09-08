import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { remarkPlainText } from './remarkPlainText'

const process = (source: string) => unified().use(remarkParse).use(remarkPlainText).process(source)

// The compiler that turns the tree into the text part of an email.
describe('remarkPlainText', () => {
  it('compiles a document to text', async () => {
    await expect(process('Terveisin').then(String)).resolves.toBe('Terveisin\n\n')
  })

  it('ends the document with a newline when the last character is not one', async () => {
    const file = await process('# Koekutsu')

    expect(String(file).endsWith('\n')).toBe(true)
  })

  it('compiles an empty document to an empty string', async () => {
    await expect(process('').then(String)).resolves.toBe('')
  })

  it('names the result a text file', async () => {
    const file = await unified().use(remarkParse).use(remarkPlainText).process({ path: 'template.md', value: 'x' })

    expect(file.extname).toBe('.txt')
  })
})
