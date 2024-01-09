import fetchMock from 'jest-fetch-mock'

import mockResponse from './__mocks__/paymentCreate.response.json'
import { createPayment } from './payment'

fetchMock.enableMocks()

describe('payment', () => {
  beforeEach(() => {
    fetchMock.resetMocks()
  })

  describe('paymentCreate', () => {
    it('should not modify the response returned from backend', async () => {
      fetchMock.mockResponse((req) =>
        req.method === 'POST'
          ? Promise.resolve(JSON.stringify(mockResponse))
          : Promise.reject(new Error(`${req.method} !== 'POST'`))
      )

      const res = await createPayment('test', 'test')

      expect(res).toEqual(mockResponse)
    })
  })
})
