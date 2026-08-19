import type { PublicConfirmedEvent } from '../types/Event'
import type { PublicRegistration } from '../types/Registration'
import { render, screen } from '@testing-library/react'
import * as jotai from 'jotai'
import * as router from 'react-router'
import { StartListPage } from './StartListPage'
import * as pageState from './state'

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
    mockUseParams.mockReturnValue({ id: 'event-1' })
    mockUseLoaderData.mockReturnValue(mockParticipants)
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
    mockUseLoaderData.mockReturnValue([])
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
    mockUseLoaderData.mockReturnValue([])
    ;(pageState.useConfirmedEvent as import('vitest').Mock).mockReturnValue({
      ...mockEvent,
      classes: [{ class: 'AVO', date: new Date('2023-01-01') }],
      startListPublished: { AVO: true },
    })

    render(<StartListPage />)

    expect(screen.getByTestId('participant-list')).toHaveTextContent('Participants: 0, Event: Test Name')
  })

  it('shows error message when participants are empty and no class is published', () => {
    mockUseLoaderData.mockReturnValue([])
    ;(pageState.useConfirmedEvent as import('vitest').Mock).mockReturnValue({
      ...mockEvent,
      classes: [{ class: 'AVO', date: new Date('2023-01-01') }],
      startListPublished: { AVO: false },
    })

    render(<StartListPage />)

    expect(screen.getByText('error.startListNotAvailable')).toBeInTheDocument()
  })

  it('renders the list when at least one class is published and another is unpublished', () => {
    mockUseLoaderData.mockReturnValue([])
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
    mockUseLoaderData.mockReturnValue([])
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
