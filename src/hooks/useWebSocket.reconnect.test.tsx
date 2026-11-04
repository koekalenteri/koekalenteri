import type { ReactNode } from 'react'
import type { TestStore } from '../test-utils/AtomProvider'
import type { CollectionResponse, DogEvent, PublicRegistration, Registration } from '../types'
import { act, renderHook } from '@testing-library/react'
import { createElement } from 'react'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { getAdminEvents } from '../api/event'
import { getRegistrations, getStartList } from '../api/registration'
import { stationDogsInOrder } from '../lib/results'
import { useAdminEventScope } from '../pages/admin/state/eventScope'
import { adminEventAtom, adminEventsAtom } from '../pages/admin/state/events'
import { adminEditableEventByIdAtom } from '../pages/admin/state/events/editableAtoms'
import {
  adminEventRegistrationsAtom,
  adminEventRegistrationsCursorAtom,
} from '../pages/admin/state/registrations/atoms'
import { idTokenAtom } from '../pages/state'
import { expectConsoleOutput } from '../test-utils/consoleGuard'
import { makeTestIdToken } from '../test-utils/utils'
import { usePublicStartList } from './usePublicStartList'
import { useWebSocket } from './useWebSocket'
import WebSocketProvider from './WebSocketProvider'

vi.mock('../routeConfig', async (importActual) => ({
  ...(await importActual<typeof import('../routeConfig')>()),
  WS_API_URL: 'wss://example.invalid/ws',
}))
vi.mock('../api/event', () => ({ getAdminEvents: vi.fn() }))
vi.mock('../api/registration')
vi.mock('../api/user')
vi.mock('../pages/admin/state/user/atoms', async () => {
  const { atom } = await vi.importActual<typeof import('jotai')>('jotai')
  return { adminUsersAtom: atom([]) }
})

/** The browser's socket as far as the hook reads it, driven by hand. `close` fires nothing, as on a dead socket. */
class FakeSocket {
  static readonly OPEN = 1
  static readonly instances: FakeSocket[] = []

  readyState = 0
  readonly sent: Record<string, unknown>[] = []
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((message: { data: string }) => void) | null = null
  onopen: (() => void) | null = null

  constructor() {
    FakeSocket.instances.push(this)
  }

  static latest() {
    const socket = FakeSocket.instances.at(-1)
    if (!socket) throw new Error('no socket')
    return socket
  }

  close() {
    this.readyState = 3
  }

  send(payload: string) {
    this.sent.push(JSON.parse(payload))
  }

  open() {
    this.readyState = FakeSocket.OPEN
    this.onopen?.()
  }

  receive(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }

  drop() {
    this.readyState = 3
    this.onclose?.()
  }
}

const EVENT_ID = 'event-1'
const TOKEN = makeTestIdToken({ iat: 1, sub: 'secretary' })
const REFRESHED_TOKEN = makeTestIdToken({ iat: 2, sub: 'secretary' })
const DAY = '2026-09-12' as const

/** The running order lives on the event: a group walks the posts in the order of its rotation. */
const eventWithOrder = (order: string[], updatedAt: string) =>
  ({
    eventType: 'NOWT',
    id: EVENT_ID,
    organizer: { id: 'org' },
    rotations: [{ class: 'ALO', exercises: order.map((stationId) => ({ stationId })) }],
    startDate: DAY,
    stations: [1, 2].map((number) => ({ date: DAY, id: `post-${number}`, number })),
    updatedAt: new Date(updatedAt),
  }) as unknown as DogEvent

const registration = (notes: string, updatedAt: string) =>
  ({
    class: 'ALO',
    eventId: EVENT_ID,
    group: { date: DAY, key: 'x', number: 1 },
    id: 'dog-1',
    notes,
    updatedAt: new Date(updatedAt),
  }) as unknown as Registration

