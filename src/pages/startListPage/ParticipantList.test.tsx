import type { TFunction } from 'i18next'
import type { PublicConfirmedEvent } from '../../types/Event'
import type { PublicRegistration } from '../../types/Registration'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { downloadXlsx } from '../../lib/client/xlsx'
import { startListSpreadsheetRows } from '../../lib/startList'
import { ParticipantList } from './ParticipantList'

/**
 * The real translator. The test setup already initialises i18n, so there is no need for a hand-kept
 * copy of the strings — a parallel list drifts from the locale silently, and a renamed key fails here.
 */
const t = i18n.getFixedT('en') as TFunction

vi.mock('../../lib/client/xlsx', () => ({ downloadXlsx: vi.fn() }))

const mockDownloadXlsx = vi.mocked(downloadXlsx)

// Mock the child components
vi.mock('./DateHeader', () => ({
  DateHeader: ({ date }: { date: Date }) => (
    <tr data-testid="date-header">
      <td>{date.toISOString()}</td>
    </tr>
  ),
}))

vi.mock('./ClassHeader', () => ({
  ClassHeader: ({ classValue, published = true }: { classValue: string; published?: boolean }) => (
    <tr data-testid="class-header">
      <td>
        {classValue}
        {published ? '' : ' unpublished'}
      </td>
    </tr>
  ),
}))

vi.mock('./TimeHeader', () => ({
  TimeHeader: ({ time }: { time: string }) => (
    <tr data-testid="time-header">
      <td>{time}</td>
    </tr>
  ),
}))

vi.mock('./CancelledRegistration', () => ({
  CancelledRegistration: ({ groupNumber }: { groupNumber: number }) => (
    <tr data-testid="cancelled-registration">
      <td>{groupNumber}</td>
    </tr>
  ),
}))

vi.mock('./RegistrationDetails', () => ({
  RegistrationDetails: ({ registration, index }: { registration: PublicRegistration; index: number }) => (
    <tr data-testid="registration-details">
      <td>
        {registration.dog.name} (index: {index})
      </td>
    </tr>
  ),
}))

