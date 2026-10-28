import { renderHook } from '@testing-library/react'
import { useResultsLock } from './useResultsLock'

vi.mock('@/lib/client/error', () => ({ reportError: vi.fn() }))

const at = new Date('2021-02-10T12:00:00Z')
const open = { kcState: { code: 754, name: 'Hyväksytty', readAt: at } }
const handedOver = { kcState: { code: 1253, name: 'Luovutettu', readAt: at } }

describe('useResultsLock (KOE-1222)', () => {
  it('reads the state once when a page that asks for it opens, though the stored state is open', () => {
    const preview = vi.fn(async () => undefined)

    renderHook(() => useResultsLock(open, preview, { readOnOpen: true }))

    expect(preview).toHaveBeenCalledTimes(1)
    expect(preview).toHaveBeenCalledWith([])
  })

  it('does not read again when the read it made finds the trial locked', () => {
    const preview = vi.fn(async () => undefined)
    const { rerender } = renderHook(({ event }) => useResultsLock(event, preview, { readOnOpen: true }), {
      initialProps: { event: open },
    })

    rerender({ event: handedOver })

    expect(preview).toHaveBeenCalledTimes(1)
  })

  it('reads a trial stored open only when the page asks for it', () => {
    const preview = vi.fn(async () => undefined)

    renderHook(() => useResultsLock(open, preview, { readOnOpen: false }))

    expect(preview).not.toHaveBeenCalled()
  })

  it('still reads a trial stored locked once, for a page that does not read on open', () => {
    const preview = vi.fn(async () => undefined)

    renderHook(() => useResultsLock(handedOver, preview))

    expect(preview).toHaveBeenCalledTimes(1)
  })
})
