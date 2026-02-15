import { jsonEmptyEvent } from '../../__mockData__/emptyEvent'
import { eventWithStaticDatesAnd3Classes } from '../../__mockData__/events'
import { paymentDescription } from './payment'

describe('payment', () => {
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
