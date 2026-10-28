import { renderHook } from '@testing-library/react'
import { reportError } from '@/lib/client/error'
import { useReadStateWhenDue } from './useReadStateWhenDue'

vi.mock('@/lib/client/error', () => ({ reportError: vi.fn() }))

describe('useReadStateWhenDue', () => {
  it('reads the state once when a read is due, however often it renders with a new read function', () => {
    const first = vi.fn(async () => undefined)
    const { rerender } = renderHook(({ read }) => useReadStateWhenDue(true, read), {
      initialProps: { read: first },
    })

    const second = vi.fn(async () => undefined)
    rerender({ read: second })
    rerender({ read: vi.fn(async () => undefined) })

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('reads nothing while no read is due', () => {
    const read = vi.fn(async () => undefined)

    renderHook(() => useReadStateWhenDue(false, read))

    expect(read).not.toHaveBeenCalled()
  })

  it('reads again each time a read falls due, with the function it has by then', () => {
    const early = vi.fn(async () => undefined)
    const late = vi.fn(async () => undefined)
    const { rerender } = renderHook(({ due, read }) => useReadStateWhenDue(due, read), {
      initialProps: { due: true, read: early },
    })

    rerender({ due: false, read: early })
    rerender({ due: true, read: late })

    expect(early).toHaveBeenCalledTimes(1)
    expect(late).toHaveBeenCalledTimes(1)
  })

  it('reports a read that fails and does not let it escape', async () => {
    const failure = new Error('no answer')

    renderHook(() => useReadStateWhenDue(true, () => Promise.reject(failure)))
    await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(failure))
  })
})
