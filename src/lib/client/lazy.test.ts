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
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('returns loaded value and clears previous reload marker', async () => {
    sessionStorage.setItem('koekalenteri:chunk-load-reloaded', 'true')

    await expect(reloadOnChunkLoadError(() => Promise.resolve('loaded'))).resolves.toBe('loaded')

    expect(sessionStorage.getItem('koekalenteri:chunk-load-reloaded')).toBeNull()
  })

  it('reloads once and leaves the import promise pending for a chunk load error', async () => {
    const reload = jest.fn()
    const promise = reloadOnChunkLoadError(() => Promise.reject(new Error('Loading chunk 123 failed.')), reload)

    await Promise.resolve()

    expect(reload).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('koekalenteri:chunk-load-reloaded')).toBe('true')
    await expect(Promise.race([promise, Promise.resolve('pending')])).resolves.toBe('pending')
  })

  it('rethrows chunk load errors after a reload has already been attempted', async () => {
    const error = new Error('Loading chunk 123 failed.')
    const reload = jest.fn()
    sessionStorage.setItem('koekalenteri:chunk-load-reloaded', 'true')

    await expect(reloadOnChunkLoadError(() => Promise.reject(error), reload)).rejects.toBe(error)

    expect(reload).not.toHaveBeenCalled()
  })

  it('rethrows non chunk load errors', async () => {
    const error = new Error('regular app error')
    const reload = jest.fn()

    await expect(reloadOnChunkLoadError(() => Promise.reject(error), reload)).rejects.toBe(error)

    expect(reload).not.toHaveBeenCalled()
  })
})
