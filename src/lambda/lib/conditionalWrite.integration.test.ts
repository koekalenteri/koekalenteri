import { uniqueId } from '../test-utils/integration'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { foldedFrom } from './conditionalWrite'

interface Row {
  id: string
  note?: string
  results?: { ALO?: number[]; NOU?: { a: number } }
  tags?: string[]
}

/**
 * What the condition's comment claims about DynamoDB, run against DynamoDB-local (KOE-1510): a list,
 * a map and one entry of a map are compared by value, and the write never creates a stub row.
 */
describe('foldedFrom against DynamoDB-local', () => {
  const client = new CustomDynamoClient('EventTable')

  const seed = async (): Promise<Row> => {
    const row: Row = { id: uniqueId('fold'), results: { ALO: [1, 2], NOU: { a: 1 } }, tags: ['a', 'b'] }
    await client.write(row)
    return row
  }

  const writeNote = (row: Row, condition: ReturnType<typeof foldedFrom>) =>
    client.update({ id: row.id }, { set: { note: 'written' } }, undefined, condition)

  // Every name must be used in the expression, so each path defines its own.
  it.each([
    ['a list', '#tags', { '#tags': 'tags' }, ['a', 'b'], ['a', 'c']],
    ['a map', '#results', { '#results': 'results' }, { ALO: [1, 2], NOU: { a: 1 } }, { ALO: [1, 2], NOU: { a: 2 } }],
    ['one entry of a map', '#results.#class', { '#class': 'ALO', '#results': 'results' }, [1, 2], [1, 3]],
  ])('passes for an equal %s and refuses a different one', async (_what, path, names, equal, different) => {
    const row = await seed()

    await expect(writeNote(row, foldedFrom(path, names, different))).rejects.toMatchObject({
      name: 'ConditionalCheckFailedException',
    })
    await expect(client.read<Row>({ id: row.id })).resolves.toEqual(row)

    await writeNote(row, foldedFrom(path, names, equal))
    await expect(client.read<Row>({ id: row.id })).resolves.toEqual({ ...row, note: 'written' })
  })

  it('passes when the value read was absent and is still absent, and refuses once something is there', async () => {
    const row = await seed()
    const absent = foldedFrom('#note', { '#note': 'note' }, undefined)

    await writeNote(row, absent)
    await expect(client.read<Row>({ id: row.id })).resolves.toEqual({ ...row, note: 'written' })

    await expect(writeNote(row, absent)).rejects.toMatchObject({ name: 'ConditionalCheckFailedException' })
  })

  it('never writes a stub row for an id that does not exist', async () => {
    const missing: Row = { id: uniqueId('missing') }

    await expect(writeNote(missing, foldedFrom('#note', { '#note': 'note' }, undefined))).rejects.toMatchObject({
      name: 'ConditionalCheckFailedException',
    })
    await expect(client.read<Row>({ id: missing.id })).resolves.toBeUndefined()
  })
})
