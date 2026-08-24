import * as encryptedStoreLib from '../../../lib/client/encryptedStore'
import * as envLib from '../../../lib/env'
import * as versionLib from '../../../lib/version'
import { cleanPre112, migrateDogCacheOwners, runCleaners } from './cleaners'

describe('storage cleaners', () => {
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

  describe('migrateDogCacheOwners', () => {
    it('migrates a single-person owner entry to the owners list format', () => {
      localStorage.setItem(
        'dog-cache',
        JSON.stringify({
          'FI12345/20': {
            dog: { regNo: 'FI12345/20' },
            owner: {
              email: 'owner@example.com',
              membership: { orgId: true },
              name: 'Old Owner',
              ownerHandles: true,
              ownerPays: false,
              phone: '+358401234567',
            },
          },
        })
      )
      vi.spyOn(console, 'log').mockImplementation(() => undefined)

      migrateDogCacheOwners()

      const cache = JSON.parse(localStorage.getItem('dog-cache') ?? '{}')
      expect(cache['FI12345/20'].dog).toEqual({ regNo: 'FI12345/20' })
      expect(cache['FI12345/20'].owner).toEqual({
        ownerHandles: true,
        ownerPays: false,
        owners: [
          {
            email: 'owner@example.com',
            key: 'owner-1',
            membership: { orgId: true },
            name: 'Old Owner',
            phone: '+358401234567',
          },
        ],
      })
    })

    it('keeps entries already in the owners list format untouched', () => {
      const entry = {
        owner: { ownerHandles: true, owners: [{ key: 'owner-1', membership: {}, name: 'New Owner' }] },
      }
      localStorage.setItem('dog-cache', JSON.stringify({ 'FI12345/20': entry }))
      vi.spyOn(console, 'log').mockImplementation(() => undefined)

      migrateDogCacheOwners()

      expect(JSON.parse(localStorage.getItem('dog-cache') ?? '{}')).toEqual({ 'FI12345/20': entry })
    })

    it('does nothing without a cache', () => {
      const setSpy = vi.spyOn(localStorage, 'setItem')

      migrateDogCacheOwners()

      expect(setSpy).not.toHaveBeenCalled()
    })

    it('removes an unparseable cache', () => {
      localStorage.setItem('dog-cache', 'not json')
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)

      migrateDogCacheOwners()

      expect(localStorage.getItem('dog-cache')).toBeNull()
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
      expect(getSpy).toHaveBeenCalledWith('dog-cache')
      expect(getSpy).toHaveBeenCalledTimes(2)
      expect(setSpy).toHaveBeenCalledWith('version', versionLib.appVersion)
      expect(setSpy).toHaveBeenCalledTimes(1)
      expect(localStorage.getItem('registration/ids__123')).toBeNull()
    })

    it('migrates the dog cache for a user coming from the previous release', () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined)
      vi.spyOn(envLib, 'isTestEnv').mockReturnValueOnce(false)
      vi.spyOn(encryptedStoreLib, 'clearEncryptedStore').mockResolvedValue(undefined)
      // The owners migration ships in 1.10.7, so a user still on 1.10.6 must receive it. This
      // fails if the app version is not bumped past the cleaner's threshold before release.
      localStorage.setItem('version', '1.10.6')
      localStorage.setItem('dog-cache', JSON.stringify({ REG1: { owner: { name: 'Owner', ownerHandles: true } } }))

      runCleaners()

      const cache = JSON.parse(localStorage.getItem('dog-cache') ?? '{}')
      expect(cache.REG1.owner.owners).toEqual([{ key: 'owner-1', membership: {}, name: 'Owner' }])
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
