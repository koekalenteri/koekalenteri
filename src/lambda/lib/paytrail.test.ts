import { createPaymentCallbackUrls, createPaymentRedirectUrls, createRefundCallbackUrls } from './paytrail'

describe('paytrail', () => {
  it('createPaymentCallbackUrls', () => {
    expect(createPaymentCallbackUrls('some-host')).toEqual({
      cancel: 'https://some-host/payment/cancel',
      success: 'https://some-host/payment/success',
    })
  })

  it('createPaymentRedirectUrls', () => {
    expect(createPaymentRedirectUrls('https://some-origin')).toEqual({
      cancel: 'https://some-origin/p/cancel',
      success: 'https://some-origin/p/success',
    })
  })

  it('createRefundCallbackUrls', () => {
    expect(createRefundCallbackUrls('some-host')).toEqual({
      cancel: 'https://some-host/refund/cancel',
      success: 'https://some-host/refund/success',
    })
  })
})
