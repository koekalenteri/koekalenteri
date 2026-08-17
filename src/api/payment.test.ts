import fetchMock from 'jest-fetch-mock'
import mockResponse from './__mocks__/paymentCreate.response.json'
import { createPayment } from './payment'

fetchMock.enableMocks()

describe('payment', () => {
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    fetchMock.resetMocks()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('paymentCreate', () => {
    it('should not modify the response returned from backend', async () => {
      fetchMock.mockResponse((req) =>
        req.method === 'POST'
          ? Promise.resolve(JSON.stringify(mockResponse))
          : Promise.reject(new Error(`${req.method} !== 'POST'`))
      )

      const res = await createPayment('test', 'test')

      expect(res).toEqual({ response: mockResponse, status: 200 })
    })

    it('should authorize payment creation with the registration edit token', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockResponse))

      await createPayment('event-id', 'registration-id', 'edit-token')

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/payment/create'),
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer edit-token' }) })
      )
    })

    it('should preserve payment error message from backend', async () => {
      fetchMock.mockResponse(
        JSON.stringify({
          error: JSON.stringify({ message: 'Paytrail provider rejected payment', status: 'error' }),
          message: 'Maksun luonti epäonnistui Paytrailissa (400): Paytrail provider rejected payment',
        }),
        { status: 400 }
      )

      const res = await createPayment('test', 'test')

      expect(res).toEqual({
        errorMessage: 'Maksun luonti epäonnistui Paytrailissa (400): Paytrail provider rejected payment',
        response: undefined,
        status: 400,
      })
    })
  })
})