describe('ParticipantList', () => {
  const writeText = vi.fn()
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
    mockDownloadXlsx.mockClear()
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

  it('renders participants with a class for a classless event', () => {
    const participant = createMockRegistration('AVO', 'Dog 1', 1, new Date('2023-01-01'), 'ap')

    render(<ParticipantList participants={[participant]} event={{ ...mockEvent, classes: [] }} />)

    expect(screen.getByText('Dog 1 (index: 0)')).toBeInTheDocument()
  })

  it('renders an unpublished event class as a header on the public start list', () => {
    const mockParticipants: PublicRegistration[] = [
      createMockRegistration('AVO', 'Dog 1', 1, new Date('2023-01-01'), 'ap'),
    ]

    render(
      <ParticipantList
        participants={mockParticipants}
        event={{ ...mockEvent, startListPublished: { AVO: true, VOI: false } }}
      />
    )

    expect(screen.getByText('VOI unpublished')).toBeInTheDocument()
  })

  it('does not render groups or participants for an unpublished class on the public start list', () => {
    const mockParticipants: PublicRegistration[] = [
      createMockRegistration('AVO', 'AVO Dog', 1, new Date('2023-01-01'), 'ap'),
      createMockRegistration('VOI', 'VOI Dog', 2, new Date('2023-01-01'), 'ip'),
    ]

    render(
      <ParticipantList
        participants={mockParticipants}
        event={{ ...mockEvent, startListPublished: { AVO: true, VOI: false } }}
      />
    )

    expect(screen.getByText('VOI unpublished')).toBeInTheDocument()
    expect(screen.queryByText('VOI Dog (index: 0)')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('time-header')).toHaveLength(1)
  })

  it('does not show a later unpublished class date when the same class is published on another date', () => {
    const firstDate = new Date('2023-01-01')
    const secondDate = new Date('2023-01-02')
    const mockParticipants: PublicRegistration[] = [
      createMockRegistration('AVO', 'Day 1 Dog', 1, firstDate, 'ap'),
      createMockRegistration('AVO', 'Day 2 Dog', 2, secondDate, 'ip'),
    ]

    render(
      <ParticipantList
        participants={mockParticipants}
        event={{
          ...mockEvent,
          classes: [
            { class: 'AVO', date: firstDate, state: 'started' },
            { class: 'AVO', date: secondDate, state: 'picked' },
          ],
          startListPublished: { AVO: true },
        }}
      />
    )

    expect(screen.getByText('Day 1 Dog (index: 0)')).toBeInTheDocument()
    expect(screen.queryByText(/Day 2 Dog/)).not.toBeInTheDocument()
    expect(screen.getAllByTestId('class-header').map((header) => header.textContent)).toEqual([
      'AVO',
      'AVO unpublished',
    ])
    expect(screen.getAllByTestId('time-header')).toHaveLength(1)
  })

  it('uses the matching class state when a registration date is missing from the event classes', () => {
    const eventDate = new Date('2023-01-01')
    const registrationDate = new Date('2023-01-02')
    const participant = createMockRegistration('AVO', 'Dog 1', 1, registrationDate, 'ap')

    render(
      <ParticipantList
        participants={[participant]}
        event={{
          ...mockEvent,
          classes: [{ class: 'AVO', date: eventDate, state: 'picked' }],
          startListPublished: { AVO: true },
        }}
      />
    )

    expect(screen.queryByText('Dog 1 (index: 0)')).not.toBeInTheDocument()
    expect(screen.getByText('AVO unpublished')).toBeInTheDocument()
  })

  it('renders unpublished empty classes in preview mode', () => {
    const mockParticipants: PublicRegistration[] = [
      createMockRegistration('AVO', 'Dog 1', 1, new Date('2023-01-01'), 'ap'),
    ]

    render(
      <ParticipantList
        participants={mockParticipants}
        event={{ ...mockEvent, startListPublished: { AVO: false, VOI: false } }}
        includeUnpublished
      />
    )

    expect(screen.getByText('VOI unpublished')).toBeInTheDocument()
  })

  it('marks unpublished classes with participants in preview mode', () => {
    const mockParticipants: PublicRegistration[] = [
      createMockRegistration('AVO', 'Dog 1', 1, new Date('2023-01-01'), 'ap'),
    ]

    render(
      <ParticipantList
        participants={mockParticipants}
        event={{ ...mockEvent, startListPublished: { AVO: false, VOI: false } }}
        includeUnpublished
      />
    )

    expect(screen.getByText('AVO unpublished')).toBeInTheDocument()
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

    render(<ParticipantList participants={mockParticipants} event={mockEvent} showExportActions />)

    await user.click(screen.getByRole('button', { name: /copy|kopioi/i }))

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('AVO Judge One'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Dog 1'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('(i. Sire Dog, e. Dam Dog)'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('2. POISSA'))
  })

  it('copies unpublished participants and their publication status in preview mode', async () => {
    const user = userEvent.setup()
    mockClipboard()
    const mockParticipants: PublicRegistration[] = [
      createMockRegistration('AVO', 'Dog 1', 1, new Date('2023-01-01'), 'ap'),
      createMockRegistration('VOI', 'Dog 2', 2, new Date('2023-01-01'), 'ip'),
    ]

    render(
      <ParticipantList
        participants={mockParticipants}
        event={{
          ...mockEvent,
          classes: mockEvent.classes.map((eventClass) =>
            eventClass.class === 'VOI' ? { ...eventClass, state: 'picked' } : eventClass
          ),
          startListPublished: { AVO: true, VOI: true },
        }}
        includeUnpublished
        showExportActions
      />
    )

    await user.click(screen.getByRole('button', { name: /copy|kopioi/i }))

    expect(screen.getByText('VOI unpublished')).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('VOI Judge Two, Judge Three (startListNotPublished)')
    )
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\n2\..*Dog 2 REG2 s\./))
  })

  it('does not export unpublished participants from the public start list', async () => {
    const user = userEvent.setup()
    const mockParticipants: PublicRegistration[] = [
      createMockRegistration('AVO', 'AVO Dog', 1, new Date('2023-01-01'), 'ap'),
      createMockRegistration('VOI', 'VOI Dog', 2, new Date('2023-01-01'), 'ip'),
    ]

    render(
      <ParticipantList
        participants={mockParticipants}
        event={{ ...mockEvent, startListPublished: { AVO: true, VOI: false } }}
        showExportActions
      />
    )

    await user.click(screen.getByRole('button', { name: 'downloadStartList' }))

    expect(mockDownloadXlsx).toHaveBeenCalledWith(
      expect.objectContaining({ rows: expect.arrayContaining([expect.arrayContaining(['CH AVO Dog'])]) })
    )
    expect(mockDownloadXlsx).toHaveBeenCalledWith(
      expect.objectContaining({ rows: expect.not.arrayContaining([expect.arrayContaining(['CH VOI Dog'])]) })
    )
  })

  it('formats the public start list for an Excel spreadsheet', () => {
    const participant = createMockRegistration('AVO', 'Dog; One', 1, new Date('2023-01-01'), 'ap')
    const rows = startListSpreadsheetRows([participant], mockEvent, t)

    expect(rows).toEqual([
      [
        'Date',
        'Time',
        'Class',
        'Number',
        'Dog',
        'Registration number',
        'Date of birth',
        'Sire',
        'Dam',
        'Owner',
        'Handler',
        'Breeder',
        'Result',
      ],
      [
        new Date(2023, 0, 1, 12),
        'morning',
        'AVO',
        1,
        'CH Dog; One',
        'REG1',
        new Date(2020, 0, 1, 12),
        'CH Sire Dog',
        'CH Dam Dog',
        'Test Owner',
        'Test Handler',
        'Test Breeder',
        '',
      ],
    ])
  })

  it('downloads the start list with the event-based file name', async () => {
    const user = userEvent.setup()

    render(<ParticipantList participants={[]} event={mockEvent} showExportActions />)

    await user.click(screen.getByRole('button', { name: 'downloadStartList' }))

    expect(mockDownloadXlsx).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'starttilista-20230101-Test Event Type.xlsx' })
    )
  })

  it('hides export actions by default', () => {
    render(<ParticipantList participants={[]} event={mockEvent} />)

    expect(screen.queryByRole('button', { name: /copy|kopioi/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'downloadStartList' })).not.toBeInTheDocument()
  })
})
