import type { LoaderFunctionArgs } from 'react-router'
import { enqueueSnackbar } from 'notistack'
import { verifyPayment } from '../api/payment'
import { paymentResultLoader } from './PaymentResultPage'

vi.mock('../api/payment', () => ({
  verifyPayment: vi.fn(),
}))

vi.mock('../lib/client/error', () => ({
  reportError: vi.fn(),
}))

vi.mock('notistack', () => ({
  enqueueSnackbar: vi.fn(),
}))

describe('paymentResultLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to the completed registration with the verified edit token', async () => {
    vi.mocked(verifyPayment).mockResolvedValue({
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

  it('uses the edit token in the return URL when verification cannot return one', async () => {
    vi.mocked(verifyPayment).mockResolvedValue({
      eventId: 'event-1',
      registrationId: 'registration-1',
      status: 'error',
    })

    const request = new Request('https://example.test/p/cancel?checkout-status=fail&editToken=return-token')
    const args: LoaderFunctionArgs = {
      context: {},
      params: {},
      pattern: '/p/cancel',
      request,
      url: new URL(request.url),
    }
    const response = await paymentResultLoader(args)

    expect(response.headers.get('Location')).toBe('/p/event-1/registration-1/access/return-token')
  })

  it('shows payment verification after a successful callback even when verification returns an error', async () => {
    vi.mocked(verifyPayment).mockResolvedValue({
      eventId: 'event-1',
      registrationId: 'registration-1',
      status: 'error',
    })

    const request = new Request('https://example.test/p/success?checkout-status=ok&editToken=return-token')
    const args: LoaderFunctionArgs = {
      context: {},
      params: {},
      pattern: '/p/success',
      request,
      url: new URL(request.url),
    }
    const response = await paymentResultLoader(args)

    expect(response.headers.get('Location')).toBe(
      '/r/event-1/registration-1/access/return-token/saved?payment=verifying'
    )
    expect(enqueueSnackbar).not.toHaveBeenCalled()
  })

  // `checkout-status` is unverified input when the signature is refused: it says nothing (KOE-1484).
  it.each(['ok', 'fail'])(
    'offers the payment again with a notice when the return is refused and says %s',
    async (checkoutStatus) => {
      vi.mocked(verifyPayment).mockResolvedValue({
        eventId: 'event-1',
        paymentStatus: checkoutStatus === 'ok' ? 'ok' : 'fail',
        registrationId: 'registration-1',
        status: 'refused',
      })

      const request = new Request(
        `https://example.test/p/success?checkout-status=${checkoutStatus}&editToken=return-token`
      )
      const args: LoaderFunctionArgs = {
        context: {},
        params: {},
        pattern: '/p/success',
        request,
        url: new URL(request.url),
      }
      const response = await paymentResultLoader(args)

      expect(response.headers.get('Location')).toBe('/p/event-1/registration-1/access/return-token')
      expect(enqueueSnackbar).toHaveBeenCalledTimes(1)
      expect(enqueueSnackbar).toHaveBeenCalledWith(
        'Maksua ei voitu vahvistaa. Yritä maksaa uudelleen tai ota yhteyttä koesihteeriin, jos maksu on jo veloitettu.',
        { variant: 'error' }
      )
    }
  )
})
