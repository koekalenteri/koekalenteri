import { renderHook } from '@testing-library/react'
import { Provider } from 'jotai'
import { act } from 'react'
import { useDogCacheKey } from './useDogCacheKey'

vi.spyOn(localStorage, 'setItem')
vi.spyOn(localStorage, 'getItem')

describe('useDogCache', () => {
  it('should read from localStorage', () => {
    renderHook(() => useDogCacheKey('TEST1234', 'breeder'), { wrapper: Provider })
    expect(localStorage.getItem).toHaveBeenCalledWith('dog-cache')
  })

  it('should write to localStorage', () => {
    const {
      result: {
        current: [, setCache],
      },
    } = renderHook(() => useDogCacheKey('TEST2222', 'breeder'), { wrapper: Provider })
    act(() => {
      setCache({ name: 'Breeder Name' })
    })
    expect(localStorage.setItem).toHaveBeenCalledWith('dog-cache', '{"TEST2222":{"breeder":{"name":"Breeder Name"}}}')
    // The setter replaces the key's cache: the name written above is gone, not merged into.
    act(() => {
      setCache({ id: 42 })
    })
    expect(localStorage.setItem).toHaveBeenCalledWith('dog-cache', '{"TEST2222":{"breeder":{"id":42}}}')
  })
})
