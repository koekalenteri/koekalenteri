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
    const onSet = jest.fn()
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined)
    jest.spyOn(envLib, 'isDevEnv').mockReturnValue(true)
    idTokenLogEffect({ onSet } as never)
    const callback = onSet.mock.calls[0][0]

    callback('new-token', 'old-token', false)

    expect(debugSpy).toHaveBeenCalledWith('auth: id token changed', {
      next: expect.objectContaining({ fingerprint: expect.any(String) }),
      previous: expect.objectContaining({ fingerprint: expect.any(String) }),
      reset: false,
    })
    expect(JSON.stringify(debugSpy.mock.calls.at(-1))).not.toContain('new-token')
    expect(JSON.stringify(debugSpy.mock.calls.at(-1))).not.toContain('old-token')
  })
})
