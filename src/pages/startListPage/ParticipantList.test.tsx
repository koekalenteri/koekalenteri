import type { TFunction } from 'i18next'
import type { DayKey } from '../../types/Day'
import type { PublicConfirmedEvent } from '../../types/Event'
import type { PublicRegistration } from '../../types/Registration'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { enqueueSnackbar } from 'notistack'
import { downloadXlsx } from '../../lib/client/xlsx'
import { startListSpreadsheetRows } from '../../lib/startList'
import { freezeClockAt } from '../../test-utils/freezeClock'
import { ParticipantList } from './ParticipantList'

/**
 * The real translator. The test setup already initialises i18n, so there is no need for a hand-kept
 * copy of the strings — a parallel list drifts from the locale silently, and a renamed key fails here.
 */
const t = i18n.getFixedT('en') as TFunction

// The global mock returns keys; the result line is the thing the copied text must carry, so its parts
// read as the Finnish page writes them.
vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('../../__mocks__/react-i18next')>('../../__mocks__/react-i18next')
  const { default: real } = await vi.importActual<typeof import('i18next')>('i18next')
  const fi = real.getFixedT('fi')
  return {
    ...actual,
    useTranslation: () => {
      const base = actual.useTranslation()
      const t = (key: string, options: Record<string, unknown> = {}) => {
        switch (key) {
          case 'results.placement':
          case 'results.totals':
          case 'startList.byOrder':
          case 'startList.byTeam':
          case 'startList.noTeam':
          case 'startList.team':
            return fi(key, options)
          default:
            return base.t(key, options)
        }
      }
      return { ...base, t }
    },
  }
})
vi.mock('notistack', () => ({ enqueueSnackbar: vi.fn() }))
vi.mock('../../lib/client/xlsx', () => ({ downloadXlsx: vi.fn().mockResolvedValue(undefined) }))

const mockEnqueueSnackbar = vi.mocked(enqueueSnackbar)
const mockDownloadXlsx = vi.mocked(downloadXlsx)

// Mock the child components
vi.mock('./DateHeader', () => ({
  DateHeader: ({ date }: { date: DayKey }) => (
    <tr data-testid="date-header">
      <td>{date}</td>
    </tr>
  ),
}))

