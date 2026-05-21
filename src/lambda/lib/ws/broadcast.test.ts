import { jest } from '@jest/globals'
import { broadcast } from './broadcast'

describe('ws/broadcast', () => {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)

  afterAll(() => {
    logSpy.mockRestore()
  })

  it('sends to audience and returns counters', async () => {
    const send = jest
      .fn<any>()
      .mockResolvedValueOnce('sent')
      .mockResolvedValueOnce('gone')
      .mockResolvedValueOnce('failed')
    const onGoneConnection = jest.fn<any>().mockResolvedValue(undefined)
    const log = jest.fn<any>()

    const result = await broadcast({
      audience: async () => [{ connectionId: 'a' } as any, { connectionId: 'b' } as any, { connectionId: 'c' } as any],
      buildPayload: () => ({ type: 'test' }),
      log,
      onGoneConnection,
      send,
    })

    expect(log).toHaveBeenCalledWith({ audience: 3 })
    expect(send).toHaveBeenCalledTimes(3)
    expect(onGoneConnection).toHaveBeenCalledWith('b')
    expect(result).toEqual({ attempted: 3, failed: 1, gone: 1, sent: 1 })
  })
})
