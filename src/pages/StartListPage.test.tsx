import type { PublicConfirmedEvent } from '../types/Event'
import type { PublicRegistration } from '../types/Registration'

import { useLoaderData, useParams } from 'react-router'
import { render, screen } from '@testing-library/react'
import { useRecoilValue } from 'recoil'

import { StartListPage } from './StartListPage'

// Mock react-router
jest.mock('react-router', () => ({
  useLoaderData: jest.fn(),
  useParams: jest.fn(),
}))

// Mock recoil
jest.mock('recoil', () => ({
  useRecoilValue: jest.fn(),
  selectorFamily: jest.fn(() => 'mocked-selector'),
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
    id: 'event-1',
    eventType: 'Test Event Type',
    location: 'Test Location',
    name: 'Test Name',
    startDate: new Date('2023-01-01'),
    endDate: new Date('2023-01-02'),
    entryStartDate: new Date('2022-12-01'),
    entryEndDate: new Date('2022-12-31'),
    state: 'confirmed',
    classes: [],
    cost: 0,
    costMember: 0,
    description: '',
    judges: [],
    organizer: { id: 'org-1', name: 'Test Organizer' },
    places: 0,
    createdAt: new Date(),
    modifiedAt: new Date(),
  }

  const mockParticipants: PublicRegistration[] = [
    {
      class: 'AVO',
      cancelled: false,
      dog: {
        name: 'Test Dog',
        titles: 'CH',
        regNo: 'REG123',
        breedCode: '111',
        gender: 'M',
        dob: new Date('2020-01-01'),
        sire: {
          name: 'Sire Dog',
          titles: 'CH',
        },
        dam: {
          name: 'Dam Dog',
          titles: 'CH',
        },
        results: [],
      },
      group: {
        number: 123,
        key: 'group-123',
        date: new Date('2023-01-01'),
        time: 'ap',
      },
      owner: 'Test Owner',
      handler: 'Test Handler',
      breeder: 'Test Breeder',
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
