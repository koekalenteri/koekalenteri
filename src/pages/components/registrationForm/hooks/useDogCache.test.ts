import type { DogCache } from '../../../recoil/dog'
import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { RecoilRoot } from 'recoil'
import { filterInvalid, useDogCache } from './useDogCache'

jest.spyOn(Storage.prototype, 'setItem')
jest.spyOn(Storage.prototype, 'getItem')

describe('useDogCache', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('should read from localStorage', () => {
    renderHook(() => useDogCache('test'), { wrapper: RecoilRoot })
    expect(localStorage.getItem).toHaveBeenCalledWith('dog-cache')
  })

  it('should write to localStorage', () => {
    const {
      result: {
        current: [, setCache],
      },
    } = renderHook(() => useDogCache('TEST1234'), { wrapper: RecoilRoot })
    act(() => {
      setCache({ dog: { dam: { name: 'Test Dam' } } })
    })
    expect(localStorage.setItem).toHaveBeenCalledWith('dog-cache', '{"TEST1234":{"dog":{"dam":{"name":"Test Dam"}}}}')
  })

  it('should not write to localStorage with undefined key', () => {
    const {
      result: {
        current: [, setCache],
      },
    } = renderHook(() => useDogCache(), { wrapper: RecoilRoot })
    act(() => {
      setCache({ dog: { dam: { name: 'Test Dam' } } })
    })
    expect(localStorage.setItem).not.toHaveBeenCalled()
  })

  it('should not write to localStorage with empty key', () => {
    const {
      result: {
        current: [, setCache],
      },
    } = renderHook(() => useDogCache(''), { wrapper: RecoilRoot })
    act(() => {
      setCache({ dog: { dam: { name: 'Test Dam' } } })
    })
    expect(localStorage.setItem).not.toHaveBeenCalled()
  })
})

describe('filterInvalid', () => {
  it('should return cache object with invalid entries removed', () => {
    const invalidCache: DogCache = {
      ' FI123456/12': {},
      asdf: {},
      'FI123456/12': {},
      'FI123456/12 ': {},
    }
    expect(filterInvalid(invalidCache)).toEqual({ 'FI123456/12': {} })
  })
})
