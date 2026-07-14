import { collectionResponseCursor, collectionSince, latestCollectionUpdate, reconcileCollection } from './incremental'

describe('incremental collections', () => {
  it('finds the latest modification timestamp', () => {
    expect(
      latestCollectionUpdate([
        { id: 'a', modifiedAt: new Date('2024-01-01T00:00:00.000Z') },
        { id: 'b', updatedAt: '2024-01-03T00:00:00.000Z' },
      ])
    ).toEqual(new Date('2024-01-03T00:00:00.000Z'))
  })

  it('prefers the server cursor and can force a full request', () => {
    const items = [{ id: 'a', modifiedAt: new Date('2024-01-01T00:00:00.000Z') }]

    expect(collectionSince(items, Date.parse('2024-01-03T00:00:00.000Z'))).toEqual(new Date('2024-01-03T00:00:00.000Z'))
    expect(collectionSince(items, null)).toBeUndefined()
    expect(collectionResponseCursor({ cursor: 123, deletedIds: [], items: [] })).toBe(123)
  })

  it('merges changed items and removes deleted items', () => {
    expect(
      reconcileCollection(
        [
          { id: 'a', value: 'old' },
          { id: 'b', value: 'keep' },
          { id: 'c', value: 'remove' },
        ],
        { cursor: 123, deletedIds: ['c'], items: [{ id: 'a', value: 'new' }] }
      )
    ).toEqual([
      { id: 'a', value: 'new' },
      { id: 'b', value: 'keep' },
    ])
  })

  it('supports collection-specific identifiers', () => {
    expect(
      reconcileCollection(
        [
          { eventType: 'A', value: 'old' },
          { eventType: 'B', value: 'remove' },
        ],
        { cursor: 123, deletedIds: ['B'], items: [{ eventType: 'A', value: 'new' }] },
        (item) => item.eventType
      )
    ).toEqual([{ eventType: 'A', value: 'new' }])
  })
})
