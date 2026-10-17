import type { PaymentPictureStatus } from '../../types'
import fi from '../../i18n/locales/fi/translation.json'
import { isPaidPaymentStatus, PAYMENT_STATUS_KEY } from './paymentStatus'

describe('paymentStatus', () => {
  it.each<[PaymentPictureStatus, boolean]>([
    ['paid', true],
    ['overpaid', true],
    ['partial', true],
    ['refunded', false],
    ['unpaid', false],
    ['inProgress', false],
    ['duplicate', false],
    ['notCharged', false],
    ['waitingForPlace', false],
  ])('reads %s as paid: %s', (status, expected) => {
    expect(isPaidPaymentStatus(status)).toBe(expected)
  })

  it.each(Object.entries(PAYMENT_STATUS_KEY))('says %s in words the participant has', (_status, key) => {
    const [, name] = key.split('.')
    expect(Object.keys(fi.paymentStatus)).toContain(name)
  })
})
