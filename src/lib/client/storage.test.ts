import { getStorageKeysStartingWith } from './storage'

describe('storageCleaners', () => {
  beforeAll(() => {
    localStorage.clear()
    localStorage.setItem('a1', '')
    localStorage.setItem('a2', '')
    localStorage.setItem('b1', '')
    localStorage.setItem('b2', '')
    localStorage.setItem('c1', '')
  })
  afterAll(() => {
    localStorage.clear()
  })

  describe('getStorageKeysStartingWith', () => {
    it('returns keys with starting with any of the prefixes', () => {
      expect(getStorageKeysStartingWith(['a', 'c'])).toEqual(['a1', 'a2', 'c1'])
      expect(getStorageKeysStartingWith(['b'])).toEqual(['b1', 'b2'])
      expect(getStorageKeysStartingWith(['d'])).toEqual([])
    })
  })
})
