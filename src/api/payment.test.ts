import fetchMock from '../test-utils/fetchMock'
import mockResponse from './__mocks__/paymentCreate.response.json'
import { createPayment } from './payment'

fetchMock.enableMocks()

describe('payment', () => {
  let consoleErrorSpy: import('vitest').MockInstance

  beforeEach(() => {
    fetchMock.resetMocks()
    fetchMock.enableMocks()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
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

    it('should use the logged-in route with the id token and the edit token in its own header', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockResponse))

      await createPayment('event-id', 'registration-id', 'edit-token', 'id-token')

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/user/payment/create'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer id-token', 'X-Registration-Token': 'edit-token' }),
        })
      )
    })

    it('should fall back to the public route when the id token is refused', async () => {
      fetchMock.mockResponseOnce('', { status: 401 })
      fetchMock.mockResponseOnce(JSON.stringify(mockResponse))

      const res = await createPayment('event-id', 'registration-id', 'edit-token', 'id-token')

      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining('/payment/create'),
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer edit-token' }) })
      )
      expect(res).toEqual({ response: mockResponse, status: 200 })
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
