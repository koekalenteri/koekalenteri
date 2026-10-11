import { getStorageKeysStartingWith, languageStorageKey, readStoredLanguage } from './storage'

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

describe('readStoredLanguage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it.each([
    { expected: 'en', name: 'English', stored: JSON.stringify('en') },
    { expected: 'fi', name: 'Finnish', stored: JSON.stringify('fi') },
    { expected: 'fi', name: 'an unknown language', stored: JSON.stringify('sv') },
    { expected: 'fi', name: 'unreadable JSON', stored: '{' },
  ])('reads $name as $expected', ({ expected, stored }) => {
    localStorage.setItem(languageStorageKey, stored)

    expect(readStoredLanguage()).toBe(expected)
  })

  it('reads nothing stored as Finnish', () => {
    expect(readStoredLanguage()).toBe('fi')
  })

  it('falls back to Finnish when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    expect(readStoredLanguage()).toBe('fi')
  })
})
