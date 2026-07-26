import { coalesceRequest } from './coalesceRequest'

describe('coalesceRequest', () => {
  it('shares a request only while it is pending', async () => {
    let resolveRequest: (value: string) => void = () => undefined
    const factory = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveRequest = resolve
          })
      )
      .mockResolvedValueOnce('second response')

    const first = coalesceRequest('users:current', factory)
    const concurrent = coalesceRequest('users:current', factory)

    expect(concurrent).toBe(first)
    await Promise.resolve()
    expect(factory).toHaveBeenCalledTimes(1)

    resolveRequest('first response')
    await expect(first).resolves.toBe('first response')
    await expect(coalesceRequest('users:current', factory)).resolves.toBe('second response')
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('removes failed requests so a later call can retry', async () => {
    const error = new TypeError('Failed to fetch')
    const factory = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('recovered')

    const first = coalesceRequest('users:current', factory)
    expect(coalesceRequest('users:current', factory)).toBe(first)
    await expect(first).rejects.toBe(error)

    await expect(coalesceRequest('users:current', factory)).resolves.toBe('recovered')
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('does not combine requests with different keys', async () => {
    const factory = jest.fn().mockResolvedValue('response')

    await Promise.all([coalesceRequest('users:first', factory), coalesceRequest('users:second', factory)])

    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('turns a synchronous factory error into a rejected request and clears it', async () => {
    const error = new Error('synchronous failure')
    const factory = jest.fn().mockImplementationOnce(() => {
      throw error
    })
    factory.mockResolvedValueOnce('recovered')

    await expect(coalesceRequest('users:current', factory)).rejects.toBe(error)
    await expect(coalesceRequest('users:current', factory)).resolves.toBe('recovered')
  })
})
