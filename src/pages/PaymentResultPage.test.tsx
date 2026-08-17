import type { LoaderFunctionArgs } from 'react-router'
import { verifyPayment } from '../api/payment'
import { paymentResultLoader } from './PaymentResultPage'

jest.mock('../api/payment', () => ({
  verifyPayment: jest.fn(),
}))

jest.mock('../lib/client/error', () => ({
  reportError: jest.fn(),
}))

describe('paymentResultLoader', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('redirects to the completed registration with the verified edit token', async () => {
    jest.mocked(verifyPayment).mockResolvedValue({
      editToken: 'edit-token',
      eventId: 'event-1',
      registrationId: 'registration-1',
      status: 'ok',
    })

    const request = new Request('https://example.test/p/success?checkout-status=ok&signature=signature')
    const args: LoaderFunctionArgs = {
      context: {},
      params: {},
      pattern: '/p/success',
      request,
      url: new URL(request.url),
    }
    const response = await paymentResultLoader(args)

    expect(response.headers.get('Location')).toBe('/r/event-1/registration-1/access/edit-token/saved?payment=verifying')
  })
})
