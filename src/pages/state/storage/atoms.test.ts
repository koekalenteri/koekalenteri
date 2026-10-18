import type { JsonPublicDogEvent, PublicDogEvent } from '@/types'
import { createStore } from 'jotai'
import { arrayOf, toPublicDogEvent } from '@/lib/wire'
import { atomWithStoredValue, parseStorageJSON } from './atoms'

describe('storage atoms', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reads a stored value as written: a text that looks like a day stays text (KOE-1546)', () => {
    localStorage.setItem(
      'as-written-test',
      JSON.stringify({ description: '2024-05-01', notes: '2026-05-01T08:00:00.000Z' })
    )
    const valueAtom = atomWithStoredValue('as-written-test', {}, localStorage)

    expect(createStore().get(valueAtom)).toEqual({ description: '2024-05-01', notes: '2026-05-01T08:00:00.000Z' })
  })

  it('revives a stored value through its converter, without writing the storage back', () => {
    const stored = [{ description: '2024-05-01', id: 'e1', startDate: '2026-05-01T21:00:00.000Z' }]
    localStorage.setItem('revived-test', JSON.stringify(stored))
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const onRefined = vi.fn()
    const valueAtom = atomWithStoredValue<PublicDogEvent[], JsonPublicDogEvent[]>('revived-test', [], localStorage, {
      onRefined,
      refine: (value) => (Array.isArray(value) ? value : undefined),
      revive: arrayOf(toPublicDogEvent),
    })

    const events = createStore().get(valueAtom)

    expect(events[0].startDate).toEqual(new Date('2026-05-01T21:00:00.000Z'))
    expect(events[0].description).toBe('2024-05-01')
    expect(setItem).not.toHaveBeenCalled()
    expect(onRefined).not.toHaveBeenCalled()
  })

  it('falls back when the converter cannot read the stored value, and removes it', () => {
    localStorage.setItem('unreadable-test', JSON.stringify({ not: 'a list' }))
    const valueAtom = atomWithStoredValue<PublicDogEvent[], JsonPublicDogEvent[]>('unreadable-test', [], localStorage, {
      revive: arrayOf(toPublicDogEvent),
    })

    expect(createStore().get(valueAtom)).toEqual([])
    expect(localStorage.getItem('unreadable-test')).toBeNull()
  })

  it('leaves a stored null to the atom, with nothing to revive', () => {
    localStorage.setItem('null-test', 'null')
    const valueAtom = atomWithStoredValue<PublicDogEvent[] | null, JsonPublicDogEvent[]>(
      'null-test',
      [],
      localStorage,
      {
        revive: arrayOf(toPublicDogEvent),
      }
    )

    expect(createStore().get(valueAtom)).toBeNull()
  })

  it('parses stored JSON and handles invalid input', () => {
    expect(parseStorageJSON(null)).toBeUndefined()
    expect(parseStorageJSON('null')).toBeNull()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(parseStorageJSON('{')).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith('JSON parse error', expect.any(SyntaxError))
  })

  it('initializes from storage and persists changes', () => {
    const storage = localStorage
    storage.setItem('native-storage-test', JSON.stringify('stored'))
    const valueAtom = atomWithStoredValue('native-storage-test', 'default', storage)
    const store = createStore()

    expect(store.get(valueAtom)).toBe('stored')
    store.set(valueAtom, 'changed')
    expect(storage.getItem('native-storage-test')).toBe(JSON.stringify('changed'))
  })

  it('refines stored values and persists the result', () => {
    localStorage.setItem('refined-storage-test', JSON.stringify([{ valid: true }, { valid: false }]))
    const onRefined = vi.fn()
    const valueAtom = atomWithStoredValue<{ valid: boolean }[]>('refined-storage-test', [], localStorage, {
      onRefined,
      refine: (value) => (Array.isArray(value) ? value.filter((item) => item?.valid) : undefined),
    })

    expect(createStore().get(valueAtom)).toEqual([{ valid: true }])
    expect(localStorage.getItem('refined-storage-test')).toBe(JSON.stringify([{ valid: true }]))
    expect(onRefined).toHaveBeenCalledTimes(1)
  })

  it('names a converter exactly when the model holds a Date', () => {
    // @ts-expect-error A calendar event holds Dates, so the stored list cannot be read without its converter.
    atomWithStoredValue<PublicDogEvent[]>('typed-storage-test', [], localStorage)
    // @ts-expect-error A string holds no Date: there is nothing to convert.
    atomWithStoredValue<string, string>('typed-storage-test', '', localStorage, { revive: (stored) => stored })

    expect(atomWithStoredValue<string>('typed-storage-test', '', localStorage)).toBeDefined()
  })

  it('does not persist changes made by a hidden window', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const valueAtom = atomWithStoredValue('hidden-storage-test', 'default', localStorage)

    createStore().set(valueAtom, 'changed')

    expect(localStorage.getItem('hidden-storage-test')).toBeNull()
    expect(infoSpy).toHaveBeenCalledWith('Preventing change from invisible window to storage. Key: hidden-storage-test')
  })
})
