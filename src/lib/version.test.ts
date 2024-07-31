import { isEarlierVersionThan } from './version'

describe('version', () => {
  describe('isEarlierVersionThan', () => {
    it('should return false anything earlier than 1.1.1', () => {
      expect(isEarlierVersionThan('1.1.1')).toEqual(false)
      expect(isEarlierVersionThan('1.1.0')).toEqual(false)
      expect(isEarlierVersionThan('1.1')).toEqual(false)
      expect(isEarlierVersionThan('1.0')).toEqual(false)
      expect(isEarlierVersionThan('1')).toEqual(false)
    })
    it.each`
      compare          | actual           | result
      ${'1.0.0'}       | ${'1.0.0'}       | ${false}
      ${'1.9.1-beta'}  | ${'1.9.1'}       | ${false}
      ${'1.9.1-beta'}  | ${'1.9.1-beta'}  | ${false}
      ${'1.9.1-alpha'} | ${'1.9.1-beta'}  | ${false}
      ${'1.1.9'}       | ${'1.2.0'}       | ${false}
      ${'1.0.1'}       | ${'1.0.0'}       | ${true}
      ${'1.1.2'}       | ${'1.1.1'}       | ${true}
      ${'1.1'}         | ${'1.0.0'}       | ${true}
      ${'1.10'}        | ${'1.9.0'}       | ${true}
      ${'1.10'}        | ${'1.9.100'}     | ${true}
      ${'1.10.100'}    | ${'1.9.0'}       | ${true}
      ${'1.9.0'}       | ${'1.9.0-beta'}  | ${true}
      ${'1.9.1'}       | ${'1.9.0-beta'}  | ${true}
      ${'1.1.2-beta'}  | ${'1.1.2-alpha'} | ${true}
    `('should return $result when comparing $compare to $actual', ({ compare, actual, result }) => {
      expect(isEarlierVersionThan(compare, actual)).toEqual(result)
    })
  })
})
