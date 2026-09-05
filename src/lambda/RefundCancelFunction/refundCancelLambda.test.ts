import { vi } from 'vitest'
import { constructAPIGwEvent } from '../test-utils/helpers'
import { loggedLines } from '../test-utils/logs'

const { default: refundCancelLambda } = await import('./handler')

describe('refundCancelLambda', () => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should return 200 when checkout-transaction-id is missing', async () => {
    const res = await refundCancelLambda(constructAPIGwEvent('test'))

    expect(res.statusCode).toEqual(200)
    expect(loggedLines(infoSpy)).toContainEqual(
      expect.objectContaining({
        message:
          'request did not contain transaction-id, this happens when transaction was not actually created, ignoring request',
      })
    )
  })
})
