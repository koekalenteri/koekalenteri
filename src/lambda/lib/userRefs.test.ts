import { compressCanonicalMap, normalizeUserId } from './userRefs'

describe('lib/userRefs', () => {
  it('normalizeUserId normalizes number/string and handles undefined', () => {
    expect(normalizeUserId(123)).toBe('123')
    expect(normalizeUserId('abc')).toBe('abc')
    expect(normalizeUserId(undefined)).toBeUndefined()
  })

  it('compressCanonicalMap performs path compression', () => {
    const map = new Map<string, string>([
      ['A', 'B'],
      ['B', 'C'],
      ['X', 'Y'],
    ])

    compressCanonicalMap(map)

    expect(map.get('A')).toBe('C')
    expect(map.get('B')).toBe('C')
    expect(map.get('X')).toBe('Y')
  })
})
