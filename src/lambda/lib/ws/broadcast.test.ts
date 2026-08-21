import { vi } from 'vitest'
import { broadcast } from './broadcast'

describe('ws/broadcast', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

  afterAll(() => {
    logSpy.mockRestore()
  })

  it('sends to audience and returns counters', async () => {
    const send = vi.fn().mockResolvedValueOnce('sent').mockResolvedValueOnce('gone').mockResolvedValueOnce('failed')
    const onGoneConnection = vi.fn().mockResolvedValue(undefined)
    const log = vi.fn()

    const result = await broadcast({
      audience: async () => [{ connectionId: 'a' } as any, { connectionId: 'b' } as any, { connectionId: 'c' } as any],
      buildPayload: (_audience, recipient) => ({ recipientId: recipient.connectionId, type: 'test' }),
      log,
      onGoneConnection,
      send,
    })

    expect(log).toHaveBeenCalledWith({ audience: 3 })
    expect(send).toHaveBeenCalledTimes(3)
    expect(send).toHaveBeenNthCalledWith(1, 'a', Buffer.from(JSON.stringify({ recipientId: 'a', type: 'test' })))
    expect(onGoneConnection).toHaveBeenCalledWith('b')
    expect(result).toEqual({ attempted: 3, failed: 1, gone: 1, sent: 1 })
  })

  it('builds payload separately for each recipient', async () => {
    const send = vi.fn().mockResolvedValue('sent')
    const buildPayload = vi.fn((audience: Array<{ connectionId: string }>, recipient: { connectionId: string }) => ({
      audience: audience.map((connection) => connection.connectionId),
      recipient: recipient.connectionId,
    }))

    await broadcast({
      audience: async () => [{ connectionId: 'a' } as any, { connectionId: 'b' } as any],
      buildPayload,
      send,
    })

    expect(buildPayload).toHaveBeenNthCalledWith(1, [{ connectionId: 'a' }, { connectionId: 'b' }], {
      connectionId: 'a',
    })
    expect(buildPayload).toHaveBeenNthCalledWith(2, [{ connectionId: 'a' }, { connectionId: 'b' }], {
      connectionId: 'b',
    })
    expect(send).toHaveBeenNthCalledWith(1, 'a', Buffer.from(JSON.stringify({ audience: ['a', 'b'], recipient: 'a' })))
    expect(send).toHaveBeenNthCalledWith(2, 'b', Buffer.from(JSON.stringify({ audience: ['a', 'b'], recipient: 'b' })))
  })

  it('limits broadcast concurrency', async () => {
    let active = 0
    let maxActive = 0
    const send = vi.fn(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await Promise.resolve()
      active -= 1
      return 'sent' as const
    })

    const result = await broadcast({
      audience: async () => Array.from({ length: 5 }, (_, index) => ({ connectionId: `connection-${index}` }) as any),
      buildPayload: () => ({ type: 'test' }),
      concurrency: 2,
      send,
    })

    expect(send).toHaveBeenCalledTimes(5)
    expect(maxActive).toBe(2)
    expect(result).toEqual({ attempted: 5, failed: 0, gone: 0, sent: 5 })
  })

  it('counts unexpected send rejections as failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const result = await broadcast({
      audience: async () => [{ connectionId: 'a' } as any],
      buildPayload: () => ({ type: 'test' }),
      send: vi.fn().mockRejectedValue(new Error('network failure')),
    })

    expect(result).toEqual({ attempted: 1, failed: 1, gone: 0, sent: 0 })
    errorSpy.mockRestore()
  })
})
