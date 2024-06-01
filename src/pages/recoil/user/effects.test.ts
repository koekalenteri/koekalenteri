import { stringToLang } from './effects'

describe('user/effects', () => {
  describe('stringToLang', () => {
    it('should default to fi', () => {
      expect(stringToLang()).toEqual('fi')
      expect(stringToLang(null)).toEqual('fi')
      expect(stringToLang('nonsense')).toEqual('fi')
    })

    it('should accept valid values', () => {
      expect(stringToLang('fi')).toEqual('fi')
      expect(stringToLang('en')).toEqual('en')
    })
  })
})
