import { getProviderName, PROVIDER_NAMES } from './payment'

describe('payment', () => {
  describe('getProviderName', () => {
    it.each(Object.entries(PROVIDER_NAMES))('should return provider name from map', (id, name) => {
      expect(getProviderName(id)).toEqual(name)
    })

    it('should fallback to capitalizing name', () => {
      expect(getProviderName('test')).toEqual('Test')
    })
  })
})
