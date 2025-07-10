import type { RecoilState } from 'recoil'

import * as utilsLib from '../../../lib/utils'

import { getStorageEffect, parseStorageJSON } from './storage'

describe('storage', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('parseStorageJSON', () => {
    it('should return undefined for null', () => {
      expect(parseStorageJSON(null)).toBeUndefined()
    })
    it('should return null for "null"', () => {
      expect(parseStorageJSON('null')).toBeNull()
    })
    it('should return undefined if parseJSON throws', () => {
      const theError = new Error('test error')
      const warnSpy = jest.spyOn(console, 'warn').mockImplementationOnce(() => undefined)
      jest.spyOn(utilsLib, 'parseJSON').mockImplementationOnce(() => {
        throw theError
      })
      expect(parseStorageJSON('{}')).toBeUndefined()
      expect(warnSpy).toHaveBeenCalledWith('JSON parse error', theError)
      expect(warnSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('getStorageEffect', () => {
    const mockStorage: jest.Mocked<Storage> = {
      length: 0,
      clear: jest.fn(),
      getItem: jest.fn<string | null, [string]>(),
      key: jest.fn<string | null, [number]>(),
      removeItem: jest.fn<void, [string]>(),
      setItem: jest.fn<void, [string, string]>(),
    }
    const node: RecoilState<any> = {
      __tag: ['test'],
      __cTag: function (): void {
        throw new Error('Function not implemented.')
      },
      key: 'test-key',
      toJSON: function (): { key: string } {
        throw new Error('Function not implemented.')
      },
    }

    let onSetCallback: ((newValue: any, oldValue: any, reset: boolean) => void) | undefined

    const onSet = (param: (newValue: any, oldValue: any, reset: boolean) => void) => {
      onSetCallback = param
    }
    const setSelf = jest.fn()
    const resetSelf = jest.fn<void, []>()
    const effect = getStorageEffect(mockStorage)

    it('should initialize from storage', () => {
      const testValue = 'test value'
      mockStorage.getItem.mockReturnValueOnce(JSON.stringify(testValue))

      // @ts-expect-error providing only used properties
      effect({ node, setSelf, onSet, trigger: 'get', resetSelf })
      expect(mockStorage.getItem).toHaveBeenCalledWith(node.key)
      expect(mockStorage.getItem).toHaveBeenCalledTimes(1)
      expect(setSelf).toHaveBeenCalledWith(testValue)
    })

    it('should ignore null value from storage on initialization', () => {
      mockStorage.getItem.mockReturnValueOnce(null)

      // @ts-expect-error providing only used properties
      effect({ node, setSelf, onSet, trigger: 'get', resetSelf })
      expect(mockStorage.getItem).toHaveBeenCalledWith(node.key)
      expect(mockStorage.getItem).toHaveBeenCalledTimes(1)
      expect(setSelf).not.toHaveBeenCalled()
    })

    it('should set to storage', () => {
      // @ts-expect-error providing only used properties
      effect({ node, setSelf, onSet, trigger: 'set', resetSelf })
      expect(mockStorage.getItem).not.toHaveBeenCalled()

      onSetCallback?.('new value', 'old value', false)
      expect(mockStorage.setItem).toHaveBeenCalledWith(node.key, JSON.stringify('new value'))
    })

    it.each([null, undefined])('should remove from storage, when set to %p', (value) => {
      // @ts-expect-error providing only used properties
      effect({ node, setSelf, onSet, trigger: 'set', resetSelf })
      expect(mockStorage.getItem).not.toHaveBeenCalled()

      onSetCallback?.(value, 'old value', false)
      expect(mockStorage.removeItem).toHaveBeenCalledWith(node.key)
    })

    it('should remove from storage when reset', () => {
      // @ts-expect-error providing only used properties
      effect({ node, setSelf, onSet, trigger: 'set', resetSelf })
      expect(mockStorage.getItem).not.toHaveBeenCalled()

      onSetCallback?.('new value', 'old value', true)
      expect(mockStorage.removeItem).toHaveBeenCalledWith(node.key)
    })

    it('should not set velue when windows in not visible', () => {
      const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined)
      jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
      // @ts-expect-error providing only used properties
      effect({ node, setSelf, onSet, trigger: 'set', resetSelf })
      expect(mockStorage.getItem).not.toHaveBeenCalled()

      onSetCallback?.('new value', 'old value', false)
      expect(mockStorage.setItem).not.toHaveBeenCalled()
      expect(mockStorage.removeItem).not.toHaveBeenCalled()
      expect(infoSpy).toHaveBeenCalledWith('Preventing change from invisible window to storage. Key: test-key')
      expect(infoSpy).toHaveBeenCalledTimes(1)
    })

    it('should hook to storage event', () => {
      let handler: ((e: StorageEvent) => void) | undefined
      const addSpy = jest.spyOn(window, 'addEventListener').mockImplementationOnce((type, listener) => {
        if (type === 'storage') handler = listener as typeof handler
      })
      const removeSpy = jest.spyOn(window, 'removeEventListener').mockImplementationOnce(() => undefined)

      // @ts-expect-error providing only used properties
      const cleanUp = effect({ node, setSelf, onSet, trigger: 'get', resetSelf })
      expect(addSpy).toHaveBeenCalledWith('storage', expect.any(Function))
      expect(addSpy).toHaveBeenCalledTimes(1)

      expect(removeSpy).not.toHaveBeenCalled()

      setSelf.mockClear()

      // ignore event to another storage
      // @ts-expect-error providing only used properties
      handler?.({ storageArea: localStorage, key: node.key, newValue: '{ "key": "value" }' })
      expect(setSelf).not.toHaveBeenCalled()
      expect(resetSelf).not.toHaveBeenCalled()

      // set value
      // @ts-expect-error providing only used properties
      handler?.({ storageArea: mockStorage, key: node.key, newValue: '{ "key": "value" }' })
      expect(setSelf).toHaveBeenCalledWith({ key: 'value' })
      expect(resetSelf).not.toHaveBeenCalled()

      // set null
      setSelf.mockClear()
      // @ts-expect-error providing only used properties
      handler?.({ storageArea: mockStorage, key: node.key, newValue: null })
      expect(setSelf).not.toHaveBeenCalled()
      expect(resetSelf).toHaveBeenCalledTimes(1)

      // set undefined
      // @ts-expect-error providing only used properties
      handler?.({ storageArea: mockStorage, key: node.key, newValue: undefined })
      expect(resetSelf).toHaveBeenCalledTimes(2)

      // set invalid json
      // suppress console warn once
      jest.spyOn(console, 'warn').mockImplementationOnce(() => undefined)
      // @ts-expect-error providing only used properties
      handler?.({ storageArea: mockStorage, key: node.key, newValue: 'invalid json' })
      expect(resetSelf).toHaveBeenCalledTimes(3)

      // cleanup
      cleanUp?.()
      expect(removeSpy).toHaveBeenCalledWith('storage', expect.any(Function))
      expect(removeSpy).toHaveBeenCalledTimes(1)
    })
  })
})
