import { uniqueId } from '../test-utils/integration'
import CustomDynamoClient from './CustomDynamoClient'

interface Row {
  id: string
  organizerId?: string
  season?: string
  startDate?: string | number | Date
  marker?: string
  counts?: Record<string, number>
  tags?: Set<string> | string[]
  nested?: { list: number[]; obsolete?: string }
  [key: string]: unknown
}

/** A row under keys of this test's own in every index the event table has. */
const row = (overrides: Partial<Row> = {}): Row => ({
  id: uniqueId('row'),
  organizerId: uniqueId('org'),
  season: uniqueId('season'),
  startDate: '2026-06-01T09:00:00.000Z',
  ...overrides,
})

describe('CustomDynamoClient against DynamoDB-local', () => {
  // The constructor is given the template's logical id, as the lambdas' environment does, and
  // derives the local table name from it: the write lands only if that is the table the global
  // setup created from the template.
  const client = new CustomDynamoClient('EventTable')

  describe('write and read', () => {
    it('round-trips a row through the table named by the environment', async () => {
      const item = row({ name: 'Round trip' })

      await client.write(item)

      await expect(client.read<Row>({ id: item.id })).resolves.toEqual(item)
    })

    it('reads an unknown key as undefined', async () => {
      await expect(client.read<Row>({ id: uniqueId('missing') })).resolves.toBeUndefined()
    })
  })

  describe('query', () => {
    it('reads the rows of one partition through gsiOrganizerStartDate, in key order', async () => {
      const organizerId = uniqueId('org')
      const later = row({ organizerId, startDate: '2026-08-01T09:00:00.000Z' })
      const earlier = row({ organizerId, startDate: '2026-02-01T09:00:00.000Z' })
      await client.batchWrite([later, earlier, row()])

      const items = await client.query<Row>({
        index: 'gsiOrganizerStartDate',
        key: 'organizerId = :organizerId',
        values: { ':organizerId': organizerId },
      })

      expect(items).toEqual([earlier, later])
    })

    // The issue's done criterion (KOE-1369): a query that names a key the index does not have is
    // refused by the database, so it fails in this suite rather than in production.
    it('is refused by the database when the key condition names an attribute the index is not keyed on', async () => {
      await expect(
        client.query<Row>({
          index: 'gsiOrganizerStartDate',
          key: 'season = :season',
          values: { ':season': uniqueId('season') },
        })
      ).rejects.toMatchObject({
        message: expect.stringContaining('Query condition missed key schema element'),
        name: 'ValidationException',
      })
    })

    it('is refused by the database when the index does not exist', async () => {
      await expect(
        client.query<Row>({
          index: 'gsiNope',
          key: 'organizerId = :organizerId',
          values: { ':organizerId': uniqueId('org') },
        })
      ).rejects.toMatchObject({
        message: expect.stringContaining('does not have the specified index: gsiNope'),
        name: 'ValidationException',
      })
    })

    it('honours the limit across the real pages', async () => {
      const organizerId = uniqueId('org')
      await client.batchWrite([1, 2, 3].map((day) => row({ organizerId, startDate: `2026-03-0${day}T09:00:00.000Z` })))

      const items = await client.query<Row>({
        forward: false,
        index: 'gsiOrganizerStartDate',
        key: 'organizerId = :organizerId',
        limit: 2,
        values: { ':organizerId': organizerId },
      })

      expect(items?.map((item) => item.startDate)).toEqual(['2026-03-03T09:00:00.000Z', '2026-03-02T09:00:00.000Z'])
    })
  })

  describe('readAll', () => {
    // KOE-1569: a since query has to see the deleted rows to report them as deletedIds.
    it('leaves deleted rows out unless they are asked for', async () => {
      const marker = uniqueId('deleted')
      const live = row({ marker })
      const deleted = row({ deletedAt: '2026-06-02T09:00:00.000Z', marker })
      const byMarker = { filter: '#marker = :marker', names: { '#marker': 'marker' }, values: { ':marker': marker } }

      await client.batchWrite([live, deleted])

      await expect(client.readAll<Row>(byMarker)).resolves.toEqual([live])
      const withDeleted = await client.readAll<Row>({ ...byMarker, includeDeleted: true })
      expect(withDeleted).toHaveLength(2)
      expect(withDeleted).toEqual(expect.arrayContaining([live, deleted]))
    })
  })

  describe('batchWrite and batchDelete', () => {
    // DynamoDB takes 25 items per request; 60 rows are three requests, and every one of them must
    // land. The retry of a partly processed request stays a unit test: DynamoDB-local never throttles.
    it('writes 60 rows in requests of 25 and deletes them again', async () => {
      const marker = uniqueId('batch')
      const rows = Array.from({ length: 60 }, (_, index) => row({ index, marker }))
      const query = () =>
        client.readAll<Row>({
          filter: '#marker = :marker',
          names: { '#marker': 'marker' },
          values: { ':marker': marker },
        })

      await client.batchWrite(rows)
      const written = await query()
      expect(written).toHaveLength(60)
      expect(new Set(written?.map((item) => item.index))).toEqual(new Set(rows.map((item) => item.index)))

      await client.batchDelete(rows.map(({ id }) => ({ id })))
      await expect(query()).resolves.toEqual([])
    })
  })

  describe('marshalling', () => {
    it('refuses a Date object in the item before it reaches the table', async () => {
      await expect(client.write(row({ startDate: new Date('2026-06-01T09:00:00.000Z') }))).rejects.toThrow(
        /Unsupported type passed/
      )
    })

    it('round-trips an ISO date string unchanged', async () => {
      const startDate = new Date('2026-06-01T09:00:00.000Z').toISOString()
      const item = row({ startDate })

      await client.write(item)

      await expect(client.read<Row>({ id: item.id })).resolves.toMatchObject({ startDate })
    })

    it('is refused by the database when an index key attribute has the wrong type', async () => {
      await expect(client.write(row({ startDate: 20260601 }))).rejects.toMatchObject({
        message: expect.stringContaining('Type mismatch for Index Key'),
        name: 'ValidationException',
      })
    })
  })

  describe('update', () => {
    it('applies nested set, add, remove and delete on a stored row', async () => {
      const item = row({
        counts: { registrations: 1 },
        nested: { list: [1, 2, 3], obsolete: 'drop me' },
        tags: new Set(['keep', 'drop']),
      })
      await client.write(item)

      await client.update(
        { id: item.id },
        {
          add: { 'counts.registrations': 2 },
          delete: { tags: new Set(['drop']) },
          remove: ['nested.obsolete'],
          set: { 'nested.list.1': 9 },
        }
      )

      await expect(client.read<Row>({ id: item.id })).resolves.toEqual({
        ...item,
        counts: { registrations: 3 },
        nested: { list: [1, 9, 3] },
        // A set comes back as a sorted array (KOE-1529)
        tags: ['keep'],
      })
    })

    it('returns the row as written when asked', async () => {
      const item = row()
      await client.write(item)

      const result = await client.update({ id: item.id }, { set: { name: 'Renamed' } }, 'ALL_NEW')

      expect(result.Attributes).toEqual({ ...item, name: 'Renamed' })
    })

    it('refuses the write when its condition does not hold', async () => {
      const item = row({ name: 'Original' })
      await client.write(item)

      await expect(
        client.update({ id: item.id }, { set: { name: 'Changed' } }, undefined, {
          expression: '#name = :expected',
          names: { '#name': 'name' },
          values: { ':expected': 'Something else' },
        })
      ).rejects.toMatchObject({ name: 'ConditionalCheckFailedException' })
      await expect(client.read<Row>({ id: item.id })).resolves.toEqual(item)
    })
  })

  // The transaction every lambda uses: `documentTransaction`, whose items are plain objects the
  // document client marshals. (`transaction` takes attribute values and has no caller in the lambdas.)
  describe('documentTransaction', () => {
    // One operation per item: a condition on a row that is also updated in the same transaction is
    // refused ("cannot include multiple operations on one item"), so it checks a third row.
    it('writes every item when every condition holds', async () => {
      const existing = row({ name: 'Existing' })
      const checked = row({ name: 'Checked' })
      const created = row({ name: 'Created' })
      await client.batchWrite([existing, checked])

      await client.documentTransaction([
        {
          ConditionCheck: {
            ConditionExpression: 'attribute_exists(id)',
            Key: { id: checked.id },
            TableName: 'EventTable',
          },
        },
        { Put: { Item: created, TableName: 'EventTable' } },
        {
          Update: {
            ExpressionAttributeNames: { '#name': 'name' },
            ExpressionAttributeValues: { ':name': 'Updated' },
            Key: { id: existing.id },
            TableName: 'EventTable',
            UpdateExpression: 'SET #name = :name',
          },
        },
      ])

      await expect(client.read<Row>({ id: created.id })).resolves.toEqual(created)
      await expect(client.read<Row>({ id: existing.id })).resolves.toEqual({ ...existing, name: 'Updated' })
    })

    it('writes nothing when one condition fails', async () => {
      const created = row({ name: 'Never created' })

      await expect(
        client.documentTransaction([
          { Put: { Item: created, TableName: 'EventTable' } },
          {
            ConditionCheck: {
              ConditionExpression: 'attribute_exists(id)',
              Key: { id: uniqueId('missing') },
              TableName: 'EventTable',
            },
          },
        ])
      ).rejects.toMatchObject({
        CancellationReasons: [{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }],
        name: 'TransactionCanceledException',
      })

      await expect(client.read<Row>({ id: created.id })).resolves.toBeUndefined()
    })
  })

  describe('delete', () => {
    it('removes the row', async () => {
      const item = row()
      await client.write(item)

      await expect(client.delete({ id: item.id })).resolves.toBe(true)
      await expect(client.read<Row>({ id: item.id })).resolves.toBeUndefined()
    })
  })
})
