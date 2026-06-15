import type { ReactNode } from 'react'
import type { MutableSnapshot } from 'recoil'
import type { PublicDogEvent, Registration, User } from '../types'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { RecoilRoot, useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil'
import { applyPatch, applyPatchOrInsert } from '../lib/utils'
import { adminEventsAtom } from '../pages/admin/recoil/events'
import { adminEventRegistrationsAtom } from '../pages/admin/recoil/registrations/atoms'
import { adminUsersAtom } from '../pages/admin/recoil/user/atoms'
import { canReadWebsocketAdminUsers } from '../pages/admin/recoil/user/selectors'
import { idTokenAtom } from '../pages/recoil'
import { eventsAtom } from '../pages/recoil/events/atoms'
import { recentlyUpdatedAtom } from '../pages/recoil/recentUpdates'
import {
  applyRegistrationPatches,
  applyRegistrations,
  applyViewers,
  getRegistrationPatchChangedIds,
  useWebSocket,
} from './useWebSocket'

jest.mock('../routeConfig', () => ({
  WS_API_URL: 'wss://example.invalid/ws',
}))

jest.mock('../pages/admin/recoil/events', () => {
  const { atom } = jest.requireActual('recoil')
  return {
    adminEventsAtom: atom({ default: [], key: 'adminEventsAtomTestWs' }),
  }
})

jest.mock('../pages/admin/recoil/registrations/atoms', () => {
  const { atomFamily } = jest.requireActual('recoil')
  return {
    adminEventRegistrationsAtom: atomFamily({ default: [], key: 'adminEventRegistrationsAtomTestWs' }),
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
      get: () => ({ id: 'user-1', name: 'User One', roles: { 'org-1': 'secretary' } }),
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

let consoleDebugSpy: jest.SpyInstance

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

describe('canReadWebsocketAdminUsers', () => {
  it('requires a signed-in user with admin access', () => {
    expect(canReadWebsocketAdminUsers(undefined)).toBe(false)
    expect(canReadWebsocketAdminUsers(null)).toBe(false)
    expect(canReadWebsocketAdminUsers({ id: 'user-1' })).toBe(false)
    expect(canReadWebsocketAdminUsers({ id: 'user-1', roles: { 'org-1': 'secretary' } })).toBe(true)
    expect(canReadWebsocketAdminUsers({ admin: true, id: 'user-1' })).toBe(true)
  })
})

describe('applyPatchOrInsert', () => {
  const baseEvents = [
    { id: '1', name: 'Event 1' },
    { id: '2', name: 'Event 2' },
  ] as PublicDogEvent[]

  it('patches existing events', () => {
    const result = applyPatchOrInsert(baseEvents, '1', { name: 'Updated Event 1' })

    expect(result).not.toBe(baseEvents)
    expect(result.find((e) => e.id === '1')?.name).toBe('Updated Event 1')
  })

  it('inserts missing events from patches', () => {
    const result = applyPatchOrInsert(baseEvents, '3', { name: 'Event 3' })

    expect(result).toEqual([...baseEvents, { id: '3', name: 'Event 3' }])
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

  it('inserts missing registrations by id', () => {
    const current = [{ id: '1', notes: 'old' }] as Registration[]

    expect(applyRegistrationPatches(current, [{ id: '2', notes: 'new' }])).toEqual([
      { id: '1', notes: 'old' },
      { id: '2', notes: 'new' },
    ])
  })

  it('returns changed registration ids', () => {
    const current = [
      { id: '1', notes: 'old' },
      { id: '2', notes: 'keep' },
    ] as Registration[]

    expect(
      getRegistrationPatchChangedIds(current, [
        { id: '1', notes: 'new' },
        { id: '2', notes: 'keep' },
      ])
    ).toEqual(['1'])
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
    jest.useRealTimers()
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {})
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
    consoleDebugSpy.mockRestore()
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

  it('should expose public connection count from public scoped messages', () => {
    const { result } = renderHook(() => useWebSocket(), { wrapper: wrapperWithToken(undefined) })

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({ count: 2, scope: 'admin:connection-count' }),
      })
    })
    expect(result.current.publicCount).toBe(0)

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({ count: 5, scope: 'public:connection-count' }),
      })
    })
    expect(result.current.publicCount).toBe(5)
  })

  it('should expose admin connection count from admin scoped messages', () => {
    const { result } = renderHook(() => useWebSocket(), { wrapper: wrapperWithToken('id-token') })

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({ count: 5, scope: 'public:connection-count' }),
      })
    })
    expect(result.current.adminCount).toBe(0)

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({ count: 2, scope: 'admin:connection-count' }),
      })
    })
    expect(result.current.adminCount).toBe(2)
  })

  it('should ignore subscribe acknowledgements without mutating viewer state', () => {
    const { result } = renderHook(() => useWebSocket(), { wrapper: wrapperWithToken('id-token') })

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({ eventId: 'event-1', subscribed: true }),
      })
    })

    expect(result.current.viewers).toEqual([])
  })

  it('should authenticate over websocket message when token is available', async () => {
    renderHook(() => useWebSocket(), { wrapper: wrapperWithToken('id-token') })

    await waitFor(() => expect(global.WebSocket).toHaveBeenCalledWith('wss://example.invalid/ws'))

    act(() => {
      mockWebSocketInstance.onopen?.({} as Event)
    })

    expect(mockWebSocketInstance.send).toHaveBeenCalledWith(
      JSON.stringify({ action: 'authenticate', token: 'id-token' })
    )
  })

  it('should close and stop reconnecting when authentication fails', async () => {
    jest.useFakeTimers()
    renderHook(() => useWebSocket(), { wrapper: wrapperWithToken('id-token') })

    await waitFor(() => expect(global.WebSocket).toHaveBeenCalledWith('wss://example.invalid/ws'))

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({ error: 'Unauthorized', ok: false, status: 401 }),
      })
    })

    expect(mockWebSocketInstance.close).toHaveBeenCalled()

    act(() => {
      mockWebSocketInstance.onclose?.({} as CloseEvent)
      jest.runOnlyPendingTimers()
    })

    expect(global.WebSocket).toHaveBeenCalledTimes(1)
  })

  it('should subscribe to event channel when subscribeEvent is called', async () => {
    mockWebSocketInstance.readyState = WebSocket.OPEN
    const { result } = renderHook(() => useWebSocket(), { wrapper: wrapperWithToken('id-token') })

    act(() => {
      result.current.subscribeEvent('event-1')
    })

    expect(mockWebSocketInstance.send).toHaveBeenCalledWith(
      JSON.stringify({ action: 'subscribe', channel: 'event', eventId: 'event-1' })
    )
  })

  it('should subscribe to admin channel when subscribeAdmin is called', async () => {
    mockWebSocketInstance.readyState = WebSocket.OPEN
    const { result } = renderHook(() => useWebSocket(), { wrapper: wrapperWithToken('id-token') })

    act(() => {
      result.current.subscribeAdmin()
    })

    expect(mockWebSocketInstance.send).toHaveBeenCalledWith(JSON.stringify({ action: 'subscribe', channel: 'admin' }))
  })

  it('should send unsubscribe on unsubscribeEvent call', () => {
    mockWebSocketInstance.readyState = WebSocket.OPEN
    const { result } = renderHook(() => useWebSocket(), { wrapper: wrapperWithToken('id-token') })

    act(() => {
      result.current.subscribeEvent('event-1')
    })

    act(() => {
      result.current.unsubscribeEvent()
    })

    expect(mockWebSocketInstance.send).toHaveBeenCalledWith(JSON.stringify({ action: 'unsubscribe', channel: 'event' }))
  })

  it('should not re-send event subscription after unsubscribe and reconnect', () => {
    const { result } = renderHook(() => useWebSocket(), { wrapper: wrapperWithToken('id-token') })

    mockWebSocketInstance.readyState = WebSocket.OPEN
    act(() => {
      result.current.subscribeEvent('event-1')
    })
    act(() => {
      result.current.unsubscribeEvent()
    })

    mockWebSocketInstance.send.mockClear()

    act(() => {
      mockWebSocketInstance.onopen?.()
    })

    expect(mockWebSocketInstance.send).not.toHaveBeenCalledWith(
      JSON.stringify({ action: 'subscribe', channel: 'event', eventId: 'event-1' })
    )
  })

  it('should re-send event subscription after reconnect', () => {
    const { result } = renderHook(() => useWebSocket(), { wrapper: wrapperWithToken('id-token') })

    mockWebSocketInstance.readyState = WebSocket.OPEN
    act(() => {
      result.current.subscribeEvent('event-1')
    })

    // Simulate reconnect: onopen fires again
    act(() => {
      mockWebSocketInstance.onopen?.()
    })

    expect(mockWebSocketInstance.send).toHaveBeenCalledWith(
      JSON.stringify({ action: 'subscribe', channel: 'event', eventId: 'event-1' })
    )
  })

  it('should re-send admin subscription after reconnect', () => {
    const { result } = renderHook(() => useWebSocket(), { wrapper: wrapperWithToken('id-token') })

    mockWebSocketInstance.readyState = WebSocket.OPEN
    act(() => {
      result.current.subscribeAdmin()
    })

    // Simulate reconnect: onopen fires again
    act(() => {
      mockWebSocketInstance.onopen?.()
    })

    expect(mockWebSocketInstance.send).toHaveBeenCalledWith(JSON.stringify({ action: 'subscribe', channel: 'admin' }))
  })

  it('should close websocket on errors', () => {
    renderHook(() => useWebSocket(), { wrapper: wrapperWithToken(undefined) })

    act(() => {
      mockWebSocketInstance.onerror?.()
    })

    expect(mockWebSocketInstance.close).toHaveBeenCalledTimes(1)
  })

  it('should close websocket and prevent reconnect on cleanup', () => {
    jest.useFakeTimers()
    const { unmount } = renderHook(() => useWebSocket(), { wrapper: wrapperWithToken(undefined) })

    unmount()
    act(() => {
      mockWebSocketInstance.onclose?.()
      jest.runOnlyPendingTimers()
    })

    expect(mockWebSocketInstance.close).toHaveBeenCalledTimes(1)
    expect(global.WebSocket).toHaveBeenCalledTimes(1)
  })

  it('should reconnect after close while mounted', () => {
    jest.useFakeTimers()
    renderHook(() => useWebSocket(), { wrapper: wrapperWithToken(undefined) })

    act(() => {
      mockWebSocketInstance.onclose?.()
      jest.advanceTimersByTime(1000)
    })

    expect(global.WebSocket).toHaveBeenCalledTimes(2)
  })

  it('should expose event viewers from websocket messages', async () => {
    const { result } = renderHook(() => useWebSocket(), { wrapper: wrapperWithToken('id-token') })

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({
          eventId: 'event-1',
          scope: 'admin:event-viewers',
          viewers: ['user-2'],
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
        useWebSocket()
        return {
          events: useRecoilValue(adminEventsAtom),
          recentlyUpdated: useRecoilValue(recentlyUpdatedAtom),
        }
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

    await waitFor(() => {
      expect(result.current.events[0]?.judges?.[0]?.name).toBe('New Judge')
      expect(result.current.recentlyUpdated['admin:event:event-1']).toEqual(expect.any(Number))
    })
  })

  it('should revive date strings in admin event patch messages as Date objects', async () => {
    const event = {
      classes: [],
      endDate: new Date('2026-01-02'),
      eventType: 'NOME-B',
      id: 'event-1',
      judges: [],
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
        useWebSocket()
        return useRecoilValue(adminEventsAtom)
      },
      { wrapper }
    )

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({
          endDate: '2026-03-15',
          eventId: 'event-1',
          scope: 'admin:event-patch',
          startDate: '2026-03-10',
        }),
      })
    })

    await waitFor(() => {
      const updated = result.current[0]
      expect((updated as any).startDate).toBeInstanceOf(Date)
      expect((updated as any).endDate).toBeInstanceOf(Date)
    })
  })

  it('should insert new admin events from scoped admin event patch messages', async () => {
    const wrapper = function Wrapper({ children }: { readonly children: ReactNode }) {
      return createElement(RecoilRoot, {
        children,
        initializeState: ({ set }: MutableSnapshot) => {
          set(idTokenAtom, 'id-token')
          set(adminEventsAtom, [])
        },
      })
    }
    const { result } = renderHook(
      () => {
        useWebSocket()
        return useRecoilValue(adminEventsAtom)
      },
      { wrapper }
    )

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({
          eventId: 'event-2',
          eventType: 'NOME-A',
          judges: [{ id: 2, name: 'New Judge', official: true }],
          organizer: { id: 'org-1', name: 'Organizer' },
          scope: 'admin:event-patch',
        }),
      })
    })

    await waitFor(() => {
      expect(result.current).toHaveLength(1)
      expect(result.current[0]).toEqual(
        expect.objectContaining({ eventType: 'NOME-A', id: 'event-2', organizer: { id: 'org-1', name: 'Organizer' } })
      )
    })
  })

  it('should update public events from scoped public event patch messages', async () => {
    const event = { entries: 1, id: 'event-1', name: 'Old Public Name' }
    const wrapper = function Wrapper({ children }: { readonly children: ReactNode }) {
      return createElement(RecoilRoot, {
        children,
        initializeState: ({ set }: MutableSnapshot) => {
          set(eventsAtom, [event as any])
        },
      })
    }
    const { result } = renderHook(
      () => {
        useWebSocket()
        return {
          events: useRecoilValue(eventsAtom),
          recentlyUpdated: useRecoilValue(recentlyUpdatedAtom),
        }
      },
      { wrapper }
    )

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({ entries: 2, eventId: 'event-1', scope: 'public:event-patch' }),
      })
    })

    await waitFor(() => {
      expect(result.current.events[0]?.entries).toBe(2)
      expect(result.current.recentlyUpdated['public:event:event-1']).toEqual(expect.any(Number))
    })
  })

  it('should remove public events from scoped public draft event patch messages', async () => {
    const event = { entries: 1, id: 'event-1', name: 'Old Public Name', state: 'tentative' }
    const wrapper = function Wrapper({ children }: { readonly children: ReactNode }) {
      return createElement(RecoilRoot, {
        children,
        initializeState: ({ set }: MutableSnapshot) => {
          set(eventsAtom, [event as any])
        },
      })
    }
    const { result } = renderHook(
      () => {
        useWebSocket()
        return {
          events: useRecoilValue(eventsAtom),
          recentlyUpdated: useRecoilValue(recentlyUpdatedAtom),
        }
      },
      { wrapper }
    )

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({ eventId: 'event-1', scope: 'public:event-patch', state: 'draft' }),
      })
    })

    await waitFor(() => {
      expect(result.current.events).toEqual([])
      expect(result.current.recentlyUpdated['public:event:event-1']).toEqual(expect.any(Number))
    })
  })

  it('should merge public data from scoped admin event patch messages without losing existing fields', async () => {
    const event = {
      entries: 1,
      id: 'event-1',
      name: 'Old Public Name',
      organizer: { id: 'org-1', name: 'Organizer' },
    }
    const wrapper = function Wrapper({ children }: { readonly children: ReactNode }) {
      return createElement(RecoilRoot, {
        children,
        initializeState: ({ set }: MutableSnapshot) => {
          set(eventsAtom, [event as any])
        },
      })
    }
    const { result } = renderHook(
      () => {
        useWebSocket()
        return useRecoilValue(eventsAtom)
      },
      { wrapper }
    )

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({ entries: 2, eventId: 'event-1', scope: 'admin:event-patch' }),
      })
    })

    await waitFor(() => {
      expect(result.current[0]).toEqual({
        entries: 2,
        id: 'event-1',
        name: 'Old Public Name',
        organizer: { id: 'org-1', name: 'Organizer' },
      })
    })
  })

  it('should not insert partial public data from scoped admin event patch messages', async () => {
    const wrapper = function Wrapper({ children }: { readonly children: ReactNode }) {
      return createElement(RecoilRoot, {
        children,
        initializeState: ({ set }: MutableSnapshot) => {
          set(eventsAtom, [])
        },
      })
    }
    const { result } = renderHook(
      () => {
        useWebSocket()
        return useRecoilValue(eventsAtom)
      },
      { wrapper }
    )

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({ eventId: 'event-2', name: 'Draft Name', scope: 'admin:event-patch' }),
      })
    })

    expect(result.current).toEqual([])
  })

  it('should insert public data from full non-draft scoped admin event patch messages', async () => {
    const wrapper = function Wrapper({ children }: { readonly children: ReactNode }) {
      return createElement(RecoilRoot, {
        children,
        initializeState: ({ set }: MutableSnapshot) => {
          set(eventsAtom, [])
        },
      })
    }
    const { result } = renderHook(
      () => {
        useWebSocket()
        return useRecoilValue(eventsAtom)
      },
      { wrapper }
    )

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({
          classes: [],
          endDate: '2026-01-02',
          eventId: 'event-2',
          eventType: 'NOME-A',
          judges: [],
          location: 'Helsinki',
          name: 'New Public Event',
          organizer: { id: 'org-1', name: 'Organizer' },
          scope: 'admin:event-patch',
          startDate: '2026-01-01',
          state: 'tentative',
        }),
      })
    })

    await waitFor(() => {
      expect(result.current).toHaveLength(1)
      expect(result.current[0]).toEqual(
        expect.objectContaining({ eventType: 'NOME-A', id: 'event-2', name: 'New Public Event', state: 'tentative' })
      )
    })
  })

  it('should remove public events from scoped admin draft event patch messages', async () => {
    const event = { entries: 1, id: 'event-1', name: 'Old Public Name', state: 'tentative' }
    const wrapper = function Wrapper({ children }: { readonly children: ReactNode }) {
      return createElement(RecoilRoot, {
        children,
        initializeState: ({ set }: MutableSnapshot) => {
          set(eventsAtom, [event as any])
        },
      })
    }
    const { result } = renderHook(
      () => {
        useWebSocket()
        return useRecoilValue(eventsAtom)
      },
      { wrapper }
    )

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({ eventId: 'event-1', scope: 'admin:event-patch', state: 'draft' }),
      })
    })

    await waitFor(() => {
      expect(result.current).toEqual([])
    })
  })

  it('should not mark unchanged public event patches as recently updated', async () => {
    const event = { entries: 1, id: 'event-1', name: 'Old Public Name' }
    const wrapper = function Wrapper({ children }: { readonly children: ReactNode }) {
      return createElement(RecoilRoot, {
        children,
        initializeState: ({ set }: MutableSnapshot) => {
          set(eventsAtom, [event as any])
        },
      })
    }
    const { result } = renderHook(
      () => {
        useWebSocket()
        return useRecoilValue(recentlyUpdatedAtom)
      },
      { wrapper }
    )

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({ entries: 1, eventId: 'event-1', scope: 'public:event-patch' }),
      })
    })

    expect(result.current['public:event:event-1']).toBeUndefined()
  })

  it('should insert new public events from scoped public event patch messages', async () => {
    const wrapper = function Wrapper({ children }: { readonly children: ReactNode }) {
      return createElement(RecoilRoot, {
        children,
        initializeState: ({ set }: MutableSnapshot) => {
          set(eventsAtom, [])
        },
      })
    }
    const { result } = renderHook(
      () => {
        useWebSocket()
        return useRecoilValue(eventsAtom)
      },
      { wrapper }
    )

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({
          entries: 2,
          eventId: 'event-2',
          eventType: 'NOME-A',
          name: 'New Public Event',
          scope: 'public:event-patch',
        }),
      })
    })

    await waitFor(() => {
      expect(result.current).toHaveLength(1)
      expect(result.current[0]).toEqual(
        expect.objectContaining({ entries: 2, eventType: 'NOME-A', id: 'event-2', name: 'New Public Event' })
      )
    })
  })

  it('should apply registration patches from websocket messages', async () => {
    const registration = { id: 'reg-1', notes: 'old' } as Registration
    const wrapper = function Wrapper({ children }: { readonly children: ReactNode }) {
      return createElement(RecoilRoot, {
        children,
        initializeState: ({ set }: MutableSnapshot) => {
          set(idTokenAtom, 'id-token')
          set(adminEventRegistrationsAtom('event-1'), [registration])
        },
      })
    }
    const { result } = renderHook(
      () => {
        useWebSocket()
        return {
          recentlyUpdated: useRecoilValue(recentlyUpdatedAtom),
          registrations: useRecoilValue(adminEventRegistrationsAtom('event-1')),
        }
      },
      { wrapper }
    )

    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({
          eventId: 'event-1',
          patch: [{ id: 'reg-1', notes: 'updated' }],
          scope: 'admin:event-registrations',
        }),
      })
    })

    await waitFor(() => {
      expect(result.current.registrations[0]?.notes).toBe('updated')
      expect(result.current.recentlyUpdated['admin:registration:reg-1']).toEqual(expect.any(Number))
    })
  })

  it('should clear viewers when switching to another event via subscribeEvent', async () => {
    mockWebSocketInstance.readyState = WebSocket.OPEN
    const { result } = renderHook(() => useWebSocket(), {
      wrapper: wrapperWithToken('id-token'),
    })

    // First subscribe to event-1 so eventIdRef is set
    act(() => {
      result.current.subscribeEvent('event-1')
    })

    // Receive viewers for event-1
    act(() => {
      mockWebSocketInstance.onmessage?.({
        data: JSON.stringify({
          eventId: 'event-1',
          scope: 'admin:event-viewers',
          viewers: ['user-2'],
        }),
      })
    })

    expect(result.current.viewers).toEqual([{ name: 'User Two', userId: 'user-2' }])

    // Now switch to event-2 — viewers must be cleared immediately
    act(() => {
      result.current.subscribeEvent('event-2')
    })

    expect(result.current.viewers).toEqual([])
  })

  it('should not open a new WebSocket connection when Recoil state changes (e.g. adminUsersAtom update)', async () => {
    // Regression test: adminUsers / currentUser were previously listed in
    // connect's useCallback deps.  Any Recoil update (e.g. adminUsersAtom
    // changing after an event save) produced a new array ref, gave connect a
    // new identity, triggered the useEffect, closed the existing socket and
    // opened a fresh one – causing duplicate WS broadcast messages to be
    // processed and logged multiple times per browser tab.
    const { result } = renderHook(
      () => {
        const setUsers = useSetRecoilState(adminUsersAtom)
        useWebSocket()
        return { setUsers }
      },
      { wrapper: wrapperWithToken('id-token') }
    )

    await waitFor(() => expect(global.WebSocket).toHaveBeenCalledTimes(1))

    // Simulate adminUsersAtom being updated (e.g. admin user list loaded after
    // an event save triggers a re-render of the hook consumer)
    act(() => {
      result.current.setUsers([{ id: 'user-3', name: 'User Three' }] as User[])
    })

    // connect must remain stable – no second WebSocket should be opened
    expect(global.WebSocket).toHaveBeenCalledTimes(1)
  })

  it('should reconnect and authenticate when token changes after initial connection', async () => {
    const wsInstances: (typeof mockWebSocketInstance)[] = []
    global.WebSocket = jest.fn(() => {
      const instance = {
        close: jest.fn(),
        onclose: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onmessage: null as ((e: { data: string }) => void) | null,
        onopen: null as (() => void) | null,
        readyState: WebSocket.OPEN,
        send: jest.fn(),
      }
      wsInstances.push(instance)
      return instance
    }) as unknown as typeof WebSocket

    const { result } = renderHook(
      () => {
        const [token, setToken] = useRecoilState(idTokenAtom)
        useWebSocket()
        return { setToken, token }
      },
      { wrapper: wrapperWithToken(undefined) }
    )

    await waitFor(() => expect(global.WebSocket).toHaveBeenCalledTimes(1))

    act(() => {
      result.current.setToken('new-token')
    })

    expect(wsInstances[0].close).toHaveBeenCalledTimes(1)
    expect(global.WebSocket).toHaveBeenCalledTimes(2)

    act(() => {
      wsInstances[1].onopen?.()
    })

    expect(wsInstances[1].send).toHaveBeenCalledWith(JSON.stringify({ action: 'authenticate', token: 'new-token' }))
  })

  it('should close authenticated socket and clear subscriptions when token is removed', async () => {
    const wsInstances: (typeof mockWebSocketInstance)[] = []
    global.WebSocket = jest.fn(() => {
      const instance = {
        close: jest.fn(),
        onclose: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onmessage: null as ((e: { data: string }) => void) | null,
        onopen: null as (() => void) | null,
        readyState: WebSocket.OPEN,
        send: jest.fn(),
      }
      wsInstances.push(instance)
      return instance
    }) as unknown as typeof WebSocket

    const { result } = renderHook(
      () => {
        const [token, setToken] = useRecoilState(idTokenAtom)
        const websocket = useWebSocket()
        return { setToken, token, websocket }
      },
      { wrapper: wrapperWithToken('id-token') }
    )

    await waitFor(() => expect(global.WebSocket).toHaveBeenCalledTimes(1))

    act(() => {
      result.current.websocket.subscribeAdmin()
      result.current.websocket.subscribeEvent('event-1')
      result.current.setToken(undefined)
    })

    expect(wsInstances[0].close).toHaveBeenCalledTimes(1)
    expect(global.WebSocket).toHaveBeenCalledTimes(2)

    wsInstances[1].send.mockClear()

    act(() => {
      wsInstances[1].onopen?.()
    })

    expect(wsInstances[1].send).not.toHaveBeenCalledWith(JSON.stringify({ action: 'subscribe', channel: 'admin' }))
    expect(wsInstances[1].send).not.toHaveBeenCalledWith(
      JSON.stringify({ action: 'subscribe', channel: 'event', eventId: 'event-1' })
    )
  })

  it('should keep event subscription when token loadable is temporarily loading during token refresh', async () => {
    const wsInstances: (typeof mockWebSocketInstance)[] = []
    global.WebSocket = jest.fn(() => {
      const instance = {
        close: jest.fn(),
        onclose: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onmessage: null as ((e: { data: string }) => void) | null,
        onopen: null as (() => void) | null,
        readyState: WebSocket.OPEN,
        send: jest.fn(),
      }
      wsInstances.push(instance)
      return instance
    }) as unknown as typeof WebSocket

    const loadingToken = new Promise<string>(() => undefined)

    const { result } = renderHook(
      () => {
        const setToken = useSetRecoilState(idTokenAtom)
        const websocket = useWebSocket()
        return { setToken, websocket }
      },
      { wrapper: wrapperWithToken('id-token') }
    )

    await waitFor(() => expect(global.WebSocket).toHaveBeenCalledTimes(1))

    act(() => {
      result.current.websocket.subscribeEvent('event-1')
      result.current.setToken(loadingToken as unknown as string)
    })

    expect(wsInstances[0].close).not.toHaveBeenCalled()

    act(() => {
      result.current.setToken('new-token')
    })

    expect(wsInstances[0].close).toHaveBeenCalledTimes(1)
    expect(global.WebSocket).toHaveBeenCalledTimes(2)

    act(() => {
      wsInstances[1].onopen?.()
    })
    act(() => {
      wsInstances[1].onmessage?.({ data: JSON.stringify({ authenticated: true }) })
    })

    expect(wsInstances[1].send).toHaveBeenCalledWith(JSON.stringify({ action: 'authenticate', token: 'new-token' }))
    expect(wsInstances[1].send).toHaveBeenCalledWith(
      JSON.stringify({ action: 'subscribe', channel: 'event', eventId: 'event-1' })
    )
  })

  it('should not schedule a reconnect when a stale onclose fires after a new connection is already established', () => {
    // Regression test for the React StrictMode double-mount race condition.
    //
    // StrictMode tears down and re-mounts effects synchronously.  The sequence:
    //   1. mount  → connect() → WS1 created, wsRef = WS1
    //   2. cleanup → shouldReconnect=false, WS1.close()
    //   3. re-mount → shouldReconnect=true, connect() → WS2 created, wsRef = WS2
    //   4. WS1.onclose fires asynchronously (close is async)
    //      Before the fix: shouldReconnect===true, schedules connect() → WS3
    //      After  the fix: wsRef.current (WS2) !== ws (WS1) → early return, no WS3
    jest.useFakeTimers()

    // Override the shared mock so each construction returns a distinct instance
    const wsInstances: (typeof mockWebSocketInstance)[] = []
    global.WebSocket = jest.fn(() => {
      const instance = {
        close: jest.fn(),
        onclose: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onmessage: null as ((e: { data: string }) => void) | null,
        onopen: null as (() => void) | null,
        readyState: WebSocket.CONNECTING,
        send: jest.fn(),
      }
      wsInstances.push(instance)
      return instance
    }) as unknown as typeof WebSocket

    renderHook(() => useWebSocket(), { wrapper: wrapperWithToken(undefined) })

    // WS1 should now be in wsInstances[0]
    expect(wsInstances).toHaveLength(1)
    const ws1OnClose = wsInstances[0].onclose

    // Legitimate close → reconnect timer fires → WS2 created
    act(() => {
      ws1OnClose?.()
      jest.advanceTimersByTime(1000)
    })
    expect(wsInstances).toHaveLength(2)

    // Stale WS1 onclose fires again (simulates the async close from StrictMode
    // unmount arriving after WS2 is already in wsRef)
    act(() => {
      ws1OnClose?.()
      jest.advanceTimersByTime(1000)
    })

    // No third WebSocket should have been created
    expect(wsInstances).toHaveLength(2)
  })
})
