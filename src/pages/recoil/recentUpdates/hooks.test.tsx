import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { createElement } from 'react'
import { RecoilRoot } from 'recoil'
import {
  HIGHLIGHT_DURATION_MS,
  RECENTLY_UPDATED_ROW_CLASS_NAME,
  useIsRecentlyUpdated,
  useMarkRecentlyUpdated,
  useRecentUpdateRowClassName,
} from './hooks'

const wrapper = ({ children }: { readonly children: ReactNode }) => createElement(RecoilRoot, { children })

describe('recent update hooks', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  })

  afterEach(() => {
    act(() => jest.runOnlyPendingTimers())
    jest.useRealTimers()
  })

  it('marks an item as recently updated and clears it after the highlight duration', () => {
    const { result } = renderHook(
      () => ({
        isUpdated: useIsRecentlyUpdated('public:event', 'event-1'),
        markRecentlyUpdated: useMarkRecentlyUpdated(),
      }),
      { wrapper }
    )

    expect(result.current.isUpdated).toBe(false)

    act(() => result.current.markRecentlyUpdated('public:event', 'event-1'))

    expect(result.current.isUpdated).toBe(true)

    act(() => jest.advanceTimersByTime(HIGHLIGHT_DURATION_MS))

    expect(result.current.isUpdated).toBe(false)
  })

  it('keeps a newer mark when an older timeout fires', () => {
    const { result } = renderHook(
      () => ({
        isUpdated: useIsRecentlyUpdated('admin:event', 'event-1'),
        markRecentlyUpdated: useMarkRecentlyUpdated(),
      }),
      { wrapper }
    )

    act(() => result.current.markRecentlyUpdated('admin:event', 'event-1'))

    jest.setSystemTime(new Date('2026-01-01T00:00:01.000Z'))
    act(() => {
      jest.advanceTimersByTime(1000)
      result.current.markRecentlyUpdated('admin:event', 'event-1')
    })

    act(() => jest.advanceTimersByTime(HIGHLIGHT_DURATION_MS - 1000))
    expect(result.current.isUpdated).toBe(true)

    act(() => jest.advanceTimersByTime(1000))
    expect(result.current.isUpdated).toBe(false)
  })

  it('returns DataGrid row class name for recently updated rows', () => {
    const { result } = renderHook(
      () => ({
        getRowClassName: useRecentUpdateRowClassName('admin:event'),
        markRecentlyUpdated: useMarkRecentlyUpdated(),
      }),
      { wrapper }
    )

    act(() => result.current.markRecentlyUpdated('admin:event', 'event-1'))

    expect(result.current.getRowClassName({ id: 'event-1' } as never)).toBe(RECENTLY_UPDATED_ROW_CLASS_NAME)
    expect(result.current.getRowClassName({ id: 'event-2' } as never)).toBe('')
  })
})