const BEFORE = '2026-09-12T08:00:00.000Z'
const DURING_OUTAGE = '2026-09-12T08:05:00.000Z'
const AFTER_THE_READ = '2026-09-12T08:06:00.000Z'

/** What the server holds: a since read answers with the rows stamped after it, as the handler does. */
const serveRegistrations = (row: Registration) =>
  ((_eventId: string, _token: string, _signal?: AbortSignal, since?: Date) =>
    Promise.resolve<CollectionResponse<Registration>>(
      since ? { cursor: row.updatedAt?.getTime() ?? 0, deletedIds: [], items: [row] } : [row]
    )) as typeof getRegistrations

const orderAtPost = async (store: TestStore, stationId: string) => {
  const event = await store.get(adminEventAtom(EVENT_ID))
  const registrations = await store.get(adminEventRegistrationsAtom(EVENT_ID))
  return stationDogsInOrder(event as DogEvent & { eventType: string }, stationId, registrations)[0]?.visit
    ?.exercisePosts
}

const notesInList = async (store: TestStore) => (await store.get(adminEventRegistrationsAtom(EVENT_ID)))[0]?.notes

const flush = () => act(() => new Promise<void>((resolve) => setTimeout(resolve)))

const subscribeOn = async (socket: FakeSocket) => {
  act(() => socket.open())
  act(() => socket.receive({ authenticated: true }))
  await act(async () => socket.receive({ adminSubscribed: true }))
  await flush()
}

/**
 * Up to the point the secretary's page has loaded and the first connection is subscribed. The view
 * holds the event and has no event subscription, as the start numbers page: only the admin ack decides.
 */
const openSecretaryView = async () => {
  vi.mocked(getAdminEvents).mockResolvedValue([eventWithOrder(['post-1', 'post-2'], BEFORE)])
  vi.mocked(getRegistrations).mockImplementation(serveRegistrations(registration('before', BEFORE)))

  let created: TestStore | undefined
  const wrapper = ({ children }: { readonly children: ReactNode }) =>
    createElement(Provider, {
      children,
      initializeState: (store: TestStore) => {
        created = store
        store.set(idTokenAtom, TOKEN)
      },
    })
  const { result } = renderHook(
    () => {
      useAdminEventScope(EVENT_ID)
      return useWebSocket()
    },
    { wrapper }
  )
  if (!created) throw new Error('no store')
  const store: TestStore = created
  await act(async () => {
    store.sub(adminEventsAtom, () => undefined)
    await store.get(adminEventsAtom)
    await store.get(adminEventRegistrationsAtom(EVENT_ID))
  })
  await flush()

  act(() => result.current.subscribeAdmin())
  await subscribeOn(FakeSocket.latest())

  return { result, store }
}

/** The connection is lost and comes back after the reconnect delay. */
const reconnect = async () => {
  const lost = FakeSocket.latest()
  act(() => lost.drop())
  await vi.waitFor(() => expect(FakeSocket.latest()).not.toBe(lost), { timeout: 3000 })
  return FakeSocket.latest()
}

/** The connection is lost, comes back and is subscribed again. */
const reconnectSubscribed = async () => subscribeOn(await reconnect())

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const wake = () => act(() => document.dispatchEvent(new Event('visibilitychange')))

/** Lets the probe's time pass: the page goes on under real timers, so its next steps can be awaited. */
const wakeWithFakeClock = (run: () => void) => {
  vi.useFakeTimers()
  try {
    run()
  } finally {
    vi.useRealTimers()
  }
}

const WAKE_PROBE_TIMEOUT = 5000

