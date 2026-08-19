import type { DogCache } from '../../../state/dog'
import { renderHook } from '@testing-library/react'
import { Provider } from 'jotai'
import { act } from 'react'
import { filterInvalid, useDogCache } from './useDogCache'

vi.spyOn(localStorage, 'setItem')
vi.spyOn(localStorage, 'getItem')

describe('useDogCache', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('should read from localStorage', () => {
    renderHook(() => useDogCache('test'), { wrapper: Provider })
    expect(localStorage.getItem).toHaveBeenCalledWith('dog-cache')
  })

  it('should write to localStorage', () => {
    const {
      result: {
        current: [, setCache],
      },
    } = renderHook(() => useDogCache('TEST1234'), { wrapper: Provider })
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
    } = renderHook(() => useDogCache(), { wrapper: Provider })
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
    } = renderHook(() => useDogCache(''), { wrapper: Provider })
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
