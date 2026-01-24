import type { PublicConfirmedEvent } from '../types/Event'
import type { PublicRegistration } from '../types/Registration'
import { render, screen } from '@testing-library/react'
import { useLoaderData, useParams } from 'react-router'
import { useRecoilValue } from 'recoil'
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

// Mock the confirmedEventSelector
jest.mock('./recoil', () => ({
  confirmedEventSelector: jest.fn(() => 'mocked-selector'),
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
    state: 'confirmed',
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
    ;(useParams as jest.Mock).mockReturnValue({ id: 'event-1' })
    ;(useRecoilValue as jest.Mock).mockReturnValue(mockEvent)
    ;(useLoaderData as jest.Mock).mockReturnValue(mockParticipants)
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
    ;(useRecoilValue as jest.Mock).mockReturnValue(null)

    render(<StartListPage />)

    // Check that error message is rendered
    expect(screen.getByText(/Tapahtumaa event-1 ei löydy/)).toBeInTheDocument()
  })

  it('shows error message when participants list is empty', () => {
    ;(useLoaderData as jest.Mock).mockReturnValue([])

    render(<StartListPage />)

    // Check that error message is rendered
    expect(screen.getByText(/Starttilistaa ei ole saatavilla tälle tapahtumalle/)).toBeInTheDocument()
  })
})
