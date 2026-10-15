import { renderHook } from '@testing-library/react'
import { reportError } from '@/lib/client/error'
import { useReadStateWhileLocked } from './useReadStateWhileLocked'

vi.mock('@/lib/client/error', () => ({ reportError: vi.fn() }))

describe('useReadStateWhileLocked', () => {
  it('reads the state once when the page is locked, however often it renders with a new read function', () => {
    const first = vi.fn(async () => undefined)
    const { rerender } = renderHook(({ read }) => useReadStateWhileLocked(true, read), {
      initialProps: { read: first },
    })

    const second = vi.fn(async () => undefined)
    rerender({ read: second })
    rerender({ read: vi.fn(async () => undefined) })

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('reads nothing while the page is open', () => {
    const read = vi.fn(async () => undefined)

    renderHook(() => useReadStateWhileLocked(false, read))

    expect(read).not.toHaveBeenCalled()
  })

  it('reads again each time the page becomes locked, with the function it has by then', () => {
    const early = vi.fn(async () => undefined)
    const late = vi.fn(async () => undefined)
    const { rerender } = renderHook(({ locked, read }) => useReadStateWhileLocked(locked, read), {
      initialProps: { locked: true, read: early },
    })

    rerender({ locked: false, read: early })
    rerender({ locked: true, read: late })

    expect(early).toHaveBeenCalledTimes(1)
    expect(late).toHaveBeenCalledTimes(1)
  })

  it('reports a read that fails and does not let it escape', async () => {
    const failure = new Error('no answer')

    renderHook(() => useReadStateWhileLocked(true, () => Promise.reject(failure)))
    await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(failure))
  })
})
