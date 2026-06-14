import * as encryptedStoreLib from '../../../lib/client/encryptedStore'
import * as storageLib from '../../../lib/client/storage'
import * as envLib from '../../../lib/env'
import * as versionLib from '../../../lib/version'
import { cleanPre112, runCleaners } from './storageCleaners'

describe('storageCleaners', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('cleanPre112', () => {
    it('should cleanup moved keys', () => {
      const testKeys = ['registration/ids__123', 'registration/ids__asdf']
      const removeSpy = jest.spyOn(Storage.prototype, 'removeItem')
      const keysSpy = jest.spyOn(storageLib, 'getStorageKeysStartingWith').mockReturnValueOnce(testKeys)
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)

      cleanPre112()
      expect(keysSpy).toHaveBeenCalledWith([
        'adminEvents',
        'adminOrganizers',
        'adminUsers',
        'editableAdminEventRegistration/eventId+Id__',
        'editableEmailTemplate/Id',
        'editableEvent/Id__',
        'editableRegistration/ids__',
        'emailTemplates',
        'emailTemplates',
        'eventTypes',
        'judges',
        'newRegistration',
        'officials',
        'open/eventId__',
        'registration/ids__',
      ])
      expect(removeSpy).toHaveBeenCalledTimes(testKeys.length)
      expect(logSpy).toHaveBeenCalledWith('Cleaned up 2 storage keys deprecated in version 1.1.2')
      expect(logSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('runCleaners', () => {
    const getSpy = jest.spyOn(Storage.prototype, 'getItem')
    const setSpy = jest.spyOn(Storage.prototype, 'setItem')
    it('should do nothing in test env', () => {
      runCleaners()
      expect(getSpy).not.toHaveBeenCalled()
    })

    it('should do nothing if version equals', () => {
      jest.spyOn(envLib, 'isTestEnv').mockReturnValueOnce(false)
      getSpy.mockReturnValueOnce(versionLib.appVersion)
      runCleaners()
      expect(getSpy).toHaveBeenCalledWith('version')
      expect(getSpy).toHaveBeenCalledTimes(1)
      expect(setSpy).not.toHaveBeenCalled()
    })

    it('should set the version but not run any already run cleaners', () => {
      jest.spyOn(envLib, 'isTestEnv').mockReturnValueOnce(false)
      jest.spyOn(versionLib, 'isEarlierVersionThan').mockReturnValue(false)
      getSpy.mockReturnValueOnce(null)
      runCleaners()
      expect(getSpy).toHaveBeenCalledWith('version')
      expect(getSpy).toHaveBeenCalledTimes(1)
      expect(setSpy).toHaveBeenCalledWith('version', versionLib.appVersion)
      expect(setSpy).toHaveBeenCalledTimes(1)
    })

    it('should also run any cleaners', () => {
      jest.spyOn(console, 'log').mockImplementation(() => undefined)
      jest.spyOn(storageLib, 'getStorageKeysStartingWith').mockReturnValue([])
      jest.spyOn(envLib, 'isTestEnv').mockReturnValueOnce(false)
      jest.spyOn(versionLib, 'isEarlierVersionThan').mockReturnValue(true)
      jest.spyOn(encryptedStoreLib, 'clearEncryptedStore').mockResolvedValue(undefined)
      getSpy.mockReturnValueOnce(null)
      runCleaners()
      expect(getSpy).toHaveBeenCalledWith('version')
      expect(getSpy).toHaveBeenCalledTimes(1)
      expect(setSpy).toHaveBeenCalledWith('version', versionLib.appVersion)
      expect(setSpy).toHaveBeenCalledTimes(1)
    })

    it('should not wipe the encrypted store when the previous version is not earlier than the cache threshold', () => {
      jest.spyOn(envLib, 'isTestEnv').mockReturnValueOnce(false)
      const isEarlierSpy = jest.spyOn(versionLib, 'isEarlierVersionThan').mockReturnValue(false)
      const clearSpy = jest.spyOn(encryptedStoreLib, 'clearEncryptedStore').mockResolvedValue(undefined)
      getSpy.mockReturnValueOnce('1.9.1')
      runCleaners()
      expect(isEarlierSpy).toHaveBeenCalledWith('1.9.0', '1.9.1')
      expect(clearSpy).not.toHaveBeenCalled()
    })

    it('should wipe the encrypted store when upgrading from an earlier version', () => {
      jest.spyOn(console, 'log').mockImplementation(() => undefined)
      jest.spyOn(storageLib, 'getStorageKeysStartingWith').mockReturnValue([])
      jest.spyOn(envLib, 'isTestEnv').mockReturnValueOnce(false)
      jest.spyOn(versionLib, 'isEarlierVersionThan').mockReturnValue(true)
      const clearSpy = jest.spyOn(encryptedStoreLib, 'clearEncryptedStore').mockResolvedValue(undefined)
      getSpy.mockReturnValueOnce('1.8.0')
      runCleaners()
      expect(clearSpy).toHaveBeenCalled()
    })
  })
})
