import type { PublicConfirmedEvent } from '../types/Event'
import type { PublicRegistration, PublicStartList } from '../types/Registration'
import { act, render, screen, waitFor } from '@testing-library/react'
import * as jotai from 'jotai'
import { enqueueSnackbar } from 'notistack'
import * as router from 'react-router'
import { getStartList } from '../api/registration'
import { expectConsoleOutput } from '../test-utils/consoleGuard'
import fetchMock from '../test-utils/fetchMock'
import { flushPromises } from '../test-utils/utils'
import { StartListPage, startListLoader } from './StartListPage'
import * as pageState from './state'

vi.mock('../api/registration', () => ({ getStartList: vi.fn() }))
vi.mock('notistack', async (importOriginal) => ({
  ...(await importOriginal<typeof import('notistack')>()),
  enqueueSnackbar: vi.fn(),
}))

// The page is tested through the subscription's own contract: the hook hands it either the rows the
// server composed or, when they did not fit in one message, nothing at all, with the server time they
// were read.
let liveListener: ((participants: PublicRegistration[] | undefined, version?: number) => void) | undefined
vi.mock('../hooks/usePublicStartListSubscription', () => ({
  usePublicStartListSubscription: (_eventId: string | undefined, listener: typeof liveListener) => {
    liveListener = listener
  },
}))

// Mock react-router
vi.mock('react-router', () => ({
  useLoaderData: vi.fn(),
  useParams: vi.fn(),
}))

vi.mock('jotai', async () => ({
  ...(await vi.importActual<typeof import('jotai')>('jotai')),
  useAtomValue: vi.fn(),
}))

// Mock the useConfirmedEvent hook
vi.mock('./state', async () => ({
  useConfirmedEvent: vi.fn(),
  userAtom: (await vi.importActual<typeof import('jotai')>('jotai')).atom(null),
}))

// Mock components
vi.mock('./startListPage/EventHeader', () => ({
  EventHeader: ({ event }: { event: PublicConfirmedEvent }) => <div data-testid="event-header">{event.name}</div>,
}))

vi.mock('./startListPage/ParticipantList', () => ({
  ParticipantList: ({
    participants,
    event,
    showExportActions,
  }: {
    participants: PublicRegistration[]
    event: PublicConfirmedEvent
    showExportActions: boolean
  }) => (
    <div data-testid="participant-list">
      Participants: {participants.length}, Event: {event.name}, Exports: {String(showExportActions)}
    </div>
  ),
}))

vi.mock('./components/LoadingIndicator', () => ({
  __esModule: true,
  default: () => <div role="progressbar" />,
}))

