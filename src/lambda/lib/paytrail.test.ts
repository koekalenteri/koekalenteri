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

  it('preserves the edit token in payment redirect URLs', () => {
    expect(createPaymentRedirectUrls('https://some-origin', 'edit token')).toEqual({
      cancel: 'https://some-origin/p/cancel?editToken=edit%20token',
      success: 'https://some-origin/p/success?editToken=edit%20token',
    })
  })

  it('createRefundCallbackUrls', () => {
    expect(createRefundCallbackUrls('some-host')).toEqual({
      cancel: 'https://some-host/refund/cancel',
      success: 'https://some-host/refund/success',
    })
  })
})