describe('useWebSocket after the connection comes back', () => {
  beforeEach(() => {
    FakeSocket.instances.length = 0
    vi.stubGlobal('WebSocket', FakeSocket)
    vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.mocked(getAdminEvents).mockReset()
    vi.mocked(getRegistrations).mockReset()
    vi.mocked(getStartList).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  describe("the secretary's view (KOE-1698)", () => {
    it('reads the event again, so the running order changed during the outage reaches the post', async () => {
      const { store } = await openSecretaryView()
      expect(await orderAtPost(store, 'post-2')).toEqual(['post-1', 'post-2'])

      vi.mocked(getAdminEvents).mockResolvedValue([eventWithOrder(['post-2', 'post-1'], DURING_OUTAGE)])
      await reconnectSubscribed()

      await vi.waitFor(async () => expect(await orderAtPost(store, 'post-2')).toEqual(['post-2', 'post-1']))
      // Since the newest stamp the last fetch stored, not a whole list.
      expect(getAdminEvents).toHaveBeenLastCalledWith(TOKEN, Date.parse(BEFORE))
    }, 10_000)

    it('reads the whole list of the held event, whatever cursor it has', async () => {
      const { store } = await openSecretaryView()
      const cursor = new Date(BEFORE)
      store.set(adminEventRegistrationsCursorAtom(EVENT_ID), cursor)

      vi.mocked(getRegistrations).mockImplementation(serveRegistrations(registration('during', DURING_OUTAGE)))
      await reconnectSubscribed()

      await vi.waitFor(async () => expect(await notesInList(store)).toBe('during'))
      expect(getRegistrations).toHaveBeenLastCalledWith(EVENT_ID, TOKEN)
      expect(store.get(adminEventRegistrationsCursorAtom(EVENT_ID))).toBe(cursor)
    }, 10_000)

    it('reads nothing again when the first connection is subscribed, since the page has just read', async () => {
      await openSecretaryView()

      expect(getAdminEvents).toHaveBeenCalledTimes(1)
      expect(getRegistrations).toHaveBeenCalledTimes(1)
    })

    it('reads nothing again for a subscribe sent again on the same connection, or for an unsubscribe', async () => {
      await openSecretaryView()

      await act(async () => FakeSocket.latest().receive({ adminSubscribed: true }))
      await act(async () => FakeSocket.latest().receive({ adminSubscribed: false }))
      await flush()

      expect(getAdminEvents).toHaveBeenCalledTimes(1)
      expect(getRegistrations).toHaveBeenCalledTimes(1)
    })

    it('reads again after a refreshed token replaced the socket, which may have died unnoticed', async () => {
      const { store } = await openSecretaryView()
      const previous = FakeSocket.latest()

      act(() => store.set(idTokenAtom, REFRESHED_TOKEN))
      expect(FakeSocket.latest()).not.toBe(previous)
      await subscribeOn(FakeSocket.latest())

      await vi.waitFor(() => expect(getRegistrations).toHaveBeenLastCalledWith(EVENT_ID, REFRESHED_TOKEN))
    })

    it("does not take a login's first subscribe for a reconnect, since its pages read anew", async () => {
      const { result, store } = await openSecretaryView()

      act(() => store.set(idTokenAtom, undefined))
      act(() => store.set(idTokenAtom, REFRESHED_TOKEN))
      act(() => result.current.subscribeAdmin())
      await subscribeOn(FakeSocket.latest())

      expect(getRegistrations).toHaveBeenCalledTimes(1)
    })

    it('reads nothing when the socket refuses the token, and does not come back', async () => {
      await openSecretaryView()

      const socket = await reconnect()
      act(() => socket.open())
      await act(async () => socket.receive({ ok: false, status: 403 }))
      await flush()

      expect(getAdminEvents).toHaveBeenCalledTimes(1)
      expect(getRegistrations).toHaveBeenCalledTimes(1)
    }, 10_000)

    it('leaves the page as it was when both reads fail, and reports them', async () => {
      const { store } = await openSecretaryView()
      expectConsoleOutput(/reportError Error: events down/, /reportError Error: registrations down/)

      vi.mocked(getAdminEvents).mockRejectedValue(new Error('events down'))
      vi.mocked(getRegistrations).mockRejectedValue(new Error('registrations down'))
      await reconnectSubscribed()

      await vi.waitFor(() => expect(getRegistrations).toHaveBeenCalledTimes(2))
      await flush()
      expect(await orderAtPost(store, 'post-2')).toEqual(['post-1', 'post-2'])
      expect(await notesInList(store)).toBe('before')
    }, 10_000)

    it('does not let an answer read before a stamped patch undo it', async () => {
      const { store } = await openSecretaryView()
      const events = deferred<DogEvent[]>()
      const registrations = deferred<Registration[]>()
      vi.mocked(getAdminEvents).mockReturnValue(events.promise)
      vi.mocked(getRegistrations).mockReturnValue(registrations.promise as never)

      await reconnectSubscribed()
      await vi.waitFor(() => expect(getRegistrations).toHaveBeenCalledTimes(2))
      const socket = FakeSocket.latest()
      await act(async () => {
        socket.receive({
          eventId: EVENT_ID,
          patch: [{ id: 'dog-1', notes: 'patched', updatedAt: AFTER_THE_READ }],
          scope: 'admin:event-registrations',
        })
        socket.receive({
          eventId: EVENT_ID,
          rotations: [{ class: 'ALO', exercises: [{ stationId: 'post-2' }, { stationId: 'post-1' }] }],
          scope: 'admin:event-patch',
          updatedAt: AFTER_THE_READ,
        })
      })
      await flush()

      await act(async () => {
        events.resolve([eventWithOrder(['post-1', 'post-2'], DURING_OUTAGE)])
        registrations.resolve([registration('during', DURING_OUTAGE)])
      })
      await flush()

      expect(await notesInList(store)).toBe('patched')
      expect(await orderAtPost(store, 'post-2')).toEqual(['post-2', 'post-1'])
    }, 10_000)

    it('leaves the unsaved edits of the event form alone', async () => {
      const { store } = await openSecretaryView()
      const edited = { ...eventWithOrder(['post-1', 'post-2'], BEFORE), location: 'edited' }
      store.set(adminEditableEventByIdAtom(EVENT_ID), edited)

      vi.mocked(getAdminEvents).mockResolvedValue([eventWithOrder(['post-2', 'post-1'], DURING_OUTAGE)])
      await reconnectSubscribed()

      await vi.waitFor(async () => expect(await orderAtPost(store, 'post-2')).toEqual(['post-2', 'post-1']))
      expect(store.get(adminEditableEventByIdAtom(EVENT_ID))).toMatchObject({ location: 'edited' })
    }, 10_000)
  })

  describe('waking up', () => {
    it('replaces a socket that does not answer, and the re-read follows', async () => {
      const { store } = await openSecretaryView()
      const dead = FakeSocket.latest()

      vi.mocked(getAdminEvents).mockResolvedValue([eventWithOrder(['post-2', 'post-1'], DURING_OUTAGE)])
      wakeWithFakeClock(() => {
        wake()
        expect(dead.sent.at(-1)).toEqual({ action: 'ping' })
        act(() => vi.advanceTimersByTime(WAKE_PROBE_TIMEOUT - 1))
        expect(FakeSocket.latest()).toBe(dead)
        act(() => vi.advanceTimersByTime(1))
      })

      expect(FakeSocket.latest()).not.toBe(dead)
      await subscribeOn(FakeSocket.latest())

      await vi.waitFor(async () => expect(await orderAtPost(store, 'post-2')).toEqual(['post-2', 'post-1']))
    })

    it('leaves a socket that answers alone, and asks once while waiting', async () => {
      await openSecretaryView()
      const alive = FakeSocket.latest()

      wakeWithFakeClock(() => {
        const sentBefore = alive.sent.length
        wake()
        wake()
        expect(alive.sent).toHaveLength(sentBefore + 1)
        act(() => alive.receive({ pong: true }))
        act(() => vi.advanceTimersByTime(WAKE_PROBE_TIMEOUT))
      })

      expect(FakeSocket.latest()).toBe(alive)
      expect(getRegistrations).toHaveBeenCalledTimes(1)
    })

    it('sends nothing when the page goes hidden', async () => {
      await openSecretaryView()
      const socket = FakeSocket.latest()
      const sentBefore = socket.sent.length

      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
      wake()

      expect(socket.sent).toHaveLength(sentBefore)
    })

    it('sends nothing on a socket that is not open yet', async () => {
      await openSecretaryView()

      const socket = await reconnect()
      wake()

      expect(socket.sent).toEqual([])
    }, 10_000)

    it('does not replace a socket a token refresh already replaced', async () => {
      const { store } = await openSecretaryView()

      wakeWithFakeClock(() => {
        wake()
        act(() => store.set(idTokenAtom, REFRESHED_TOKEN))
        const refreshed = FakeSocket.latest()
        act(() => vi.advanceTimersByTime(WAKE_PROBE_TIMEOUT))
        expect(FakeSocket.latest()).toBe(refreshed)
      })
    })
  })

  describe('the public start list (KOE-1523)', () => {
    const row = (name: string) => ({ class: 'ALO', dog: { name, regNo: name } }) as unknown as PublicRegistration
    const loaded = { participants: [row('loaded')], version: 100 }

    const openStartList = () => {
      const wrapper = ({ children }: { readonly children: ReactNode }) =>
        createElement(Provider, null, createElement(WebSocketProvider, null, children))
      const { result } = renderHook(() => usePublicStartList(EVENT_ID, loaded), { wrapper })
      const shown = () => result.current.map(({ dog }) => dog.name)
      act(() => FakeSocket.latest().open())
      return shown
    }

    const ack = (socket: FakeSocket) => act(async () => socket.receive({ eventId: EVENT_ID, subscribed: true }))

    it('takes the list in when the subscription is acknowledged, on the first connection and after an outage', async () => {
      vi.mocked(getStartList).mockResolvedValue({ participants: [row('first')], version: 200 })
      const shown = openStartList()

      await ack(FakeSocket.latest())
      await vi.waitFor(() => expect(shown()).toEqual(['first']))

      vi.mocked(getStartList).mockResolvedValue({ participants: [row('during')], version: 300 })
      const socket = await reconnect()
      act(() => socket.open())
      await ack(socket)

      await vi.waitFor(() => expect(shown()).toEqual(['during']))
    }, 10_000)

    it('fetches after a wake finds the socket dead', async () => {
      vi.mocked(getStartList).mockResolvedValue({ participants: [row('first')], version: 200 })
      const shown = openStartList()
      const dead = FakeSocket.latest()
      await ack(dead)
      await vi.waitFor(() => expect(shown()).toEqual(['first']))

      vi.mocked(getStartList).mockResolvedValue({ participants: [row('during')], version: 300 })
      wakeWithFakeClock(() => {
        wake()
        act(() => vi.advanceTimersByTime(WAKE_PROBE_TIMEOUT))
      })
      act(() => FakeSocket.latest().open())
      await ack(FakeSocket.latest())

      await vi.waitFor(() => expect(shown()).toEqual(['during']))
    })

    it('takes neither the ack of another event nor a scoped message with the flag for its own', async () => {
      const shown = openStartList()
      const socket = FakeSocket.latest()

      await act(async () => socket.receive({ eventId: 'other-event', subscribed: true }))
      await act(async () =>
        socket.receive({ eventId: EVENT_ID, patch: {}, scope: 'participant:registration-patch', subscribed: true })
      )
      await flush()

      expect(getStartList).not.toHaveBeenCalled()
      expect(shown()).toEqual(['loaded'])
    })

    it('keeps the list when the fetch fails, for the next message to bring', async () => {
      vi.mocked(getStartList).mockRejectedValue(new Error('network'))
      const shown = openStartList()

      await ack(FakeSocket.latest())
      await flush()

      expect(getStartList).toHaveBeenCalledTimes(1)
      expect(shown()).toEqual(['loaded'])
    })
  })
})
