import { changedItemsSince, collectionChangesSince, parseDateParam } from './incremental'

describe('incremental collection helpers', () => {
  const since = new Date('2024-01-02T00:00:00.000Z')

  it('parses epoch and ISO date parameters', () => {
    expect(parseDateParam('1704153600000')).toEqual(since)
    expect(parseDateParam('2024-01-02T00:00:00.000Z')).toEqual(since)
    expect(parseDateParam('invalid')).toBeUndefined()
  })

  it('includes records modified at or after since', () => {
    expect(
      changedItemsSince(
        [
          { id: 'old', modifiedAt: '2024-01-01T00:00:00.000Z' },
          { id: 'same', modifiedAt: '2024-01-02T00:00:00.000Z' },
          { id: 'new', updatedAt: '2024-01-03T00:00:00.000Z' },
        ],
        since
      ).map((item) => item.id)
    ).toEqual(['same', 'new'])
  })

  it('uses deletion time and emits deletion tombstones', () => {
    expect(
      collectionChangesSince(
        [
          {
            deletedAt: '2024-01-03T00:00:00.000Z',
            id: 1,
            modifiedAt: '2024-01-01T00:00:00.000Z',
          },
          { id: 2, modifiedAt: '2024-01-03T00:00:00.000Z' },
        ],
        since
      )
    ).toEqual({
      cursor: Date.parse('2024-01-03T00:00:00.000Z'),
      deletedIds: ['1'],
      items: [{ id: 2, modifiedAt: '2024-01-03T00:00:00.000Z' }],
    })
  })
})
