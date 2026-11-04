import {
  collectionResponseCursor,
  collectionSince,
  itemStamp,
  keepNewerRows,
  latestCollectionUpdate,
  reconcileCollection,
} from './incremental'

describe('incremental collections', () => {
  it('finds the latest modification timestamp', () => {
    expect(
      latestCollectionUpdate([
        { id: 'a', modifiedAt: new Date('2024-01-01T00:00:00.000Z') },
        { id: 'b', updatedAt: '2024-01-03T00:00:00.000Z' },
      ])
    ).toEqual(new Date('2024-01-03T00:00:00.000Z'))
  })

  it('advances past a refreshed lastSeen', () => {
    // The users cursor has to move with lastSeen, or the next incremental fetch asks for the rows
    // it just received all over again.
    expect(
      latestCollectionUpdate([
        { id: 'a', modifiedAt: '2024-01-01T00:00:00.000Z' },
        { id: 'b', lastSeen: '2024-01-05T00:00:00.000Z', modifiedAt: '2024-01-02T00:00:00.000Z' },
      ])
    ).toEqual(new Date('2024-01-05T00:00:00.000Z'))
  })

  it('counts a deletion as a change', () => {
    expect(
      latestCollectionUpdate([
        { deletedAt: '2024-01-06T00:00:00.000Z', id: 'a', modifiedAt: '2024-01-01T00:00:00.000Z' },
      ])
    ).toEqual(new Date('2024-01-06T00:00:00.000Z'))
  })

  it('has no stamp for a row that carries none, or only unparseable ones', () => {
    expect(itemStamp({})).toBeUndefined()
    expect(itemStamp({ modifiedAt: 'not a date' })).toBeUndefined()
  })

  it('takes the latest timestamp a row carries, not the first one present', () => {
    expect(
      latestCollectionUpdate([
        { id: 'a', modifiedAt: '2024-01-04T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
      ])
    ).toEqual(new Date('2024-01-04T00:00:00.000Z'))
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

  it('preserves the existing array when an incremental response has no changes', () => {
    const existing = [{ id: 'a', value: 'unchanged' }]

    expect(reconcileCollection(existing, { cursor: 123, deletedIds: [], items: [] })).toBe(existing)
  })

  describe('keepNewerRows', () => {
    const row = (id: string, updatedAt?: string) => ({ id, updatedAt })

    it('keeps the copy in hand only where it is newer than the answer', () => {
      const newer = row('newer', '2026-01-03')
      const older = row('older', '2026-01-01')
      const answered = [row('newer', '2026-01-02'), row('older', '2026-01-02'), row('added', '2026-01-02')]

      expect(keepNewerRows([newer, older], answered)).toEqual([newer, answered[1], answered[2]])
    })

    it('lets a row the answer does not name go', () => {
      expect(keepNewerRows([row('gone', '2026-01-03')], [])).toEqual([])
    })

    it('takes the answer when the stamps are equal or there are none to compare', () => {
      const answered = [row('same', '2026-01-02'), row('unstamped')]

      expect(keepNewerRows([row('same', '2026-01-02'), row('unstamped')], answered)).toEqual(answered)
      expect(keepNewerRows([row('stamped')], [row('stamped', '2026-01-02')])).toEqual([row('stamped', '2026-01-02')])
    })
  })
})
