import { jest } from '@jest/globals'
import { constructAPIGwEvent } from '../test-utils/helpers'

const { default: refundCancelLambda } = await import('./handler')

describe('refundCancelLambda', () => {
  jest.spyOn(console, 'debug').mockImplementation(() => undefined)
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should return 200 when checkout-transaction-id is missing', async () => {
    const res = await refundCancelLambda(constructAPIGwEvent('test'))

    expect(res.statusCode).toEqual(200)
    expect(logSpy).toHaveBeenCalledTimes(1)
  })
})
