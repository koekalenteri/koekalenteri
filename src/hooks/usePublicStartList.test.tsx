import type { PublicRegistration, PublicStartList } from '../types'
import type { PublicStartListListener } from './useWebSocket'
import { act, renderHook, waitFor } from '@testing-library/react'
import { enqueueSnackbar } from 'notistack'
import { getStartList } from '../api/registration'
import { expectConsoleOutput } from '../test-utils/consoleGuard'
import fetchMock from '../test-utils/fetchMock'
import { flushPromises } from '../test-utils/utils'
import { usePublicStartList } from './usePublicStartList'

vi.mock('../api/registration')
vi.mock('notistack', async (importOriginal) => ({
  ...(await importOriginal<typeof import('notistack')>()),
  enqueueSnackbar: vi.fn(),
}))

// The hook is driven through the subscription's own contract: the rows the server composed, or
// nothing when they did not fit in one message, the server time they were read, and the event the
// message was addressed to (by default the one subscribed to).
let liveListener:
  | ((participants: PublicRegistration[] | undefined, version?: number, messageEventId?: string) => void)
  | undefined
vi.mock('./usePublicStartListSubscription', () => ({
  usePublicStartListSubscription: (eventId: string | undefined, listener: PublicStartListListener) => {
    liveListener = (participants, version, messageEventId = eventId ?? '') =>
      listener(participants, version, messageEventId)
  },
}))

const participant = (name: string): PublicRegistration => ({
  breeder: 'Kasvattaja',
  cancelled: false,
  class: 'ALO',
  dog: { breedCode: '122', gender: 'M', name, regNo: `REG-${name}`, results: [] },
  group: { date: new Date('2025-01-01'), key: 'ALO', number: 1 },
  handler: 'Ohjaaja',
  owner: 'Omistaja',
})

const rows = (count: number) => Array.from({ length: count }, (_, index) => participant(`Koira ${index}`))

interface Props {
  eventId: string | undefined
  loaded: PublicStartList
}

const renderStartList = (initialProps: Props = { eventId: 'event-1', loaded: { participants: rows(1) } }) => {
  const rendered = renderHook(({ eventId, loaded }: Props) => usePublicStartList(eventId, loaded), { initialProps })
  const shows = (count: number) => expect(rendered.result.current).toHaveLength(count)
  return { ...rendered, shows }
}

