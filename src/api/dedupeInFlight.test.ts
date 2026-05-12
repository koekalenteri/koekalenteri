import { dedupeInFlight } from './dedupeInFlight'

describe('dedupeInFlight', () => {
  test('deduplicates concurrent calls with the same key', async () => {
    let resolveRequest: ((value: string) => void) | undefined
    const fn = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveRequest = resolve
        })
    )
    const wrapped = dedupeInFlight((key: string) => key, fn)

    const first = wrapped('same')
    const second = wrapped('same')

    expect(fn).toHaveBeenCalledTimes(1)

    resolveRequest?.('ok')

    await expect(Promise.all([first, second])).resolves.toEqual(['ok', 'ok'])
  })

  test('cleans up after rejection so the next call can retry', async () => {
    const fn = jest.fn<Promise<string>, [string]>().mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce('ok')
    const wrapped = dedupeInFlight((key: string) => key, fn)

    await expect(wrapped('same')).rejects.toThrow('fail')
    await expect(wrapped('same')).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
