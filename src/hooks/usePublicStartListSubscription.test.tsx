import type { ReactNode } from 'react'
import type { PublicRegistration } from '../types'
import { renderHook } from '@testing-library/react'
import { usePublicStartListSubscription } from './usePublicStartListSubscription'
import { WebSocketContext } from './useWebSocket'

let capturedListener: ((participants: PublicRegistration[] | undefined) => void) | undefined
const subscribePublicStartList = vi.fn(
  (_eventId: string, listener: (participants: PublicRegistration[] | undefined) => void) => {
    capturedListener = listener
  }
)
const unsubscribePublicStartList = vi.fn()

const wrapper = ({ children }: { children: ReactNode }) => (
  <WebSocketContext.Provider
    value={{
      subscribeAdmin: vi.fn(),
      subscribeAuditRecords: vi.fn(),
      subscribeEvent: vi.fn(),
      subscribePublicStartList,
      subscribeRegistration: vi.fn(),
      unsubscribeEvent: vi.fn(),
      unsubscribePublicStartList,
      unsubscribeRegistration: vi.fn(),
      viewers: [],
    }}
  >
    {children}
  </WebSocketContext.Provider>
)

describe('usePublicStartListSubscription', () => {
  beforeEach(() => {
    capturedListener = undefined
    subscribePublicStartList.mockClear()
    unsubscribePublicStartList.mockReset()
  })

  it('subscribes on mount and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => usePublicStartListSubscription('event-1', vi.fn()), { wrapper })

    expect(subscribePublicStartList).toHaveBeenCalledWith('event-1', expect.any(Function))

    unmount()

    expect(unsubscribePublicStartList).toHaveBeenCalled()
  })

  it('stays out of the way until there is an event to watch', () => {
    renderHook(() => usePublicStartListSubscription(undefined, vi.fn()), { wrapper })

    expect(subscribePublicStartList).not.toHaveBeenCalled()
  })

  it('calls the latest listener rather than the one it subscribed with', () => {
    const first = vi.fn()
    const latest = vi.fn()
    const rows: PublicRegistration[] = []

    const { rerender } = renderHook(
      ({ listener }: { listener: (participants: PublicRegistration[] | undefined) => void }) =>
        usePublicStartListSubscription('event-1', listener),
      { initialProps: { listener: first }, wrapper }
    )

    rerender({ listener: latest })

    // A listener that closes over page state changes on every render; resubscribing for that would
    // send a message per render.
    expect(subscribePublicStartList).toHaveBeenCalledTimes(1)
    capturedListener?.(rows)
    expect(latest).toHaveBeenCalledWith(rows)
    expect(first).not.toHaveBeenCalled()
  })
})
