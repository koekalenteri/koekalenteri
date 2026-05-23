import type { ReactNode } from 'react'
import type { MutableSnapshot } from 'recoil'
import type { PublicDogEvent, Registration, User } from '../types'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { RecoilRoot, useRecoilValue } from 'recoil'
import { adminEventsAtom } from '../pages/admin/recoil/events'
import { adminUsersAtom } from '../pages/admin/recoil/user/atoms'
import { idTokenAtom } from '../pages/recoil'
import { applyPatch, applyRegistrationPatches, applyRegistrations, applyViewers, useWebSocket } from './useWebSocket'

jest.mock('../routeConfig', () => ({
  WS_API_URL: 'wss://example.invalid/ws',
}))

jest.mock('../pages/admin/recoil/events', () => {
  const { atom } = jest.requireActual('recoil')
  return {
    adminEventsAtom: atom({ default: [], key: 'adminEventsAtomTestWs' }),
  }
})

jest.mock('../pages/admin/recoil/user/atoms', () => {
  const { atom } = jest.requireActual('recoil')
  return {
    adminUsersAtom: atom({ default: [], key: 'adminUsersAtomTestWs' }),
  }
})

jest.mock('../pages/recoil/user/selectors', () => {
  const { selector } = jest.requireActual('recoil')
  return {
    userSelector: selector({
      get: () => ({ id: 'user-1', name: 'User One' }),
      key: 'userSelectorTestWs',
    }),
  }
})

jest.mock('../pages/recoil/events/atoms', () => {
  const { atom } = jest.requireActual('recoil')
  return {
    eventsAtom: atom({ default: [], key: 'eventsAtomTestWs' }),
  }
})

// Mock console.debug to avoid noise in tests
jest.spyOn(console, 'debug').mockImplementation(() => {})

describe('applyPatch', () => {
  const baseEvents = [
    { id: '1', name: 'Event 1' },
    { id: '2', name: 'Event 2' },
  ] as PublicDogEvent[]

  it('returns original array if eventId not found', () => {
    const result = applyPatch(baseEvents, '3', { name: 'Updated' })
    expect(result).toBe(baseEvents)
  })

  it('returns new array with patched event if event changes', () => {
    const patch = { name: 'Updated Event 1' }
    const result = applyPatch(baseEvents, '1', patch)
    expect(result).not.toBe(baseEvents)
    expect(result.find((e) => e.id === '1')?.name).toBe('Updated Event 1')
  })

  it('returns original array if event did not change', () => {
    const patch = { name: 'Event 1' }
    const result = applyPatch(baseEvents, '1', patch)
    expect(result).toBe(baseEvents)
  })
})

describe('applyRegistrations', () => {
  it('returns next registrations array', () => {
    const current = [{ id: '1' }] as Registration[]
    const next = [{ id: '2' }] as Registration[]

    expect(applyRegistrations(current, next)).toBe(next)
  })
})

describe('applyRegistrationPatches', () => {
  it('returns original registrations when patch is empty', () => {
    const current = [{ id: '1', notes: 'old' }] as Registration[]

    expect(applyRegistrationPatches(current, [])).toBe(current)
  })

  it('patches matching registrations by id', () => {
    const current = [
      { id: '1', notes: 'old' },
      { id: '2', notes: 'keep' },
    ] as Registration[]

    expect(applyRegistrationPatches(current, [{ id: '1', notes: 'new' }])).toEqual([
      { id: '1', notes: 'new' },
      { id: '2', notes: 'keep' },
    ])
  })
})

describe('applyViewers', () => {
  it('returns current viewers when payload is identical', () => {
    const current = [{ name: 'User 1', userId: '1' }]

    expect(applyViewers(current, [{ name: 'User 1', userId: '1' }])).toBe(current)
  })

  it('returns next viewers when payload changes', () => {
    const current = [{ name: 'User 1', userId: '1' }]
    const next = [{ name: 'User 2', userId: '2' }]

    expect(applyViewers(current, next)).toBe(next)
  })
})

