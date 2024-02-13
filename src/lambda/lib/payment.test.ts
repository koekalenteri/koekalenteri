import { jsonEmptyEvent } from '../../__mockData__/emptyEvent'
import { eventWithStaticDatesAnd3Classes } from '../../__mockData__/events'

import { formatMoney, paymentDescription } from './payment'

describe('payment', () => {
  describe('formatMoney', () => {
    it.each`
      value  | expected
      ${0}   | ${'0,00\u00A0€'}
      ${0.5} | ${'0,50\u00A0€'}
      ${34}  | ${'34,00\u00A0€'}
    `('should format %p as %p', ({ value, expected }) => {
      expect(formatMoney(value)).toEqual(expected)
    })
  })
  describe('paymentDescription', () => {
    it('works correctly for single day event', () => {
      expect(paymentDescription(jsonEmptyEvent, 'fi')).toEqual('test 1.1. test test')
      expect(paymentDescription({ ...jsonEmptyEvent, name: 'event name' }, 'fi')).toEqual('test 1.1. test event name')
      expect(paymentDescription({ ...jsonEmptyEvent, eventType: 'EVENT TYPE' }, 'fi')).toEqual(
        'EVENT TYPE 1.1. test test'
      )
      expect(paymentDescription({ ...jsonEmptyEvent, location: 'LOCATION' }, 'fi')).toEqual('test 1.1. LOCATION test')
      expect(paymentDescription({ ...jsonEmptyEvent, location: '' }, 'fi')).toEqual('test 1.1. test')
      expect(paymentDescription({ ...jsonEmptyEvent, location: '', name: '' }, 'fi')).toEqual('test 1.1.')
    })

    it('works correctly for two day event', () => {
      expect(paymentDescription(eventWithStaticDatesAnd3Classes, 'fi')).toEqual('NOME-B 10.–11.2. test location test')
    })
  })
})
