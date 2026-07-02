import type { PublicConfirmedEvent } from '../types/Event'
import type { PublicRegistration } from '../types/Registration'
import { render, screen } from '@testing-library/react'
import { StartListPage } from './StartListPage'

// Mock react-router
jest.mock('react-router', () => ({
  useLoaderData: jest.fn(),
  useParams: jest.fn(),
}))

// Mock recoil
jest.mock('recoil', () => ({
  selectorFamily: jest.fn(() => 'mocked-selector'),
  useRecoilValue: jest.fn(),
}))

// Mock the useConfirmedEvent hook
jest.mock('./recoil', () => ({
  useConfirmedEvent: jest.fn(),
}))

// Mock components
jest.mock('./startListPage/EventHeader', () => ({
  EventHeader: ({ event }: { event: PublicConfirmedEvent }) => <div data-testid="event-header">{event.name}</div>,
}))

jest.mock('./startListPage/ParticipantList', () => ({
  ParticipantList: ({ participants, event }: { participants: PublicRegistration[]; event: PublicConfirmedEvent }) => (
    <div data-testid="participant-list">
      Participants: {participants.length}, Event: {event.name}
    </div>
  ),
}))

describe('StartListPage', () => {
  const mockUseLoaderData = require('react-router').useLoaderData as jest.Mock
  const mockUseParams = require('react-router').useParams as jest.Mock
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
    ;(require('./recoil').useConfirmedEvent as jest.Mock).mockReturnValue(mockEvent)
  })

  it('renders event and participants when data is available', () => {
    render(<StartListPage />)

    // Check that EventHeader is rendered
    expect(screen.getByTestId('event-header')).toBeInTheDocument()
    expect(screen.getByTestId('event-header')).toHaveTextContent('Test Name')

    // Check that ParticipantList is rendered
    expect(screen.getByTestId('participant-list')).toBeInTheDocument()
    expect(screen.getByTestId('participant-list')).toHaveTextContent('Participants: 1, Event: Test Name')
  })

  it('shows error message when event is not found', () => {
    ;(require('./recoil').useConfirmedEvent as jest.Mock).mockReturnValue(null)

    render(<StartListPage />)

    // Check that error message is rendered
    expect(screen.getByText(/Tapahtumaa event-1 ei löydy/)).toBeInTheDocument()
  })

  it('shows error message when participants list is empty', () => {
    mockUseLoaderData.mockReturnValue([])
    ;(require('./recoil').useConfirmedEvent as jest.Mock).mockReturnValue({
      ...mockEvent,
      classes: [],
      startListPublished: false,
    })
    render(<StartListPage />)

    // Check that error message is rendered
    expect(screen.getByText(/Starttilistaa ei ole saatavilla tälle tapahtumalle/)).toBeInTheDocument()
  })

  it('renders the list when participants are empty but the event has published classes', () => {
    mockUseLoaderData.mockReturnValue([])
    ;(require('./recoil').useConfirmedEvent as jest.Mock).mockReturnValue({
      ...mockEvent,
      classes: [{ class: 'AVO', date: new Date('2023-01-01') }],
      startListPublished: { AVO: true },
    })

    render(<StartListPage />)

    expect(screen.getByTestId('participant-list')).toHaveTextContent('Participants: 0, Event: Test Name')
  })

  it('shows error message when participants are empty and no class is published', () => {
    mockUseLoaderData.mockReturnValue([])
    ;(require('./recoil').useConfirmedEvent as jest.Mock).mockReturnValue({
      ...mockEvent,
      classes: [{ class: 'AVO', date: new Date('2023-01-01') }],
      startListPublished: { AVO: false },
    })

    render(<StartListPage />)

    expect(screen.getByText(/Starttilistaa ei ole saatavilla tälle tapahtumalle/)).toBeInTheDocument()
  })

  it('renders the list when at least one class is published and another is unpublished', () => {
    mockUseLoaderData.mockReturnValue([])
    ;(require('./recoil').useConfirmedEvent as jest.Mock).mockReturnValue({
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
    ;(require('./recoil').useConfirmedEvent as jest.Mock).mockReturnValue({
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