describe('usePublicStartList (KOE-1516)', () => {
  beforeEach(() => {
    liveListener = undefined
    vi.mocked(getStartList).mockReset()
    vi.mocked(enqueueSnackbar).mockClear()
  })

  it('never returns the event the page left on any render after it moves on, not even the first', () => {
    // Every render's answer, recorded during the render: an assertion after rerender only sees the
    // state once its effects have run.
    const renders: Array<Array<string | undefined>> = []
    const { rerender } = renderHook(
      ({ eventId, loaded }: Props) => {
        const shown = usePublicStartList(eventId, loaded)
        renders.push(shown.map((row) => row.dog.name))
        return shown
      },
      { initialProps: { eventId: 'event-1', loaded: { participants: [participant('Aapo')], version: 1 } } }
    )
    expect(renders.at(-1)).toEqual(['Aapo'])
    renders.length = 0

    rerender({ eventId: 'event-2', loaded: { participants: [participant('Bertta')], version: 1 } })

    expect(renders.length).toBeGreaterThan(0)
    expect(renders).not.toContainEqual(['Aapo'])
    expect(renders.at(-1)).toEqual(['Bertta'])
  })

  describe('when live updates and fetches race each other', () => {
    it('keeps the newer rows when an older message arrives after them', async () => {
      const { shows } = renderStartList()

      act(() => liveListener?.(rows(2), 200))
      await waitFor(() => shows(2))

      // The slower sender read before the newer one: its rows still show what was just hidden.
      act(() => liveListener?.(rows(3), 100))

      await flushPromises(false)
      shows(2)
    })

    it('takes a message read in the same millisecond, so the later arrival wins', async () => {
      const { shows } = renderStartList()

      act(() => liveListener?.(rows(2), 200))
      act(() => liveListener?.(rows(3), 200))

      await waitFor(() => shows(3))
    })

    it('fetches the list when the rows did not fit in one message', async () => {
      vi.mocked(getStartList).mockResolvedValueOnce({ participants: rows(2), version: 210 })
      const { shows } = renderStartList()

      act(() => liveListener?.(undefined, 200))

      expect(getStartList).toHaveBeenCalledWith('event-1', undefined, expect.any(AbortSignal))
      await waitFor(() => shows(2))
    })

    it("drops a message for the event the page just left that reaches the next event's handler", async () => {
      const { rerender, shows } = renderStartList()

      rerender({ eventId: 'event-2', loaded: { participants: rows(3), version: 50 } })
      await waitFor(() => shows(3))

      // Between the render for event-2 and the resubscribe, the socket still delivers event-1's
      // messages, and the subscription hands them to the newest handler: event-2's.
      act(() => liveListener?.(rows(4), 400, 'event-1'))
      // Nor may one that asks for a fetch start one for the event the page has left.
      act(() => liveListener?.(undefined, 400, 'event-1'))
      await flushPromises(false)

      shows(3)
      expect(getStartList).not.toHaveBeenCalledWith('event-1', undefined, expect.anything())
    })

    it('does not let a loader result older than the live rows on screen overwrite them', async () => {
      const { rerender, shows } = renderStartList({
        eventId: 'event-1',
        loaded: { participants: rows(1), version: 100 },
      })

      act(() => liveListener?.(rows(2), 200))
      await waitFor(() => shows(2))

      rerender({ eventId: 'event-1', loaded: { participants: rows(3), version: 150 } })
      await flushPromises(false)
      shows(2)

      // A newer one does.
      rerender({ eventId: 'event-1', loaded: { participants: rows(4), version: 250 } })
      await waitFor(() => shows(4))
    })

    it('does not let a fetch overtaken by a newer message overwrite it', async () => {
      let resolveFetch: (value: PublicStartList) => void = () => {}
      vi.mocked(getStartList).mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFetch = resolve
        })
      )
      const { shows } = renderStartList()

      act(() => liveListener?.(undefined, 200))
      act(() => liveListener?.(rows(3), 300))
      await waitFor(() => shows(3))

      await act(async () => resolveFetch({ participants: rows(2), version: 250 }))

      shows(3)
    })

    it("takes the next event's rows whatever their version", async () => {
      const { rerender, shows } = renderStartList()

      act(() => liveListener?.(rows(2), 200))
      await waitFor(() => shows(2))

      rerender({ eventId: 'event-2', loaded: { participants: rows(3), version: 50 } })

      await waitFor(() => shows(3))
    })

    it("keeps a late fetch for the event the page left out of the next event's list", async () => {
      // Answers already on their way when the page moved on: they ignore the abort and still land.
      let releaseFirst: (list: PublicStartList) => void = () => {}
      const signals: Array<AbortSignal | undefined> = []
      vi.mocked(getStartList)
        .mockImplementationOnce((_eventId, _token, signal) => {
          signals.push(signal)
          return new Promise((resolve) => {
            releaseFirst = resolve
          })
        })
        .mockImplementationOnce((_eventId, _token, signal) => {
          signals.push(signal)
          return new Promise(() => {})
        })
      const { rerender, shows } = renderStartList()
      act(() => liveListener?.(undefined, 200))
      act(() => liveListener?.(undefined, 210))

      rerender({ eventId: 'event-2', loaded: { participants: rows(3), version: 50 } })
      await waitFor(() => shows(3))
      // Both of the event's fetches are cancelled, not only the latest.
      expect(signals).toHaveLength(2)
      expect(signals.map((signal) => signal?.aborted)).toEqual([true, true])

      act(() => liveListener?.(rows(4), 400))
      await waitFor(() => shows(4))

      await act(async () => releaseFirst({ participants: rows(1), version: 300 }))
      await flushPromises(false)

      shows(4)
    })

    it('ignores a live update while the address names no event', async () => {
      const { shows } = renderStartList({ eventId: undefined, loaded: { participants: rows(1) } })

      act(() => liveListener?.(undefined, 300, 'event-1'))
      act(() => liveListener?.(rows(2), 300, 'event-1'))
      await flushPromises(false)

      shows(1)
      expect(getStartList).not.toHaveBeenCalled()
    })
  })

  describe('refetching through the real http layer', () => {
    const answer = (count: number, version?: number) => {
      const headers: Record<string, string> = version === undefined ? {} : { 'X-Start-List-Version': String(version) }
      return { body: JSON.stringify(rows(count)), headers }
    }
    const heldAnswer = () => {
      let release: (count: number, version?: number) => void = () => {}
      fetchMock.mockResponseOnce(
        () =>
          new Promise((resolve) => {
            release = (count, version) => resolve(answer(count, version))
          })
      )
      return (count: number, version?: number) => release(count, version)
    }

    // Every fetch the hook starts, so a test can wait for the late ones to land before it looks.
    let fetches: Promise<unknown>[] = []
    const fetchesSettle = async () => {
      await act(async () => {
        await Promise.allSettled(fetches)
      })
      await flushPromises(false)
    }

    beforeEach(async () => {
      const { getStartList: realGetStartList } =
        await vi.importActual<typeof import('../api/registration')>('../api/registration')
      fetches = []
      fetchMock.resetMocks()
      fetchMock.enableMocks()
      vi.mocked(getStartList).mockImplementation((...args) => {
        const fetched = realGetStartList(...args)
        fetches.push(fetched)
        return fetched
      })
    })

    afterEach(() => {
      fetchMock.disableMocks()
    })

    it('gives a second stale message a request of its own instead of joining the first', async () => {
      const releaseFirst = heldAnswer()
      fetchMock.mockResponseOnce(() => Promise.resolve(answer(2, 180)))
      const { shows } = renderStartList()

      // Two saves of a list too large for one message: the second write landed after the first
      // fetch had already read.
      act(() => liveListener?.(undefined, 100))
      act(() => liveListener?.(undefined, 170))
      await waitFor(() => shows(2))

      releaseFirst(1, 150)
      await fetchesSettle()

      shows(2)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('fetches the list when an unversioned message follows a versioned one', async () => {
      fetchMock.mockResponseOnce(() => Promise.resolve(answer(4, 250)))
      const renders: number[] = []
      // The loader's answer is one object for as long as the route shows it.
      const loaded = { participants: rows(1) }
      const { result } = renderHook(() => {
        const shown = usePublicStartList('event-1', loaded)
        renders.push(shown.length)
        return shown
      })
      act(() => liveListener?.(rows(2), 200))
      await waitFor(() => expect(result.current).toHaveLength(2))

      // A Lambda from before versions, still running during a deploy, hides some rows.
      act(() => liveListener?.(rows(3), undefined))

      await waitFor(() => expect(result.current).toHaveLength(4))
      expect(fetchMock).toHaveBeenCalledTimes(1)
      // The unversioned rows themselves never showed.
      expect(renders).not.toContain(3)
    })

    it('empties the list when an unversioned unpublish is answered with not available', async () => {
      expectConsoleOutput(/reportError/)
      fetchMock.mockResponseOnce(() =>
        Promise.resolve({ body: JSON.stringify([]), headers: { 'X-Start-List-Version': '310' }, status: 404 })
      )
      const { shows } = renderStartList()
      act(() => liveListener?.(rows(2), 300))
      await waitFor(() => shows(2))

      // A Lambda from before versions unpublishes the whole list during a deploy.
      act(() => liveListener?.([], undefined))

      await waitFor(() => shows(0))
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('does not lift an unversioned fetch over the versioned rows on screen', async () => {
      // Only a GetStartList from before versions answers without one, and it read eventually
      // consistent: it may lack what the rows on screen already show.
      fetchMock.mockResponseOnce(() => Promise.resolve(answer(3)))
      const { shows } = renderStartList()
      act(() => liveListener?.(rows(2), 200))
      await waitFor(() => shows(2))

      act(() => liveListener?.(undefined, 300))
      await fetchesSettle()

      shows(2)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('shows a fetch whose stamp lags the rows on screen, since it read after them', async () => {
      // A container whose clock runs behind: the fetch started after the message, so it read after it.
      fetchMock.mockResponseOnce(() => Promise.resolve(answer(3, 290)))
      const { shows } = renderStartList()
      act(() => liveListener?.(rows(2), 300))
      await waitFor(() => shows(2))

      act(() => liveListener?.(undefined, 300))

      await waitFor(() => shows(3))
    })

    it('tells the reader once when the connection drops during a background fetch', async () => {
      expectConsoleOutput(/reportError/)
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        fetchMock.mockReject(new TypeError('Failed to fetch'))
        const { shows } = renderStartList()
        act(() => liveListener?.(rows(2), 200))

        act(() => liveListener?.(undefined, 300))
        // Long enough for any retry there is: http's own after 400 ms, and anything on top of it.
        await act(async () => vi.advanceTimersByTimeAsync(10_000))

        shows(2)
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(enqueueSnackbar).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
