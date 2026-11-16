import { act, renderHook } from '@testing-library/react'
import { useTeamKeys } from './useTeamKeys'

// KOE-1763: a team's card keeps its key while the teams before it are removed.
describe('useTeamKeys', () => {
  it('gives each team a key, and new keys to the teams added at the end', () => {
    const { result, rerender } = renderHook(({ count }) => useTeamKeys(count), { initialProps: { count: 2 } })
    expect(result.current.keys).toEqual([0, 1])

    rerender({ count: 4 })
    expect(result.current.keys).toEqual([0, 1, 2, 3])
  })

  it('drops the key of a team removed, and the keys after it stay with their teams', () => {
    const { result, rerender } = renderHook(({ count }) => useTeamKeys(count), { initialProps: { count: 3 } })

    act(() => result.current.remove(0))
    rerender({ count: 2 })
    expect(result.current.keys).toEqual([1, 2])

    // A key once used is not given again, so a new team never takes a removed team's card.
    rerender({ count: 3 })
    expect(result.current.keys).toEqual([1, 2, 3])
  })

  it('drops the last keys when the teams shrink without a removal', () => {
    const { result, rerender } = renderHook(({ count }) => useTeamKeys(count), { initialProps: { count: 3 } })

    rerender({ count: 1 })
    expect(result.current.keys).toEqual([0])
  })
})
