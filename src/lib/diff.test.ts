import {
  getChangedTopLevelKeys,
  getDiffOperations,
  getNestedChanges,
  materializeDiffOperation,
  objectsDiffer,
} from './diff'

describe('diff helpers', () => {
  it('returns raw create, change, and remove operations', () => {
    expect(getDiffOperations({ changed: 1, removed: true }, { changed: 2, created: true })).toEqual([
      { oldValue: 1, path: ['changed'], type: 'CHANGE', value: 2 },
      { oldValue: true, path: ['removed'], type: 'REMOVE' },
      { path: ['created'], type: 'CREATE', value: true },
    ])
  })

  it('compares undefined, null, and dates', () => {
    expect(objectsDiffer({ value: null }, { value: null })).toBe(false)
    expect(objectsDiffer({ value: undefined }, {})).toBe(true)
    expect(objectsDiffer({ date: new Date('2026-01-01') }, { date: new Date('2026-01-01') })).toBe(false)
    expect(objectsDiffer({ date: new Date('2026-01-01') }, { date: new Date('2026-01-02') })).toBe(true)
  })

  it('returns stable, deduplicated top-level keys for nested changes', () => {
    const before = { first: { a: 1, b: 2 }, second: true }
    const after = { first: { a: 3, b: 4 }, second: false, third: true }

    expect(getChangedTopLevelKeys(before, after)).toEqual(['first', 'second', 'third'])
  })

  it('builds nested patches with null removal markers', () => {
    // `null`, not `undefined`, so the removal survives JSON.stringify when the patch is
    // sent over the wire (JSON.stringify drops `undefined`-valued properties entirely).
    const before = { contact: { email: 'old@example.com', phone: '123' }, explicit: true }
    const after = { contact: { email: 'new@example.com' }, explicit: undefined }

    expect(getNestedChanges(before, after)).toEqual({
      contact: { email: 'new@example.com', phone: null },
      explicit: undefined,
    })
  })

  it.each([
    [{ values: ['a', 'b'] }, { values: ['a', 'c'] }],
    [{ values: ['a'] }, { values: ['a', 'b'] }],
    [{ values: ['a', 'b'] }, { values: ['a'] }],
  ])('materializes complete arrays for edits, insertions, and removals', (before, after) => {
    expect(getNestedChanges(before, after)).toEqual({ values: after.values })
  })

  it('materializes a nested array at its nearest array parent', () => {
    const before = { contact: { phones: [{ number: '123' }] } }
    const after = { contact: { phones: [{ number: '456' }] } }

    expect(getNestedChanges(before, after)).toEqual({ contact: { phones: after.contact.phones } })
  })

  it('materializes diff operations with the canonical persisted path and value', () => {
    const before = { contact: { phones: [{ number: '123' }], title: 'Secretary' } }
    const after = { contact: { phones: [{ number: '456' }] } }
    const [phoneChange, titleRemoval] = getDiffOperations(before, after)

    expect(materializeDiffOperation(phoneChange, after)).toEqual({
      path: ['contact', 'phones'],
      value: after.contact.phones,
    })
    expect(materializeDiffOperation(titleRemoval, after)).toEqual({
      path: ['contact', 'title'],
      value: null,
    })
  })
})
