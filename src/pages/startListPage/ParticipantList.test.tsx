import type { PublicConfirmedEvent } from '../../types/Event'
import type { PublicRegistration } from '../../types/Registration'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  ClassHeader: ({ classValue, published = true }: { classValue: string; published?: boolean }) => (
    <tr data-testid="class-header">
      <td>
        {classValue}
        {published ? '' : ' unpublished'}
      </td>
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
  const writeText = jest.fn()
  const mockEvent: PublicConfirmedEvent = {
    classes: [
      {
        class: 'AVO',
        date: new Date('2023-01-01'),
        judge: { id: 1, name: 'Judge One' },
        state: 'invited',
      },
      {
        class: 'VOI',
        date: new Date('2023-01-01'),
        judge: [
          { id: 2, name: 'Judge Two' },
          { id: 3, name: 'Judge Three' },
        ],
        state: 'invited',
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
    time?: 'ap' | 'ip' | 'kp',
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

  const mockClipboard = () => {
    writeText.mockClear()
    writeText.mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText,
      },
    })
  }

  beforeEach(() => {
    mockClipboard()
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

  it('does not repeat class headers when an event has no time groups', () => {
    const date = new Date('2023-01-01')
    const mockParticipants: PublicRegistration[] = [
      createMockRegistration('AVO', 'AVO Dog 1', 1, date),
      createMockRegistration('VOI', 'VOI Dog 1', 1, date),
      createMockRegistration('AVO', 'AVO Dog 2', 2, date),
      createMockRegistration('VOI', 'VOI Dog 2', 2, date),
    ]

    render(<ParticipantList participants={mockParticipants} event={mockEvent} />)

    expect(screen.getAllByTestId('class-header').map((header) => header.textContent)).toEqual(['AVO', 'VOI'])
    expect(screen.queryByTestId('time-header')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('registration-details').map((row) => row.textContent)).toEqual([
      'AVO Dog 1 (index: 0)',
      'AVO Dog 2 (index: 1)',
      'VOI Dog 1 (index: 0)',
      'VOI Dog 2 (index: 1)',
    ])
  })

  it('uses one date header for different instants on the same local event date', () => {
    const firstInstant = new Date('2026-10-01T21:00:00.000Z')
    const secondInstant = new Date('2026-10-01T22:00:00.000Z')
    const first = createMockRegistration('', 'Dog 1', 1, firstInstant, 'ap')
    const second = createMockRegistration('', 'Dog 2', 2, secondInstant, 'ap')
    first.class = undefined
    second.class = undefined
    first.group.key = '2026-10-02-ap'
    second.group.key = '2026-10-01-ap'

    render(<ParticipantList participants={[first, second]} event={{ ...mockEvent, classes: [] }} />)

    expect(screen.getAllByTestId('date-header')).toHaveLength(1)
    expect(screen.getAllByTestId('time-header')).toHaveLength(1)
    expect(screen.getAllByTestId('registration-details')).toHaveLength(2)
  })

  it('does not render unpublished event classes missing from the public start list', () => {
    const mockParticipants: PublicRegistration[] = [
      createMockRegistration('AVO', 'Dog 1', 1, new Date('2023-01-01'), 'ap'),
    ]

    render(
      <ParticipantList
        participants={mockParticipants}
        event={{ ...mockEvent, startListPublished: { AVO: true, VOI: false } }}
      />
    )

    expect(screen.queryByText('VOI unpublished')).not.toBeInTheDocument()
  })

  it('renders a published event class even when it has no public participants', () => {
    const mockParticipants: PublicRegistration[] = [
      createMockRegistration('AVO', 'Dog 1', 1, new Date('2023-01-01'), 'ap'),
    ]

    render(
      <ParticipantList
        participants={mockParticipants}
        event={{ ...mockEvent, startListPublished: { AVO: true, VOI: true } }}
      />
    )

    expect(screen.getByText('VOI')).toBeInTheDocument()
    expect(screen.queryByText('VOI unpublished')).not.toBeInTheDocument()
  })

  it('renders an empty same-class entry on another date', () => {
    const mockParticipants: PublicRegistration[] = [
      createMockRegistration('AVO', 'Dog 1', 1, new Date('2023-01-01'), 'ap'),
    ]

    render(
      <ParticipantList
        participants={mockParticipants}
        event={{
          ...mockEvent,
          classes: [
            { class: 'AVO', date: new Date('2023-01-01'), state: 'invited' },
            { class: 'AVO', date: new Date('2023-01-02'), state: 'invited' },
          ],
          endDate: new Date('2023-01-02'),
          startListPublished: { AVO: true },
        }}
      />
    )

    expect(screen.getAllByTestId('date-header')).toHaveLength(2)
    expect(screen.getAllByTestId('class-header')).toHaveLength(2)
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

  it('copies a plain text start list', async () => {
    const user = userEvent.setup()
    mockClipboard()
    const participantWithoutParentTitles = createMockRegistration('AVO', 'Dog 1', 1, new Date('2023-01-01'), 'ap')
    participantWithoutParentTitles.dog.sire = { name: 'Sire Dog', titles: ' ' }
    participantWithoutParentTitles.dog.dam = { name: 'Dam Dog', titles: '  ' }
    const mockParticipants: PublicRegistration[] = [
      participantWithoutParentTitles,
      createMockRegistration('AVO', 'Dog 2', 2, new Date('2023-01-01'), 'ap', true),
    ]

    render(<ParticipantList participants={mockParticipants} event={mockEvent} />)

    await user.click(screen.getByRole('button', { name: /copy|kopioi/i }))

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('AVO Judge One'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Dog 1'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('(i. Sire Dog, e. Dam Dog)'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('2. PERUTTU'))
  })
})
