import type { PublicConfirmedEvent } from '../types/Event'
import type { PublicRegistration } from '../types/Registration'
import { act, render, screen, waitFor } from '@testing-library/react'
import * as jotai from 'jotai'
import * as router from 'react-router'
import { getStartList } from '../api/registration'
import { flushPromises } from '../test-utils/utils'
import { StartListPage } from './StartListPage'
import * as pageState from './state'

vi.mock('../api/registration', () => ({ getStartList: vi.fn() }))

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

    expect(getStartList).toHaveBeenCalledWith('event-1')
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

    it('drops an unversioned message once a versioned one has been shown', async () => {
      render(<StartListPage />)

      act(() => liveListener?.(rows(2), 200))
      await waitFor(() => shows(2))

      // A Lambda still running the code from before versions, during a deploy.
      act(() => liveListener?.(rows(3), undefined))

      await flushPromises(false)
      shows(2)
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
