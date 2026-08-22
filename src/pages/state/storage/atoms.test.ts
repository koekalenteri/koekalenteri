import { createStore } from 'jotai'
import { atomWithStoredValue, parseStorageJSON } from './atoms'

describe('storage atoms', () => {
  afterEach(() => vi.restoreAllMocks())

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
    const valueAtom = atomWithStoredValue('refined-storage-test', [], localStorage, {
      onRefined,
      refine: (value) => (Array.isArray(value) ? value.filter((item) => item?.valid) : undefined),
    })

    expect(createStore().get(valueAtom)).toEqual([{ valid: true }])
    expect(localStorage.getItem('refined-storage-test')).toBe(JSON.stringify([{ valid: true }]))
    expect(onRefined).toHaveBeenCalledTimes(1)
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
