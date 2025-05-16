import { getOrigin } from './api-gw'

describe('lib/api-gw', () => {
  describe('getOrigin', () => {
    it.each`
      event                | expected
      ${null}              | ${''}
      ${undefined}         | ${''}
      ${{}}                | ${''}
      ${{ headers: null }} | ${''}
    `('when event is $event, it should return "$expected"', ({ event, expected }) => {
      expect(getOrigin(event)).toEqual(expected)
    })

    it.each`
      event                                        | expected
      ${{ headers: null }}                         | ${''}
      ${{ headers: { origin: 'test' } }}           | ${'test'}
      ${{ headers: { Origin: 'test' } }}           | ${'test'}
      ${{ headers: { origin: 'a', Origin: 'b' } }} | ${'a'}
    `('when headers are $event.headers, it should return "$expected"', ({ event, expected }) => {
      expect(getOrigin(event)).toEqual(expected)
    })
  })
})
