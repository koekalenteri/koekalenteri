import type { PublicConfirmedEvent } from '../../types/Event'
import type { PublicRegistration } from '../../types/Registration'
import { render, screen } from '@testing-library/react'
import { ParticipantList } from './ParticipantList'

// Mock the child components
jest.mock('./DateHeader', () => ({
  DateHeader: ({ date }: { date: Date }) => (
    <tr data-testid="date-header">
      <td>{date.toISOString()}</td>
    </tr>
  ),
}))

jest.mock('./ClassHeader', () => ({
  ClassHeader: ({ classValue }: { classValue: string }) => (
    <tr data-testid="class-header">
      <td>{classValue}</td>
    </tr>
  ),
}))

jest.mock('./TimeHeader', () => ({
  TimeHeader: ({ time }: { time: string }) => (
    <tr data-testid="time-header">
      <td>{time}</td>
    </tr>
  ),
}))

jest.mock('./CancelledRegistration', () => ({
  CancelledRegistration: ({ groupNumber }: { groupNumber: number }) => (
    <tr data-testid="cancelled-registration">
      <td>{groupNumber}</td>
    </tr>
  ),
}))

jest.mock('./RegistrationDetails', () => ({
  RegistrationDetails: ({ registration, index }: { registration: PublicRegistration; index: number }) => (
    <tr data-testid="registration-details">
      <td>
        {registration.dog.name} (index: {index})
      </td>
    </tr>
  ),
}))

describe('ParticipantList', () => {
  const mockEvent: PublicConfirmedEvent = {
    classes: [
      {
        class: 'AVO',
        date: new Date('2023-01-01'),
        judge: { id: 1, name: 'Judge One' },
      },
      {
        class: 'VOI',
        date: new Date('2023-01-01'),
        judge: [
          { id: 2, name: 'Judge Two' },
          { id: 3, name: 'Judge Three' },
        ],
      },
    ],
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

  const createMockRegistration = (
    classValue: string,
    dogName: string,
    groupNumber: number,
    date: Date,
    time: 'ap' | 'ip' | 'kp',
    cancelled = false
  ): PublicRegistration => ({
    breeder: 'Test Breeder',
    cancelled,
    class: classValue,
    dog: {
      breedCode: '111',
      dam: {
        name: 'Dam Dog',
        titles: 'CH',
      },
      dob: new Date('2020-01-01'),
      gender: 'M',
      name: dogName,
      regNo: `REG${groupNumber}`,
      results: [],
      sire: {
        name: 'Sire Dog',
        titles: 'CH',
      },
      titles: 'CH',
    },
    group: {
      date,
      key: `group-${groupNumber}`,
      number: groupNumber,
      time,
    },
    handler: 'Test Handler',
    owner: 'Test Owner',
    ownerHandles: false,
  })

  it('renders participants list correctly', () => {
    const mockParticipants: PublicRegistration[] = [
      createMockRegistration('AVO', 'Dog 1', 1, new Date('2023-01-01'), 'ap'),
      createMockRegistration('AVO', 'Dog 2', 2, new Date('2023-01-01'), 'ap'),
      createMockRegistration('VOI', 'Dog 3', 3, new Date('2023-01-01'), 'ip'),
      createMockRegistration('AVO', 'Dog 4', 4, new Date('2023-01-02'), 'ap'),
    ]

    render(<ParticipantList participants={mockParticipants} event={mockEvent} />)

    // Check that date headers are rendered
    expect(screen.getAllByTestId('date-header')).toHaveLength(2)

    // Check that class headers are rendered
    expect(screen.getAllByTestId('class-header')).toHaveLength(3)

    // Check that time headers are rendered
    expect(screen.getAllByTestId('time-header')).toHaveLength(3)

    // Check that registration details are rendered
    expect(screen.getAllByTestId('registration-details')).toHaveLength(4)
  })

  it('renders cancelled registrations correctly', () => {
    const mockParticipants: PublicRegistration[] = [
      createMockRegistration('AVO', 'Dog 1', 1, new Date('2023-01-01'), 'ap'),
      createMockRegistration('AVO', 'Dog 2', 2, new Date('2023-01-01'), 'ap', true),
    ]

    render(<ParticipantList participants={mockParticipants} event={mockEvent} />)

    // Check that cancelled registration is rendered
    expect(screen.getByTestId('cancelled-registration')).toBeInTheDocument()
    expect(screen.getByTestId('cancelled-registration')).toHaveTextContent('2')

    // Check that regular registration is rendered
    expect(screen.getByTestId('registration-details')).toBeInTheDocument()
  })
})