describe('useWebSocket', () => {
  // Mock WebSocket
  let mockWebSocketInstance: any

  function wrapperWithToken(token?: string) {
    return function Wrapper({ children }: { readonly children: ReactNode }) {
      return createElement(RecoilRoot, {
        children,
        initializeState: ({ set }: MutableSnapshot) => {
          set(idTokenAtom, token)
          set(adminUsersAtom, [{ id: 'user-2', name: 'User Two' }] as User[])
        },
      })
    }
  }

  beforeEach(() => {
    // Create mock WebSocket instance
    mockWebSocketInstance = {
      close: jest.fn(),
      onclose: null,
      onerror: null,
      onmessage: null,
      onopen: null,
      send: jest.fn(),
    }

    // Mock WebSocket constructor
    global.WebSocket = jest.fn(() => mockWebSocketInstance) as any
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should set up event handlers on the WebSocket instance', async () => {
    renderHook(() => useWebSocket(), { wrapper: wrapperWithToken(undefined) })

    // Verify event handlers were set
    await waitFor(() => expect(global.WebSocket).toHaveBeenCalledWith(expect.any(String)))
    expect(mockWebSocketInstance.onopen).toBeDefined()
    expect(mockWebSocketInstance.onclose).toBeDefined()
    expect(mockWebSocketInstance.onerror).toBeDefined()
    expect(mockWebSocketInstance.onmessage).toBeDefined()
  })

  it('should ignore invalid JSON messages', () => {
    renderHook(() => useWebSocket(), { wrapper: wrapperWithToken(undefined) })

    expect(() => {
      act(() => {
        mockWebSocketInstance.onmessage?.({ data: '{invalid-json' })
      })
    }).not.toThrow()
  })

  it('should ignore messages without eventId', () => {
    renderHook(() => useWebSocket(), { wrapper: wrapperWithToken(undefined) })

    expect(() => {
      act(() => {
        mockWebSocketInstance.onmessage?.({ data: JSON.stringify({ scope: 'admin:event-viewers' }) })
      })
    }).not.toThrow()
  })

  it('should expose public connection count only from public scoped messages', () => {
    const { result } = renderHook(() => useWebSocket(false), { wrapper: wrapperWithToken(undefined) })

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({ count: 2, scope: 'admin:connection-count' }),
      })
    })
    expect(result.current.count).toBe(0)

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({ count: 5, scope: 'public:connection-count' }),
      })
    })
    expect(result.current.count).toBe(5)
  })

  it('should expose admin connection count only from admin scoped messages', () => {
    const { result } = renderHook(() => useWebSocket(true), { wrapper: wrapperWithToken('id-token') })

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({ count: 5, scope: 'public:connection-count' }),
      })
    })
    expect(result.current.count).toBe(0)

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({ count: 2, scope: 'admin:connection-count' }),
      })
    })
    expect(result.current.count).toBe(2)
  })

  it('should ignore subscribe acknowledgements without mutating viewer state', () => {
    const { result } = renderHook(() => useWebSocket(true, 'event-1'), { wrapper: wrapperWithToken('id-token') })

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({ eventId: 'event-1', subscribed: true }),
      })
    })

    expect(result.current.viewers).toEqual([])
  })

  it('should use token in websocket url when available', async () => {
    renderHook(() => useWebSocket(true), { wrapper: wrapperWithToken('id-token') })

    await waitFor(() => expect(global.WebSocket).toHaveBeenCalledWith(expect.stringContaining('token=')))
  })

  it('should subscribe to event when admin eventId is provided', async () => {
    renderHook(() => useWebSocket(true, 'event-1'), { wrapper: wrapperWithToken('id-token') })

    mockWebSocketInstance.onopen?.()

    expect(mockWebSocketInstance.send).toHaveBeenCalledWith(JSON.stringify({ action: 'subscribe', eventId: 'event-1' }))
  })

  it('should expose event viewers from websocket messages', async () => {
    const { result } = renderHook(() => useWebSocket(true, 'event-1'), { wrapper: wrapperWithToken('id-token') })

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({
          eventId: 'event-1',
          scope: 'admin:event-viewers',
          viewers: [{ userId: 'user-2' }],
        }),
      })
    })

    expect(result.current.viewers).toEqual([{ name: 'User Two', userId: 'user-2' }])
  })

  it('should update admin events from scoped admin event patch messages', async () => {
    const event = {
      classes: [],
      endDate: new Date('2026-01-02'),
      eventType: 'NOME-B',
      id: 'event-1',
      judges: [{ id: 1, name: 'Old Judge', official: true }],
      organizer: { id: 'org-1', name: 'Organizer' },
      startDate: new Date('2026-01-01'),
    }
    const wrapper = function Wrapper({ children }: { readonly children: ReactNode }) {
      return createElement(RecoilRoot, {
        children,
        initializeState: ({ set }: MutableSnapshot) => {
          set(idTokenAtom, 'id-token')
          set(adminEventsAtom, [event as any])
        },
      })
    }
    const { result } = renderHook(
      () => {
        useWebSocket(true)
        return useRecoilValue(adminEventsAtom)
      },
      { wrapper }
    )

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({
          eventId: 'event-1',
          judges: [{ id: 2, name: 'New Judge', official: true }],
          scope: 'admin:event-patch',
        }),
      })
    })

    expect(result.current[0]?.judges?.[0]?.name).toBe('New Judge')
  })

  it('should not let the global websocket consume admin event patch messages as public events', async () => {
    const event = {
      endDate: new Date('2026-01-02'),
      eventType: 'NOME-B',
      id: 'event-1',
      name: 'Old Public Name',
      organizer: { id: 'org-1', name: 'Organizer' },
      startDate: new Date('2026-01-01'),
    }
    const wrapper = function Wrapper({ children }: { readonly children: ReactNode }) {
      return createElement(RecoilRoot, {
        children,
        initializeState: ({ set }: MutableSnapshot) => {
          set(idTokenAtom, 'id-token')
          set(adminEventsAtom, [event as any])
        },
      })
    }
    const { result } = renderHook(
      () => {
        useWebSocket(false)
        return useRecoilValue(adminEventsAtom)
      },
      { wrapper }
    )

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({ eventId: 'event-1', name: 'New Admin Name', scope: 'admin:event-patch' }),
      })
    })
    expect(result.current[0]?.name).toBe('Old Public Name')
  })

  it('should apply registration patches from websocket messages', async () => {
    renderHook(() => useWebSocket(true, 'event-1'), { wrapper: wrapperWithToken('id-token') })

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({
          eventId: 'event-1',
          patch: [{ id: 'reg-1', notes: 'updated' }],
          scope: 'admin:event-registrations',
        }),
      })
    })

    expect(mockWebSocketInstance.onmessage).toBeDefined()
  })

  it('should clear viewers when switching to another event before next payload arrives', async () => {
    const { result, rerender } = renderHook(({ eventId }) => useWebSocket(true, eventId), {
      initialProps: { eventId: 'event-1' },
      wrapper: wrapperWithToken('id-token'),
    })

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({
          eventId: 'event-1',
          scope: 'admin:event-viewers',
          viewers: [{ userId: 'user-2' }],
        }),
      })
    })

    expect(result.current.viewers).toEqual([{ name: 'User Two', userId: 'user-2' }])

    rerender({ eventId: 'event-2' })

    expect(result.current.viewers).toEqual([])
  })
})
