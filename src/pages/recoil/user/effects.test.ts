import * as envLib from '../../../lib/env'
import { idTokenLogEffect, stringToLang } from './effects'

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

  it('logs id token changes without exposing either token', () => {
    let callback: (next: string, previous: string, reset: boolean) => void = () => undefined
    const onSet = jest.fn((value) => {
      callback = value
    })
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined)
    jest.spyOn(envLib, 'isDevEnv').mockReturnValue(true)
    idTokenLogEffect({ onSet } as never)
    expect(onSet).toHaveBeenCalledWith(expect.any(Function))

    callback('new-token', 'old-token', false)

    expect(debugSpy).toHaveBeenCalledWith('auth: id token changed', {
      next: expect.objectContaining({ fingerprint: expect.any(String) }),
      previous: expect.objectContaining({ fingerprint: expect.any(String) }),
      reset: false,
    })
    expect(debugSpy).toHaveBeenCalledWith(
      'auth: id token changed',
      expect.not.objectContaining({ next: 'new-token', previous: 'old-token' })
    )
  })
})
