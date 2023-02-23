import { act } from 'react-dom/test-utils'
import { renderHook } from '@testing-library/react'
import { RecoilRoot } from 'recoil'

import { useDogCacheKey } from './useDogCacheKey'

jest.useFakeTimers()
jest.spyOn(Storage.prototype, 'setItem')
jest.spyOn(Storage.prototype, 'getItem')

describe('useDogCache', () => {
  it('should read from localStorage', () => {
    renderHook(() => useDogCacheKey('test', 'breeder'), { wrapper: RecoilRoot })
    expect(localStorage.getItem).toHaveBeenCalledWith('dog-cache')
  })

  it('should write to localStorage', () => {
    const { result: { current: [, setCache] } } = renderHook(() => useDogCacheKey('test', 'breeder'), { wrapper: RecoilRoot })
    act(() => {
      setCache({ name: 'Breeder Name'})
    })
    expect(localStorage.setItem).toHaveBeenCalledWith('dog-cache', '{"test":{"breeder":{"name":"Breeder Name"}}}')
    act(() => {
      setCache({ location: 'Breeder Location'})
    })
    expect(localStorage.setItem).toHaveBeenCalledWith('dog-cache', '{"test":{"breeder":{"location":"Breeder Location"}}}')
  })
})
