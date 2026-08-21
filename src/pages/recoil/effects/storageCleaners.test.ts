import * as encryptedStoreLib from '../../../lib/client/encryptedStore'
import * as envLib from '../../../lib/env'
import * as versionLib from '../../../lib/version'
import { cleanPre112, runCleaners } from './storageCleaners'

describe('storageCleaners', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('cleanPre112', () => {
    it('should cleanup moved keys', () => {
      const testKeys = ['registration/ids__123', 'registration/ids__asdf']
      testKeys.forEach((key) => {
        localStorage.setItem(key, 'test')
      })
      localStorage.setItem('retained-key', 'test')
      const removeSpy = vi.spyOn(localStorage, 'removeItem')
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

      cleanPre112()
      expect(removeSpy).toHaveBeenCalledTimes(testKeys.length)
      expect(localStorage.getItem('registration/ids__123')).toBeNull()
      expect(localStorage.getItem('registration/ids__asdf')).toBeNull()
      expect(localStorage.getItem('retained-key')).toBe('test')
      expect(logSpy).toHaveBeenCalledWith('Cleaned up 2 storage keys deprecated in version 1.1.2')
      expect(logSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('runCleaners', () => {
    it('should do nothing in test env', () => {
      const getSpy = vi.spyOn(localStorage, 'getItem')
      runCleaners()
      expect(getSpy).not.toHaveBeenCalled()
    })

    it('should do nothing if version equals', () => {
      vi.spyOn(envLib, 'isTestEnv').mockReturnValueOnce(false)
      localStorage.setItem('version', versionLib.appVersion)
      const getSpy = vi.spyOn(localStorage, 'getItem')
      const setSpy = vi.spyOn(localStorage, 'setItem')
      getSpy.mockClear()
      setSpy.mockClear()
      runCleaners()
      expect(getSpy).toHaveBeenCalledWith('version')
      expect(getSpy).toHaveBeenCalledTimes(1)
      expect(setSpy).not.toHaveBeenCalled()
    })

    it('should set the version but not run any already run cleaners', () => {
      vi.spyOn(envLib, 'isTestEnv').mockReturnValueOnce(false)
      localStorage.setItem('version', '9.9.9')
      const getSpy = vi.spyOn(localStorage, 'getItem')
      const setSpy = vi.spyOn(localStorage, 'setItem')
      getSpy.mockClear()
      setSpy.mockClear()
      runCleaners()
      expect(getSpy).toHaveBeenCalledWith('version')
      expect(getSpy).toHaveBeenCalledTimes(1)
      expect(setSpy).toHaveBeenCalledWith('version', versionLib.appVersion)
      expect(setSpy).toHaveBeenCalledTimes(1)
    })

    it('should also run any cleaners', () => {
      localStorage.setItem('registration/ids__123', 'test')
      vi.spyOn(console, 'log').mockImplementation(() => undefined)
      vi.spyOn(envLib, 'isTestEnv').mockReturnValueOnce(false)
      vi.spyOn(encryptedStoreLib, 'clearEncryptedStore').mockResolvedValue(undefined)
      const getSpy = vi.spyOn(localStorage, 'getItem')
      const setSpy = vi.spyOn(localStorage, 'setItem')
      getSpy.mockClear()
      setSpy.mockClear()
      runCleaners()
      expect(getSpy).toHaveBeenCalledWith('version')
      expect(getSpy).toHaveBeenCalledTimes(1)
      expect(setSpy).toHaveBeenCalledWith('version', versionLib.appVersion)
      expect(setSpy).toHaveBeenCalledTimes(1)
      expect(localStorage.getItem('registration/ids__123')).toBeNull()
    })

    it('should not wipe the encrypted store when the previous version is not earlier than the cache threshold', () => {
      vi.spyOn(envLib, 'isTestEnv').mockReturnValueOnce(false)
      const clearSpy = vi.spyOn(encryptedStoreLib, 'clearEncryptedStore').mockResolvedValue(undefined)
      const previousVersion = '9.9.9'
      localStorage.setItem('version', previousVersion)
      runCleaners()
      expect(localStorage.getItem('version')).toBe(versionLib.appVersion)
      expect(clearSpy).not.toHaveBeenCalled()
    })

    it('should wipe the encrypted store when upgrading from an earlier version', () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined)
      vi.spyOn(envLib, 'isTestEnv').mockReturnValueOnce(false)
      const clearSpy = vi.spyOn(encryptedStoreLib, 'clearEncryptedStore').mockResolvedValue(undefined)
      localStorage.setItem('version', '1.8.0')
      runCleaners()
      expect(clearSpy).toHaveBeenCalled()
    })
  })
})
