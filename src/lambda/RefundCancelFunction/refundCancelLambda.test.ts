import { vi } from 'vitest'
import { constructAPIGwEvent } from '../test-utils/helpers'

const { default: refundCancelLambda } = await import('./handler')

describe('refundCancelLambda', () => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should return 200 when checkout-transaction-id is missing', async () => {
    const res = await refundCancelLambda(constructAPIGwEvent('test'))

    expect(res.statusCode).toEqual(200)
    expect(logSpy).toHaveBeenCalledTimes(1)
  })
})
