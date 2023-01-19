import { act } from 'react-dom/test-utils'
import { renderHook } from '@testing-library/react'
import { RecoilRoot } from 'recoil'

import { useDogCache } from './useDogCache'

jest.useFakeTimers()
jest.spyOn(Storage.prototype, 'setItem')
jest.spyOn(Storage.prototype, 'getItem')

describe('useDogCache', () => {
  it('should read from localStorage', () => {
    renderHook(() => useDogCache('test'), { wrapper: RecoilRoot })
    expect(localStorage.getItem).toHaveBeenCalledWith('dog-cache')
  })

  it('should write to localStorage', () => {
    const { result: { current: [, setCache] } } = renderHook(() => useDogCache('test'), { wrapper: RecoilRoot })
    act(() => {
      setCache({ dog: { dam: { name: 'Test Dam' } } })
    })
    expect(localStorage.setItem).toHaveBeenCalledWith('dog-cache', '{"test":{"dog":{"dam":{"name":"Test Dam"}}}}')
  })
})
