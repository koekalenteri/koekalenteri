import type { PatchOperation } from '../types'
import { applyPatchOperations, createPatchOperations, InvalidPatchError, nullsAsRemovals } from './patch'

describe('nullsAsRemovals (KOE-1721)', () => {
  it('reads a change to null as a removal and drops a field created as null', () => {
    expect(
      nullsAsRemovals([
        { path: ['class'], type: 'CHANGE', value: null },
        { path: ['teamEntry'], type: 'CREATE', value: null },
        { path: ['notes'], type: 'REMOVE' },
      ])
    ).toEqual([
      { path: ['class'], type: 'REMOVE' },
      { path: ['notes'], type: 'REMOVE' },
    ])
  })

  it('leaves the nulls out of a value, in its objects and its lists alike', () => {
    expect(
      nullsAsRemovals([
        { path: ['handler'], type: 'CHANGE', value: { email: null, name: 'Handler', phone: '' } },
        { path: ['owners'], type: 'CHANGE', value: [null, { location: null, name: 'Owner' }] },
        { path: ['reserve'], type: 'CHANGE', value: 'ANY' },
      ])
    ).toEqual([
      { path: ['handler'], type: 'CHANGE', value: { name: 'Handler', phone: '' } },
      { path: ['owners'], type: 'CHANGE', value: [{ name: 'Owner' }] },
      { path: ['reserve'], type: 'CHANGE', value: 'ANY' },
    ])
  })
})

describe('patch operations', () => {
  it('creates deterministic operations that preserve arrays', () => {
    const before = {
      dates: [
        { date: '2026-01-01', time: 'ap' },
        { date: '2026-01-02', time: 'ip' },
      ],
      qualifyingResults: [{ result: 'ALO1' }, { result: 'ALO2' }],
    }
    const after = {
      dates: [{ date: '2026-01-01', time: 'ip' }],
      qualifyingResults: [],
    }

    const operations = createPatchOperations(before, after)

    expect(applyPatchOperations(before, operations)).toEqual(after)
    expect(before.dates).toHaveLength(2)
  })

  it('applies array removals from the highest index', () => {
    const before = { values: ['a', 'b', 'c', 'd'] }
    const operations = [
      { path: ['values', 1], type: 'REMOVE' as const },
      { path: ['values', 3], type: 'REMOVE' as const },
    ]

    expect(applyPatchOperations(before, operations)).toEqual({ values: ['a', 'c'] })
  })

  it('supports dates and field removals', () => {
    const before = { date: new Date('2026-01-01T12:00:00Z'), optional: true }
    const after = { date: new Date('2026-01-02T12:00:00Z') }

    expect(applyPatchOperations(before, createPatchOperations(before, after))).toEqual(after)
  })

  it('serializes explicit undefined values as removals', () => {
    const operations = createPatchOperations({ optional: true }, { optional: undefined })

    expect(operations).toEqual([{ path: ['optional'], type: 'REMOVE' }])
    expect(applyPatchOperations({ optional: true }, operations)).toEqual({})
  })

  it('copies only containers along changed paths', () => {
    const untouched = { value: true }
    const before = { changed: { value: 1 }, untouched }
    const after = { changed: { value: 2 }, untouched }

    const result = applyPatchOperations(before, createPatchOperations(before, after))

    expect(result).not.toBe(before)
    expect(result.changed).not.toBe(before.changed)
    expect(result.untouched).toBe(untouched)
  })

  const invalidOperations: Array<[PatchOperation[]]> = [
    [[{ path: ['__proto__', 'polluted'], type: 'CREATE', value: true }]],
    [[{ path: ['values', -1], type: 'CHANGE', value: true }]],
    [
      [
        { path: ['value'], type: 'CHANGE', value: true },
        { path: ['value', 'nested'], type: 'REMOVE' },
      ],
    ],
  ]

  it.each(invalidOperations)('rejects invalid operations', (operations) => {
    expect(() => applyPatchOperations({ value: {}, values: [] }, operations)).toThrow(InvalidPatchError)
  })
})
