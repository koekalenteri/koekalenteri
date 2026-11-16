import { isChunkLoadError, reloadOnChunkLoadError } from './lazy'

describe('isChunkLoadError', () => {
  it.each([
    new Error('Loading chunk 123 failed.'),
    new Error('Loading CSS chunk 867 failed.'),
    new Error('Failed to fetch dynamically imported module: https://example.test/static/js/admin.js'),
    new Error('Importing a module script failed.'),
    new Error('Unable to preload CSS for /static/css/admin.css'),
    Object.assign(new Error('network'), { name: 'ChunkLoadError' }),
  ])('returns true for chunk load error %#', (error) => {
    expect(isChunkLoadError(error)).toBe(true)
  })

  it.each([undefined, null, 'Loading chunk 123 failed.', new Error('regular app error')])(
    'returns false for non chunk load error %#',
    (error) => {
      expect(isChunkLoadError(error)).toBe(false)
    }
  )
})

describe('reloadOnChunkLoadError', () => {
  const KEY = 'koekalenteri:chunk-load-reloaded'
  const NOW = 1_800_000_000_000
  const now = () => NOW
  const chunkError = () => new Error('Loading chunk 123 failed.')

  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // KOE-1755: a reload that lands on an eager page (the calendar) has no lazy load to clear the mark
  // with, so a mark cleared on success stayed for the tab's life and refused the next update's reload.
  it('returns the loaded value and leaves the reload mark to expire', async () => {
    sessionStorage.setItem(KEY, String(NOW - 5_000))

    await expect(reloadOnChunkLoadError(() => Promise.resolve('loaded'), vi.fn(), now)).resolves.toBe('loaded')

    expect(sessionStorage.getItem(KEY)).toBe(String(NOW - 5_000))
  })

  it.each([
    ['no mark', undefined],
    ['a mark older than a minute', String(NOW - 61_000)],
    ['the mark of the bundle before KOE-1755', 'true'],
    ['a mark from the future', String(NOW + 5_000)],
  ])('reloads once and leaves the import promise pending with %s', async (_, mark) => {
    if (mark !== undefined) sessionStorage.setItem(KEY, mark)
    const reload = vi.fn()
    const promise = reloadOnChunkLoadError(() => Promise.reject(chunkError()), reload, now)

    await Promise.resolve()

    expect(reload).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(KEY)).toBe(String(NOW))
    await expect(Promise.race([promise, Promise.resolve('pending')])).resolves.toBe('pending')
  })

  it('rethrows a chunk load error within a minute of the previous reload', async () => {
    const error = chunkError()
    const reload = vi.fn()
    sessionStorage.setItem(KEY, String(NOW - 5_000))

    await expect(reloadOnChunkLoadError(() => Promise.reject(error), reload, now)).rejects.toBe(error)

    expect(reload).not.toHaveBeenCalled()
  })

  // Without a readable mark there is no telling whether this load already follows a reload, and a
  // guess of "no" could reload forever.
  it('rethrows a chunk load error when the mark cannot be read', async () => {
    const error = chunkError()
    const reload = vi.fn()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    await expect(reloadOnChunkLoadError(() => Promise.reject(error), reload, now)).rejects.toBe(error)

    expect(reload).not.toHaveBeenCalled()
  })

  it('rethrows non chunk load errors', async () => {
    const error = new Error('regular app error')
    const reload = vi.fn()

    await expect(reloadOnChunkLoadError(() => Promise.reject(error), reload, now)).rejects.toBe(error)

    expect(reload).not.toHaveBeenCalled()
  })
})
