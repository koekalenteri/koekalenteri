import { vi } from 'vitest'
import { loggedLines } from '../../test-utils/logs'
import { bestEffort } from './livePush'

describe('ws/livePush bestEffort (KOE-1583)', () => {
  it('runs the push and logs nothing when it goes through', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const push = vi.fn().mockResolvedValue({ sent: 1 })

    await expect(bestEffort('registration patches', push)).resolves.toBeUndefined()

    expect(push).toHaveBeenCalledTimes(1)
    expect(loggedLines(errorSpy)).toEqual([])
    errorSpy.mockRestore()
  })

  it.each([
    ['rejects', () => Promise.reject(new Error('scan failed'))],
    [
      'throws before its first await',
      () => {
        throw new Error('scan failed')
      },
    ],
  ])('logs a push that %s under its name, and resolves', async (_how, push) => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(bestEffort('registration patches', push)).resolves.toBeUndefined()

    expect(loggedLines(errorSpy)).toEqual([
      expect.objectContaining({
        error: expect.objectContaining({ message: 'scan failed' }),
        message: 'live push failed',
        publication: 'registration patches',
      }),
    ])
    errorSpy.mockRestore()
  })
})