vi.mock('./ClassHeader', () => ({
  ClassHeader: ({
    classValue,
    published = true,
    numbersPublished = true,
  }: {
    classValue: string
    published?: boolean
    numbersPublished?: boolean
  }) => (
    <tr data-testid="class-header">
      <td>
        {classValue}
        {published ? '' : ' unpublished'}
        {published && !numbersPublished ? ' numbers-unpublished' : ''}
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
  RegistrationDetails: ({
    registration,
    index,
    teamPrefix,
  }: {
    registration: PublicRegistration
    index: number
    teamPrefix?: string
  }) => (
    <tr data-testid="registration-details">
      <td>
        {teamPrefix ? `${teamPrefix} ` : ''}
        {registration.dog.name} (index: {index})
      </td>
    </tr>
  ),
}))

describe('ParticipantList', () => {
  // The trial's first day: a class still at 'picked' is not ready yet. Past the trial, an explicit
  // publish would open it (KOE-1509), so the fixture's 2023 dates must not go by under the tests.
  freezeClockAt('2023-01-01')

  const writeText = vi.fn()
  const mockEvent: PublicConfirmedEvent = {
    classes: [
      {
        class: 'AVO',
        date: '2023-01-01',
        judge: { id: 1, name: 'Judge One' },
        state: 'invited',
      },
      {
        class: 'VOI',
        date: '2023-01-01',
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
    endDate: '2023-01-02',
    entryEndDate: '2022-12-31',
    entryStartDate: '2022-12-01',
    eventType: 'Test Event Type',
    id: 'event-1',
    judges: [],
    location: 'Test Location',
    modifiedAt: new Date(),
    name: 'Test Name',
    organizer: { id: 'org-1', name: 'Test Organizer' },
    places: 0,
    startDate: '2023-01-01',
    state: 'confirmed',
  }

  const createMockRegistration = (
    classValue: string,
    dogName: string,
    groupNumber: number,
    date: DayKey,
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
      dob: '2020-01-01',
      gender: 'M',
      name: dogName,
      regNo: `REG${groupNumber}`,
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
      createMockRegistration('AVO', 'Dog 1', 1, '2023-01-01', 'ap'),
      createMockRegistration('AVO', 'Dog 2', 2, '2023-01-01', 'ap'),
      createMockRegistration('VOI', 'Dog 3', 3, '2023-01-01', 'ip'),
      createMockRegistration('AVO', 'Dog 4', 4, '2023-01-02', 'ap'),
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
    const date = '2023-01-01'
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

  // KOE-674: the own classes are listed as the secretary ordered them, not alphabetically.
  it("lists a day's own classes in the event's order", () => {
    const date = '2023-01-01'
    const ownClassEvent: PublicConfirmedEvent = {
      ...mockEvent,
      classes: [
        { class: 'VET10', date, state: 'invited' },
        { class: 'DERBY', date, state: 'invited' },
      ],
      ownClasses: [
        { code: 'VET10', name: { fi: 'Veteraanit' } },
        { code: 'DERBY', name: { fi: 'Derby' } },
      ],
    }

    render(
      <ParticipantList
        participants={[
          createMockRegistration('DERBY', 'Derby Dog', 1, date),
          createMockRegistration('VET10', 'Veteran Dog', 2, date),
        ]}
        event={ownClassEvent}
      />
    )

    expect(screen.getAllByTestId('class-header').map((header) => header.textContent)).toEqual(['VET10', 'DERBY'])
    expect(screen.getAllByTestId('registration-details').map((row) => row.textContent)).toEqual([
      'Veteran Dog (index: 0)',
      'Derby Dog (index: 0)',
    ])
  })

  it('uses one date header for two groups of the same day', () => {
    const first = createMockRegistration('', 'Dog 1', 1, '2026-10-02', 'ap')
    const second = createMockRegistration('', 'Dog 2', 2, '2026-10-02', 'ap')
    first.class = undefined
    second.class = undefined
    first.group.key = '2026-10-02-ap'
    // An older copy's key named the UTC day (KOE-1541); the group is still the day's.
    second.group.key = '2026-10-01-ap'

    render(<ParticipantList participants={[first, second]} event={{ ...mockEvent, classes: [] }} />)

    expect(screen.getAllByTestId('date-header')).toHaveLength(1)
    expect(screen.getAllByTestId('time-header')).toHaveLength(1)
    expect(screen.getAllByTestId('registration-details')).toHaveLength(2)
  })

  it('renders participants with a class for a classless event', () => {
    const participant = createMockRegistration('AVO', 'Dog 1', 1, '2023-01-01', 'ap')

    render(<ParticipantList participants={[participant]} event={{ ...mockEvent, classes: [] }} />)

    expect(screen.getByText('Dog 1 (index: 0)')).toBeInTheDocument()
  })

  it('notes withheld start numbers under the date for a classless event', () => {
    // KOE-1006 feedback: a NOU has no class header to carry the note, so it hangs off the date.
    const participant = createMockRegistration('', 'Dog 1', 1, '2023-01-01', 'ap')
    participant.class = undefined

    render(
      <ParticipantList
        participants={[participant]}
        event={{ ...mockEvent, classes: [], startListPublished: true, startNumbersPublished: false, state: 'invited' }}
      />
    )

    expect(screen.getByTestId('class-header')).toHaveTextContent('numbers-unpublished')
    expect(screen.getByTestId('registration-details')).toBeInTheDocument()
  })

  it('copies the withheld-numbers note for a classless event', async () => {
    const user = userEvent.setup()
    mockClipboard()
    const participant = createMockRegistration('', 'Dog 1', 1, '2023-01-01', 'ap')
    participant.class = undefined

    render(
      <ParticipantList
        participants={[participant]}
        event={{ ...mockEvent, classes: [], startListPublished: true, startNumbersPublished: false, state: 'invited' }}
        showExportActions
      />
    )

    await user.click(screen.getByRole('button', { name: /copy|kopioi/i }))

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('(startNumbersNotPublished)'))
  })

  describe('rotation groups (KOE-1665)', () => {
    const stations = [1, 2].map((number) => ({ date: '2023-01-01' as const, id: `post-${number}`, number }))
    const rotations = [
      { class: 'AVO' as const, exercises: [{ stationId: 'post-2' }, { stationId: 'post-1' }, { stationId: 'post-1' }] },
      {
        class: 'VOI' as const,
        exercises: [{ stationId: 'post-1' }, { stationId: 'post-2' }],
        firstNumber: 1,
        lastNumber: 8,
      },
    ]
    const participants = [
      createMockRegistration('AVO', 'AVO Dog', 1, '2023-01-01', 'ap'),
      createMockRegistration('VOI', 'VOI Dog', 2, '2023-01-01', 'ap'),
    ]

    it("tells each class's groups where they start, a range only once the numbers are out", () => {
      const event = {
        ...mockEvent,
        eventType: 'NOWT',
        rotations,
        startNumbersPublished: { AVO: false, VOI: false },
        stations,
      }
      const { rerender } = render(<ParticipantList participants={participants} event={event} />)

      // The mocked translator gives the key; the line's text is rotation.test.ts's to check.
      expect(screen.getAllByText(/^event\.rotation\.startLine/)).toHaveLength(1)

      rerender(<ParticipantList participants={participants} event={{ ...event, startNumbersPublished: true }} />)
      expect(screen.getAllByText(/^event\.rotation\.startLine/)).toHaveLength(2)
    })

    it('says nothing of a stored rotation where the type is not scored at posts', () => {
      const event = { ...mockEvent, eventType: 'NOME-B', rotations, startNumbersPublished: true, stations }
      render(<ParticipantList participants={participants} event={event} />)

      expect(screen.queryByText(/^event\.rotation\.startLine/)).not.toBeInTheDocument()
    })

    it('adds nothing to a day that runs in number order', () => {
      render(<ParticipantList participants={participants} event={{ ...mockEvent, eventType: 'NOWT', stations }} />)

      expect(screen.queryByText(/^event\.rotation\.startLine/)).not.toBeInTheDocument()
    })
  })

  it('renders an unpublished event class as a header on the public start list', () => {
    const mockParticipants: PublicRegistration[] = [createMockRegistration('AVO', 'Dog 1', 1, '2023-01-01', 'ap')]

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
      createMockRegistration('AVO', 'AVO Dog', 1, '2023-01-01', 'ap'),
      createMockRegistration('VOI', 'VOI Dog', 2, '2023-01-01', 'ip'),
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
    const firstDate = '2023-01-01'
    const secondDate = '2023-01-02'
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
    // The picked class runs tomorrow: from its own day an explicit publish would open it (KOE-1638).
    const eventDate = '2023-01-02'
    const registrationDate = '2023-01-03'
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
    const mockParticipants: PublicRegistration[] = [createMockRegistration('AVO', 'Dog 1', 1, '2023-01-01', 'ap')]

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
    const mockParticipants: PublicRegistration[] = [createMockRegistration('AVO', 'Dog 1', 1, '2023-01-01', 'ap')]

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
    const mockParticipants: PublicRegistration[] = [createMockRegistration('AVO', 'Dog 1', 1, '2023-01-01', 'ap')]

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
    const mockParticipants: PublicRegistration[] = [createMockRegistration('AVO', 'Dog 1', 1, '2023-01-01', 'ap')]

    render(
      <ParticipantList
        participants={mockParticipants}
        event={{
          ...mockEvent,
          classes: [
            { class: 'AVO', date: '2023-01-01', state: 'invited' },
            { class: 'AVO', date: '2023-01-02', state: 'invited' },
          ],
          endDate: '2023-01-02',
          startListPublished: { AVO: true },
        }}
      />
    )

    expect(screen.getAllByTestId('date-header')).toHaveLength(2)
    expect(screen.getAllByTestId('class-header')).toHaveLength(2)
  })

  it('renders cancelled registrations correctly', () => {
    const mockParticipants: PublicRegistration[] = [
      createMockRegistration('AVO', 'Dog 1', 1, '2023-01-01', 'ap'),
      createMockRegistration('AVO', 'Dog 2', 2, '2023-01-01', 'ap', true),
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
    const participantWithoutParentTitles = createMockRegistration('AVO', 'Dog 1', 1, '2023-01-01', 'ap')
    participantWithoutParentTitles.dog.sire = { name: 'Sire Dog', titles: ' ' }
    participantWithoutParentTitles.dog.dam = { name: 'Dam Dog', titles: '  ' }
    const mockParticipants: PublicRegistration[] = [
      participantWithoutParentTitles,
      createMockRegistration('AVO', 'Dog 2', 2, '2023-01-01', 'ap', true),
    ]

    render(<ParticipantList participants={mockParticipants} event={mockEvent} showExportActions />)

    await user.click(screen.getByRole('button', { name: /copy|kopioi/i }))

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('AVO Judge One'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Dog 1'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('(startList.sire Sire Dog, startList.dam Dam Dog)'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('2. startList.absent'))
  })

  // KOE-674: the copied list names an own class as the page does, by its name.
  it('copies an own class under its name', async () => {
    const user = userEvent.setup()
    mockClipboard()
    const ownClassEvent: PublicConfirmedEvent = {
      ...mockEvent,
      classes: [{ class: 'DERBY', date: '2023-01-01', judge: { id: 1, name: 'Judge One' }, state: 'invited' }],
      eventType: 'WT-harjoitus',
      ownClasses: [{ code: 'DERBY', name: { fi: 'Derby-luokka' } }],
    }

    render(
      <ParticipantList
        participants={[createMockRegistration('DERBY', 'Dog 1', 1, '2023-01-01', 'ap')]}
        event={ownClassEvent}
        showExportActions
      />
    )
    await user.click(screen.getByRole('button', { name: /copy|kopioi/i }))

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Derby-luokka Judge One'))
    expect(writeText).toHaveBeenCalledWith(expect.not.stringContaining('DERBY'))
  })

  // The same class on two days, judged by different people: each day's heading names its own judge,
  // the class's day key matched to the dog's (KOE-1547).
  it("copies each day's judge under the same class on two days", async () => {
    const user = userEvent.setup()
    mockClipboard()
    const twoDays: PublicConfirmedEvent = {
      ...mockEvent,
      classes: [
        { class: 'AVO', date: '2023-01-01', judge: { id: 1, name: 'Judge One' }, state: 'invited' },
        { class: 'AVO', date: '2023-01-02', judge: { id: 4, name: 'Judge Four' }, state: 'invited' },
        { class: 'VOI', date: '2023-01-02', judge: { id: 2, name: 'Judge Two' }, state: 'invited' },
      ],
    }
    const participants = [
      createMockRegistration('AVO', 'Dog 1', 1, '2023-01-01', 'ap'),
      createMockRegistration('AVO', 'Dog 2', 2, '2023-01-02', 'ap'),
      createMockRegistration('VOI', 'Dog 3', 3, '2023-01-02', 'ap'),
    ]

    render(<ParticipantList participants={participants} event={twoDays} showExportActions />)

    await user.click(screen.getByRole('button', { name: /copy|kopioi/i }))

    expect(writeText).toHaveBeenCalledWith(
      expect.stringMatching(/AVO Judge One\n[\s\S]*AVO Judge Four\n[\s\S]*VOI Judge Two/)
    )
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining('Judge One, Judge Four'))
    // One row per dog, each under its own day and class (the React keys hold them apart).
    expect(screen.getAllByTestId('registration-details')).toHaveLength(3)
  })

  it('carries the result, its totals and the placement into the copied text', async () => {
    const user = userEvent.setup()
    mockClipboard()
    const participant = {
      ...createMockRegistration('AVO', 'Dog 1', 1, '2023-01-01', 'ap'),
      maxPoints: 80,
      percentage: 81.25,
      placement: 2,
      points: 65,
      result: 'AVO1',
    }

    render(<ParticipantList participants={[participant]} event={mockEvent} showExportActions />)

    await user.click(screen.getByRole('button', { name: /copy|kopioi/i }))

    // The points and the whole percentage too (KOE-1673): the copied text carries what the screen shows.
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('AVO1 65/80 p 81 % Sija 2'))
  })

  it('reports a failed copy instead of failing silently', async () => {
    const user = userEvent.setup()
    mockClipboard()
    writeText.mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    const mockParticipants: PublicRegistration[] = [createMockRegistration('AVO', 'Dog 1', 1, '2023-01-01', 'ap')]

    render(<ParticipantList participants={mockParticipants} event={mockEvent} showExportActions />)

    await user.click(screen.getByRole('button', { name: /copy|kopioi/i }))

    await waitFor(() => {
      // The global react-i18next mock returns keys verbatim.
      expect(mockEnqueueSnackbar).toHaveBeenCalledWith('startListCopyFailed', { variant: 'error' })
    })
    expect(screen.getByRole('button', { name: 'copyStartList' })).toBeInTheDocument()
  })

  it('copies unpublished participants and their publication status in preview mode', async () => {
    const user = userEvent.setup()
    mockClipboard()
    const mockParticipants: PublicRegistration[] = [
      createMockRegistration('AVO', 'Dog 1', 1, '2023-01-01', 'ap'),
      createMockRegistration('VOI', 'Dog 2', 2, '2023-01-02', 'ip'),
    ]

    render(
      <ParticipantList
        participants={mockParticipants}
        event={{
          ...mockEvent,
          // VOI is picked and runs tomorrow: from its own day an explicit publish would open it (KOE-1638).
          classes: mockEvent.classes.map((eventClass) =>
            eventClass.class === 'VOI' ? { ...eventClass, date: '2023-01-02', state: 'picked' } : eventClass
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
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\n2\..*Dog 2 REG2 startList\.born/))
  })

  it('does not export unpublished participants from the public start list', async () => {
    const user = userEvent.setup()
    const mockParticipants: PublicRegistration[] = [
      createMockRegistration('AVO', 'AVO Dog', 1, '2023-01-01', 'ap'),
      createMockRegistration('VOI', 'VOI Dog', 2, '2023-01-01', 'ip'),
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
    const participant = createMockRegistration('AVO', 'Dog; One', 1, '2023-01-01', 'ap')
    const rows = startListSpreadsheetRows([participant], mockEvent, t, 'en')

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
        'Points',
        'Maximum',
        '%',
        'Additional marks',
        'Place',
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
        '',
        '',
        '',
        '',
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

  // KOE-1715: the public sees a team competition by team. The rows carry their teams; the event does not.
  describe('by team', () => {
    const inTeam = (reg: PublicRegistration, code: string, name?: string): PublicRegistration => ({
      ...reg,
      team: { code, ...(name ? { name } : {}), number: Number.parseInt(code, 10) },
    })
    const rows = (texts = screen.getAllByTestId('registration-details')) => texts.map((row) => row.textContent)
    const teamParticipants = () => [
      inTeam(createMockRegistration('AVO', 'Bella', 1, '2023-01-01'), '1B', 'Team Finland 1'),
      createMockRegistration('AVO', 'Dora', 2, '2023-01-01'),
      inTeam(createMockRegistration('AVO', 'Aapo', 3, '2023-01-01'), '1A', 'Team Finland 1'),
      inTeam(createMockRegistration('AVO', 'Cesar', 4, '2023-01-01'), '2A'),
      createMockRegistration('AVO', 'Eetu', 5, '2023-01-01', undefined, true),
      inTeam(createMockRegistration('AVO', 'Fanni', 6, '2023-01-02'), '2B'),
    ]

    it('offers no choice on a list without teams', () => {
      render(
        <ParticipantList participants={[createMockRegistration('AVO', 'Dog 1', 1, '2023-01-01')]} event={mockEvent} />
      )

      expect(screen.queryByRole('button', { name: 'Joukkueittain' })).not.toBeInTheDocument()
      expect(screen.getAllByTestId('class-header')).not.toHaveLength(0)
    })

    it('opens by team: each day its teams in number order, the dogs by letter, then the dogs in no team', () => {
      render(<ParticipantList participants={teamParticipants()} event={mockEvent} />)

      expect(screen.getByRole('button', { name: 'Joukkueittain' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getAllByTestId('date-header').map((header) => header.textContent)).toEqual([
        '2023-01-01',
        '2023-01-02',
      ])
      expect(screen.getByText('Joukkue 1')).toBeInTheDocument()
      expect(screen.getByText('Team Finland 1')).toBeInTheDocument()
      // Team 2 is shown under both days, with that day's dog; the cancelled dog is not shown.
      expect(screen.getAllByText('Joukkue 2')).toHaveLength(2)
      expect(screen.getAllByText('Ei joukkuetta')).toHaveLength(1)
      expect(rows()).toEqual([
        '1A Aapo (index: 0)',
        '1B Bella (index: 1)',
        '2A Cesar (index: 0)',
        'Dora (index: 0)',
        '2B Fanni (index: 0)',
      ])
      expect(screen.queryByTestId('class-header')).not.toBeInTheDocument()
      expect(screen.queryByTestId('cancelled-registration')).not.toBeInTheDocument()
    })

    // KOE-1720: the series is named from the public event, the row carrying only its id.
    describe('in series', () => {
      const inSeries = (reg: PublicRegistration, code: string, seriesId?: string): PublicRegistration => ({
        ...reg,
        team: { code, number: Number.parseInt(code, 10), ...(seriesId ? { seriesId } : {}) },
      })
      const seriesEvent: PublicConfirmedEvent = {
        ...mockEvent,
        teamCompetition: {
          series: [
            { id: 'open', name: { en: 'Open', fi: 'Avoin' } },
            { id: 'breed', name: { fi: 'Rotu' } },
          ],
        },
      }
      const seriesParticipants = () => [
        inSeries(createMockRegistration('AVO', 'Aapo', 1, '2023-01-01'), '1A', 'breed'),
        inSeries(createMockRegistration('AVO', 'Bella', 2, '2023-01-01'), '2A', 'open'),
        inSeries(createMockRegistration('AVO', 'Cesar', 3, '2023-01-01'), '3A'),
      ]

      it('heads each series with its name, the teams in no series first', () => {
        render(<ParticipantList participants={seriesParticipants()} event={seriesEvent} />)

        expect(screen.getAllByTestId('team-series-header').map((header) => header.textContent)).toEqual([
          'Avoin',
          'Rotu',
        ])
        expect(rows()).toEqual(['3A Cesar (index: 0)', '2A Bella (index: 0)', '1A Aapo (index: 0)'])
      })

      it('copies the series headings', async () => {
        const user = userEvent.setup()
        mockClipboard()
        render(<ParticipantList participants={seriesParticipants()} event={seriesEvent} showExportActions />)

        await user.click(screen.getByRole('button', { name: /copyStartList/ }))

        expect(writeText).toHaveBeenCalledWith(
          expect.stringMatching(/Joukkue 3\n3A [\s\S]*?\n\nAvoin\n\nJoukkue 2\n2A [\s\S]*?\n\nRotu\n\nJoukkue 1\n1A /)
        )
      })
    })

    it('names the class in front of the code where the day teams mix classes', () => {
      render(
        <ParticipantList
          participants={[
            inTeam(createMockRegistration('AVO', 'Aapo', 1, '2023-01-01'), '1A'),
            inTeam(createMockRegistration('VOI', 'Bella', 2, '2023-01-01'), '1B'),
            createMockRegistration('VOI', 'Dora', 3, '2023-01-01'),
          ]}
          event={mockEvent}
        />
      )

      expect(rows()).toEqual(['AVO 1A Aapo (index: 0)', 'VOI 1B Bella (index: 1)', 'VOI Dora (index: 0)'])
    })

    it('shows the running order as today when that view is chosen', async () => {
      const user = userEvent.setup()
      render(<ParticipantList participants={teamParticipants()} event={mockEvent} />)

      await user.click(screen.getByRole('button', { name: 'Suoritusjärjestyksessä' }))

      expect(screen.queryByText('Joukkue 1')).not.toBeInTheDocument()
      expect(screen.getAllByTestId('class-header')).not.toHaveLength(0)
      expect(screen.getByTestId('cancelled-registration')).toBeInTheDocument()
      expect(rows()).toEqual([
        'Bella (index: 0)',
        'Dora (index: 1)',
        'Aapo (index: 2)',
        'Cesar (index: 3)',
        'Fanni (index: 0)',
      ])
    })

    // KOE-1006: before the venue draw the order is not final, and the team view has no class heading
    // to say so; the day carries the note instead.
    describe('before the numbers are published', () => {
      const undrawn: PublicConfirmedEvent = {
        ...mockEvent,
        startListPublished: true,
        startNumbersPublished: false,
        state: 'invited',
      }

      it('notes it under the day', () => {
        render(<ParticipantList participants={teamParticipants()} event={undrawn} />)

        expect(screen.getAllByText('AVO (startNumbersNotPublished)')).toHaveLength(2)
      })

      it('notes it under the date of a classless event', () => {
        const classless = teamParticipants().map((reg) => ({ ...reg, class: undefined }))

        render(<ParticipantList participants={classless} event={{ ...undrawn, classes: [] }} />)

        expect(screen.getAllByText('(startNumbersNotPublished)')).toHaveLength(2)
      })

      it('copies the note', async () => {
        const user = userEvent.setup()
        mockClipboard()
        render(<ParticipantList participants={teamParticipants()} event={undrawn} showExportActions />)

        await user.click(screen.getByRole('button', { name: /copyStartList/ }))

        expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^[^\n]+\nAVO \(startNumbersNotPublished\)\n/))
      })
    })

    it('copies the class in front of the code where the day mixes classes', async () => {
      const user = userEvent.setup()
      mockClipboard()
      render(
        <ParticipantList
          participants={[
            inTeam(createMockRegistration('AVO', 'Aapo', 1, '2023-01-01'), '1A'),
            createMockRegistration('VOI', 'Dora', 2, '2023-01-01'),
          ]}
          event={mockEvent}
          showExportActions
        />
      )

      await user.click(screen.getByRole('button', { name: /copyStartList/ }))

      expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\nAVO 1A 1\. [^\n]*Aapo/))
      expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\nVOI 2\. [^\n]*Dora/))
    })

    it('keeps the view when the chosen one is clicked again', async () => {
      const user = userEvent.setup()
      render(<ParticipantList participants={teamParticipants()} event={mockEvent} />)

      await user.click(screen.getByRole('button', { name: 'Joukkueittain' }))

      expect(screen.getByRole('button', { name: 'Joukkueittain' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByText('Joukkue 1')).toBeInTheDocument()
    })

    it('copies the view on screen', async () => {
      const user = userEvent.setup()
      mockClipboard()
      render(<ParticipantList participants={teamParticipants()} event={mockEvent} showExportActions />)

      await user.click(screen.getByRole('button', { name: /copyStartList/ }))
      await user.click(screen.getByRole('button', { name: 'Suoritusjärjestyksessä' }))
      await user.click(screen.getByRole('button', { name: /startListCopied/ }))

      expect(writeText).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(/Joukkue 1\nTeam Finland 1\n1A 3\. [^\n]*Aapo[\s\S]*Joukkue 2\n2A 4\. [^\n]*Cesar/)
      )
      expect(writeText).toHaveBeenNthCalledWith(1, expect.stringMatching(/Ei joukkuetta\n2\. [^\n]*Dora/))
      expect(writeText).toHaveBeenNthCalledWith(1, expect.not.stringContaining('startList.absent'))
      expect(writeText).toHaveBeenNthCalledWith(2, expect.not.stringContaining('Joukkue'))
      expect(writeText).toHaveBeenNthCalledWith(2, expect.stringContaining('5. startList.absent'))
    })
  })
})