describe('StartListPage', () => {
  const mockUseLoaderData = router.useLoaderData as import('vitest').Mock
  const mockUseParams = router.useParams as import('vitest').Mock
  const mockUseAtomValue = jotai.useAtomValue as import('vitest').Mock
  const mockEvent: PublicConfirmedEvent = {
    classes: [],
    cost: 0,
    costMember: 0,
    createdAt: new Date(),
    description: '',
    endDate: new Date('2023-01-02'),
    entryEndDate: new Date('2022-12-31'),
    entryStartDate: new Date('2022-12-01'),
    eventType: 'Test Event Type',
    id: 'event-1',
    judges: [],
    location: 'Test Location',
    modifiedAt: new Date(),
    name: 'Test Name',
    organizer: { id: 'org-1', name: 'Test Organizer' },
    places: 0,
    startDate: new Date('2023-01-01'),
    startListPublished: true,
    state: 'invited',
  }

  const mockParticipants: PublicRegistration[] = [
    {
      breeder: 'Test Breeder',
      cancelled: false,
      class: 'AVO',
      dog: {
        breedCode: '111',
        dam: {
          name: 'Dam Dog',
          titles: 'CH',
        },
        dob: new Date('2020-01-01'),
        gender: 'M',
        name: 'Test Dog',
        regNo: 'REG123',
        results: [],
        sire: {
          name: 'Sire Dog',
          titles: 'CH',
        },
        titles: 'CH',
      },
      group: {
        date: new Date('2023-01-01'),
        key: 'group-123',
        number: 123,
        time: 'ap',
      },
      handler: 'Test Handler',
      owner: 'Test Owner',
      ownerHandles: false,
    },
  ]

  beforeEach(() => {
    liveListener = undefined
    vi.mocked(getStartList).mockReset()
    vi.mocked(enqueueSnackbar).mockClear()
    mockUseParams.mockReturnValue({ id: 'event-1' })
    mockUseLoaderData.mockReturnValue({ participants: mockParticipants })
    mockUseAtomValue.mockReturnValue(null)
    ;(pageState.useConfirmedEvent as import('vitest').Mock).mockReturnValue(mockEvent)
  })

  it('renders event and participants when data is available', () => {
    render(<StartListPage />)

    // Check that EventHeader is rendered
    expect(screen.getByTestId('event-header')).toBeInTheDocument()
    expect(screen.getByTestId('event-header')).toHaveTextContent('Test Name')

    // Check that ParticipantList is rendered
    expect(screen.getByTestId('participant-list')).toBeInTheDocument()
    expect(screen.getByTestId('participant-list')).toHaveTextContent('Participants: 1, Event: Test Name')
    expect(screen.getByTestId('participant-list')).toHaveTextContent('Exports: false')
  })

  it('takes the rows the socket brings without fetching them again (KOE-1358)', async () => {
    render(<StartListPage />)

    act(() => liveListener?.([...mockParticipants, { ...mockParticipants[0], class: 'ALO' }]))

    await waitFor(() => expect(screen.getByTestId('participant-list')).toHaveTextContent('Participants: 2'))
    expect(getStartList).not.toHaveBeenCalled()

    // And withdrawing them just as much: the rows on screen still carry numbers that are no longer public.
    act(() => liveListener?.(mockParticipants))

    await waitFor(() => expect(screen.getByTestId('participant-list')).toHaveTextContent('Participants: 1'))
    expect(getStartList).not.toHaveBeenCalled()
  })

  it('fetches the list when the rows did not fit in one message', async () => {
    vi.mocked(getStartList).mockResolvedValueOnce({
      participants: [...mockParticipants, { ...mockParticipants[0], class: 'ALO' }],
    })
    render(<StartListPage />)

    act(() => liveListener?.(undefined))

    expect(getStartList).toHaveBeenCalledWith('event-1', undefined, expect.any(AbortSignal))
    await waitFor(() => expect(screen.getByTestId('participant-list')).toHaveTextContent('Participants: 2'))
  })

  describe('when live updates and fetches race each other (KOE-1516)', () => {
    const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ ...mockParticipants[0], index }))
    const shows = (count: number) =>
      expect(screen.getByTestId('participant-list')).toHaveTextContent(`Participants: ${count},`)

    it('keeps the newer rows when an older message arrives after them', async () => {
      render(<StartListPage />)

      act(() => liveListener?.(rows(2), 200))
      await waitFor(() => shows(2))

      // The slower sender read before the newer one: its rows still show what was just hidden.
      act(() => liveListener?.(rows(3), 100))

      await flushPromises(false)
      shows(2)
    })

    it('takes a message read in the same millisecond, so the later arrival wins', async () => {
      render(<StartListPage />)

      act(() => liveListener?.(rows(2), 200))
      act(() => liveListener?.(rows(3), 200))

      await waitFor(() => shows(3))
    })

    it('does not let a loader result older than the live rows on screen overwrite them', async () => {
      mockUseLoaderData.mockReturnValue({ participants: rows(1), version: 100 })
      const { rerender } = render(<StartListPage />)

      act(() => liveListener?.(rows(2), 200))
      await waitFor(() => shows(2))

      mockUseLoaderData.mockReturnValue({ participants: rows(3), version: 150 })
      rerender(<StartListPage />)

      await flushPromises(false)
      shows(2)

      // A newer one does.
      mockUseLoaderData.mockReturnValue({ participants: rows(4), version: 250 })
      rerender(<StartListPage />)

      await waitFor(() => shows(4))
    })

    it('does not let a fetch overtaken by a newer message overwrite it', async () => {
      let resolveFetch: (value: { participants: PublicRegistration[]; version: number }) => void = () => {}
      vi.mocked(getStartList).mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFetch = resolve
        })
      )
      render(<StartListPage />)

      act(() => liveListener?.(undefined, 200))
      act(() => liveListener?.(rows(3), 300))
      await waitFor(() => shows(3))

      await act(async () => resolveFetch({ participants: rows(2), version: 250 }))

      shows(3)
    })

    it("takes the next event's rows whatever their version", async () => {
      const { rerender } = render(<StartListPage />)

      act(() => liveListener?.(rows(2), 200))
      await waitFor(() => shows(2))

      mockUseParams.mockReturnValue({ id: 'event-2' })
      mockUseLoaderData.mockReturnValue({ participants: rows(3), version: 50 })
      rerender(<StartListPage />)

      await waitFor(() => shows(3))
    })
  })

  describe('refetching through the real http layer (KOE-1516)', () => {
    const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ ...mockParticipants[0], index }))
    const shows = (count: number) =>
      expect(screen.getByTestId('participant-list')).toHaveTextContent(`Participants: ${count},`)
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

    // Every fetch the page starts, so a test can wait for the late ones to land before it looks.
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
      render(<StartListPage />)

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

    it("keeps a late fetch for the event the page left out of the next event's list", async () => {
      // An answer already on its way when the page moved on: it ignores the abort and still lands.
      let releaseFirst: (list: PublicStartList) => void = () => {}
      let firstSignal: AbortSignal | undefined
      vi.mocked(getStartList).mockImplementationOnce((_eventId, _token, signal) => {
        firstSignal = signal
        return new Promise((resolve) => {
          releaseFirst = resolve
        })
      })
      const { rerender } = render(<StartListPage />)
      act(() => liveListener?.(undefined, 200))

      mockUseParams.mockReturnValue({ id: 'event-2' })
      mockUseLoaderData.mockReturnValue({ participants: rows(3), version: 50 })
      rerender(<StartListPage />)
      await waitFor(() => shows(3))
      expect(firstSignal?.aborted).toBe(true)

      act(() => liveListener?.(rows(4), 400))
      await waitFor(() => shows(4))

      await act(async () => releaseFirst({ participants: rows(1), version: 300 }))
      await flushPromises(false)

      shows(4)
    })

    it('fetches the list when an unversioned message follows a versioned one', async () => {
      fetchMock.mockResponseOnce(() => Promise.resolve(answer(4, 250)))
      render(<StartListPage />)
      act(() => liveListener?.(rows(2), 200))
      await waitFor(() => shows(2))

      // A Lambda from before versions, still running during a deploy, hides some rows.
      act(() => liveListener?.(rows(3), undefined))

      await waitFor(() => shows(4))
      expect(fetchMock).toHaveBeenCalledTimes(1)
      // The unversioned rows themselves never showed.
      expect(screen.queryByText(/Participants: 3,/)).not.toBeInTheDocument()
    })

    it('empties the list when an unversioned unpublish is answered with not available', async () => {
      expectConsoleOutput(/reportError/)
      fetchMock.mockResponseOnce(() =>
        Promise.resolve({
          body: JSON.stringify([]),
          headers: { 'X-Start-List-Version': '310' },
          status: 404,
        })
      )
      render(<StartListPage />)
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
      render(<StartListPage />)
      act(() => liveListener?.(rows(2), 200))
      await waitFor(() => shows(2))

      act(() => liveListener?.(undefined, 300))
      await fetchesSettle()

      shows(2)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('tells the reader once when the connection drops during a background fetch', async () => {
      expectConsoleOutput(/reportError/)
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        fetchMock.mockReject(new TypeError('Failed to fetch'))
        render(<StartListPage />)
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

    it('ignores a live update while the address names no event', async () => {
      mockUseParams.mockReturnValue({})
      render(<StartListPage />)

      act(() => liveListener?.(undefined, 300))
      act(() => liveListener?.(rows(2), 300))
      await flushPromises(false)

      shows(1)
      expect(getStartList).not.toHaveBeenCalled()
    })
  })

  it('loads the list of the event in the address, and nothing without one', async () => {
    vi.mocked(getStartList).mockResolvedValueOnce({ participants: mockParticipants, version: 5 })

    await expect(startListLoader({ params: { id: 'event-1' } })).resolves.toEqual({
      participants: mockParticipants,
      version: 5,
    })
    await expect(startListLoader({ params: {} })).resolves.toEqual({ participants: [] })
    expect(getStartList).toHaveBeenCalledTimes(1)
  })

  it('shows export actions to a global admin', () => {
    mockUseAtomValue.mockReturnValue({ admin: true, roles: {} })

    render(<StartListPage />)

    expect(screen.getByTestId('participant-list')).toHaveTextContent('Exports: true')
  })

  it('shows export actions to a user with access to the event organizer', () => {
    mockUseAtomValue.mockReturnValue({ admin: false, roles: { 'org-1': 'secretary' } })

    render(<StartListPage />)

    expect(screen.getByTestId('participant-list')).toHaveTextContent('Exports: true')
  })

  it('hides export actions from a user with access to another organizer', () => {
    mockUseAtomValue.mockReturnValue({ admin: false, roles: { 'org-2': 'admin' } })

    render(<StartListPage />)

    expect(screen.getByTestId('participant-list')).toHaveTextContent('Exports: false')
  })

  it('shows error message when event is not found', () => {
    ;(pageState.useConfirmedEvent as import('vitest').Mock).mockReturnValue(null)

    render(<StartListPage />)

    // Check that error message is rendered
    expect(screen.getByText('error.eventNotFound')).toBeInTheDocument()
  })

  it('shows loading indicator while event is loading', () => {
    ;(pageState.useConfirmedEvent as import('vitest').Mock).mockReturnValue(undefined)

    render(<StartListPage />)

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByText('error.eventNotFound')).not.toBeInTheDocument()
  })

  it('shows error message when participants list is empty', () => {
    mockUseLoaderData.mockReturnValue({ participants: [] })
    ;(pageState.useConfirmedEvent as import('vitest').Mock).mockReturnValue({
      ...mockEvent,
      classes: [],
      startListPublished: false,
    })
    render(<StartListPage />)

    // Check that error message is rendered
    expect(screen.getByText('error.startListNotAvailable')).toBeInTheDocument()
  })

  it('renders the list when participants are empty but the event has published classes', () => {
    mockUseLoaderData.mockReturnValue({ participants: [] })
    ;(pageState.useConfirmedEvent as import('vitest').Mock).mockReturnValue({
      ...mockEvent,
      classes: [{ class: 'AVO', date: new Date('2023-01-01') }],
      startListPublished: { AVO: true },
    })

    render(<StartListPage />)

    expect(screen.getByTestId('participant-list')).toHaveTextContent('Participants: 0, Event: Test Name')
  })

  it('shows error message when participants are empty and no class is published', () => {
    mockUseLoaderData.mockReturnValue({ participants: [] })
    ;(pageState.useConfirmedEvent as import('vitest').Mock).mockReturnValue({
      ...mockEvent,
      classes: [{ class: 'AVO', date: new Date('2023-01-01') }],
      startListPublished: { AVO: false },
    })

    render(<StartListPage />)

    expect(screen.getByText('error.startListNotAvailable')).toBeInTheDocument()
  })

  it('renders the list when at least one class is published and another is unpublished', () => {
    mockUseLoaderData.mockReturnValue({ participants: [] })
    ;(pageState.useConfirmedEvent as import('vitest').Mock).mockReturnValue({
      ...mockEvent,
      classes: [
        { class: 'AVO', date: new Date('2023-01-01') },
        { class: 'VOI', date: new Date('2023-01-01') },
      ],
      startListPublished: { AVO: true, VOI: false },
    })

    render(<StartListPage />)

    expect(screen.getByTestId('participant-list')).toHaveTextContent('Participants: 0, Event: Test Name')
  })

  it('renders the list when a class is invited and published even if the event is only confirmed', () => {
    mockUseLoaderData.mockReturnValue({ participants: [] })
    ;(pageState.useConfirmedEvent as import('vitest').Mock).mockReturnValue({
      ...mockEvent,
      classes: [
        { class: 'AVO', date: new Date('2023-01-01'), state: 'invited' },
        { class: 'VOI', date: new Date('2023-01-01'), state: 'picked' },
      ],
      startListPublished: { AVO: true, VOI: true },
      state: 'confirmed',
    })

    render(<StartListPage />)

    expect(screen.getByTestId('participant-list')).toHaveTextContent('Participants: 0, Event: Test Name')
  })
})
