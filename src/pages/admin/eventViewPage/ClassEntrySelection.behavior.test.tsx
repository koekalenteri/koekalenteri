import type { ReactNode } from 'react'
import type { Registration, RegistrationDate } from '../../../types'
import { act, render, screen } from '@testing-library/react'
import { Provider } from 'jotai'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { eventWithStaticDatesAnd3Classes } from '../../../__mockData__/events'
import { registrationWithStaticDates, registrationWithStaticDatesCancelled } from '../../../__mockData__/registrations'
import { GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE } from '../../../lib/registration'
import { flushPromises, renderWithUserEvents } from '../../../test-utils/utils'
import ClassEntrySelection from './ClassEntrySelection'

const mockSaveGroups = vi.fn().mockResolvedValue(undefined)
const activeEvent = {
  ...eventWithStaticDatesAnd3Classes,
  endDate: new Date('2099-12-31'),
}
const mockedGroups: RegistrationDate[] = [
  { date: eventWithStaticDatesAnd3Classes.startDate, key: '2021-02-10-ap', time: 'ap' } as RegistrationDate,
  { date: eventWithStaticDatesAnd3Classes.startDate, key: '2021-02-10-ip', time: 'ip' } as RegistrationDate,
]

let mockLastCallbacks: any
let mockDroppableProps: any[] = []

vi.mock('../../../hooks/useAdminEventRegistrationDates', () => ({
  useAdminEventRegistrationDates: () => mockedGroups,
}))

vi.mock('../../../hooks/useAdminEventRegistrationGroups', () => ({
  useAdminEventRegistrationGroups: () => mockedGroups,
}))

vi.mock('../state/registrations/actions', () => ({
  useAdminRegistrationActions: () => ({
    saveGroups: mockSaveGroups,
  }),
}))

vi.mock('./classEntrySelection/useEntryHandlers', () => ({
  useEntryHandlers: () => ({
    handleCancel: vi.fn(),
    handleCellClick: vi.fn(),
    handleDoubleClick: vi.fn(),
    handleOpen: vi.fn(),
    handleRefund: vi.fn(),
    handleSelectionModeChange: vi.fn(),
  }),
}))

vi.mock('./classEntrySelection/useDnDHandlers', () => ({
  useDnDHandlers: () => ({
    handleDrop: () => vi.fn(),
    handleReject: () => vi.fn(),
  }),
}))

vi.mock('./classEntrySelection/useClassEntrySelectionColumns', () => ({
  useClassEntrySelectionColumns: (_available: unknown, _event: unknown, callbacks: unknown) => {
    mockLastCallbacks = callbacks
    return {
      cancelledColumns: [{ field: 'id', sortable: false }],
      entryColumns: [{ field: 'id', sortable: false }],
      participantColumns: [{ field: 'id', sortable: false }],
    }
  },
}))

vi.mock('./classEntrySelection/DroppableDataGrid', () => ({
  default: (props: any) => {
    mockDroppableProps.push(props)
    return <div data-testid="droppable-grid" />
  },
}))
vi.mock('../../components/StyledDataGrid', () => ({ default: () => <div data-testid="header-grid" /> }))
vi.mock('./classEntrySelection/UnlockArrange', () => ({ default: () => <div data-testid="unlock-arrange" /> }))
vi.mock('./classEntrySelection/GroupHeader', () => ({ default: () => <div /> }))
vi.mock('./classEntrySelection/NoRowsOverlay', () => ({ default: () => <div /> }))
vi.mock('../../components/NullComponent', () => ({ NullComponent: () => <div /> }))

vi.mock('./MoveToGroupDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <button onClick={() => props.onMove('2021-02-10-ip')} type="button">
        move-group
      </button>
    ) : null,
}))

vi.mock('./MoveToPositionDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <>
        <button onClick={() => props.onMove(2.5)} type="button">
          move-position
        </button>
        <div data-testid="move-position-max">{props.positions?.join(',')}</div>
      </>
    ) : null,
}))

vi.mock('./SendMessageDialog', () => ({
  default: (props: any) => (props.open ? <div>send-message-open</div> : null),
}))

function Wrapper(props: { readonly children?: ReactNode }) {
  return (
    <Provider>
      <SnackbarProvider>
        <ConfirmProvider>
          <Suspense fallback={<>loading...</>}>{props.children}</Suspense>
        </ConfirmProvider>
      </SnackbarProvider>
    </Provider>
  )
}

describe('ClassEntrySelection behavior coverage', () => {
  beforeAll(() => vi.useFakeTimers())

  beforeEach(() => {
    mockSaveGroups.mockClear()
    mockLastCallbacks = undefined
    mockDroppableProps = []
  })

  afterEach(async () => {
    await act(async () => {
      vi.runOnlyPendingTimers()
    })
  })

  afterAll(() => vi.useRealTimers())

  it('executes move to reserve callback and saves reserve placement', async () => {
    const registrations: Registration[] = [
      {
        ...registrationWithStaticDates,
        group: { date: mockedGroups[0].date, key: '2021-02-10-ap', number: 1, time: 'ap' as const },
        id: 'target-participant',
      },
      {
        ...registrationWithStaticDates,
        group: { key: GROUP_KEY_RESERVE, number: 1 },
        id: 'already-reserve-1',
      },
    ]

    render(
      <ClassEntrySelection
        event={activeEvent}
        eventClass="ALO"
        registrations={registrations}
        setOpen={vi.fn()}
        setCancelOpen={vi.fn()}
        setRefundOpen={vi.fn()}
        setSelectedRegistrationId={vi.fn()}
      />,
      { wrapper: Wrapper }
    )

    await flushPromises()
    await act(async () => {
      await mockLastCallbacks.moveToReserve('target-participant')
    })

    expect(mockSaveGroups).toHaveBeenCalledWith(eventWithStaticDatesAnd3Classes.id, [
      expect.objectContaining({
        group: expect.objectContaining({ key: GROUP_KEY_RESERVE }),
        id: 'target-participant',
      }),
    ])
  })

  it('prevents moving registrations after the event has ended', async () => {
    const setOpen = vi.fn()
    const setCancelOpen = vi.fn()
    const registration = {
      ...registrationWithStaticDates,
      group: { date: mockedGroups[0].date, key: '2021-02-10-ap', number: 1, time: 'ap' as const },
      id: 'participant-1',
    }

    render(
      <ClassEntrySelection
        event={{ ...eventWithStaticDatesAnd3Classes, state: 'invited' }}
        eventClass="ALO"
        registrations={[registration]}
        setCancelOpen={setCancelOpen}
        setOpen={setOpen}
        state="invited"
      />,
      { wrapper: Wrapper }
    )
    await flushPromises()

    expect(mockLastCallbacks.movementDisabled).toBe(true)
    expect(mockLastCallbacks.actionsDisabled).toBe(true)
    await act(async () => {
      mockLastCallbacks.openEditDialog(registration.id)
      mockLastCallbacks.cancelRegistration(registration.id)
      mockLastCallbacks.sendMessage(registration.id)
      await mockLastCallbacks.moveToReserve(registration.id)
      mockLastCallbacks.moveToGroup(registration.id)
      mockLastCallbacks.moveToPosition(registration.id)
    })

    expect(mockSaveGroups).not.toHaveBeenCalled()
    expect(setOpen).not.toHaveBeenCalled()
    expect(setCancelOpen).not.toHaveBeenCalled()
    expect(screen.queryByText('send-message-open')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'move-group' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'move-position' })).not.toBeInTheDocument()
    expect(mockDroppableProps).not.toHaveLength(0)
    mockDroppableProps.forEach((props) => {
      expect(props.canDrop({ groupKey: GROUP_KEY_RESERVE })).toBe(false)
      expect(props.slotProps.row.draggable).toBe(false)
    })
  })

  it('opens dialogs through callbacks and executes group/position move handlers', async () => {
    const registrations: Registration[] = [
      {
        ...registrationWithStaticDates,
        dates: [
          { date: mockedGroups[0].date, time: 'ap' as const },
          { date: mockedGroups[1].date, time: 'ip' as const },
        ],
        group: { date: mockedGroups[0].date, key: '2021-02-10-ap', number: 1, time: 'ap' as const },
        id: 'participant-1',
      },
      {
        ...registrationWithStaticDates,
        group: { date: mockedGroups[1].date, key: '2021-02-10-ip', number: 2, time: 'ip' as const },
        id: 'participant-2',
      },
      {
        ...registrationWithStaticDatesCancelled,
        group: { key: GROUP_KEY_CANCELLED, number: 1 },
        id: 'cancelled-1',
      },
      {
        ...registrationWithStaticDates,
        dates: [
          { date: mockedGroups[0].date, time: 'ap' as const },
          { date: mockedGroups[1].date, time: 'ip' as const },
        ],
        group: { key: GROUP_KEY_RESERVE, number: 1 },
        id: 'reserve-1',
      },
    ]

    const { user } = renderWithUserEvents(
      <ClassEntrySelection event={activeEvent} eventClass="ALO" registrations={registrations} />,
      { wrapper: Wrapper },
      { advanceTimers: vi.advanceTimersByTime }
    )
    await flushPromises()

    await act(async () => {
      mockLastCallbacks.moveToGroup('participant-1')
    })
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'move-group' }))

    expect(mockSaveGroups).toHaveBeenCalledWith(eventWithStaticDatesAnd3Classes.id, [
      expect.objectContaining({
        group: expect.objectContaining({ key: '2021-02-10-ip', time: 'ip' }),
        id: 'participant-1',
      }),
    ])

    await act(async () => {
      mockLastCallbacks.moveToPosition('reserve-1')
    })
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'move-position' }))

    expect(mockSaveGroups).toHaveBeenCalledWith(eventWithStaticDatesAnd3Classes.id, [
      expect.objectContaining({
        group: expect.objectContaining({ key: '2021-02-10-ip', time: 'ip' }),
        id: 'reserve-1',
      }),
    ])

    await act(async () => {
      mockLastCallbacks.moveToPosition('participant-1')
    })
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'move-position' }))

    expect(mockSaveGroups).toHaveBeenCalledWith(eventWithStaticDatesAnd3Classes.id, [
      expect.objectContaining({
        group: expect.objectContaining({ key: '2021-02-10-ip', time: 'ip' }),
        id: 'participant-1',
      }),
    ])

    await act(async () => {
      mockLastCallbacks.moveToParticipants('reserve-1')
    })
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'move-group' }))

    expect(mockSaveGroups).toHaveBeenCalledWith(eventWithStaticDatesAnd3Classes.id, [
      expect.objectContaining({
        group: expect.objectContaining({ key: '2021-02-10-ip', time: 'ip' }),
        id: 'reserve-1',
      }),
    ])

    await act(async () => {
      mockLastCallbacks.sendMessage('participant-1')
    })
    await flushPromises()
    expect(screen.getByText('send-message-open')).toBeInTheDocument()
  })

  it('uses participant count plus one as max position for reserve moves', async () => {
    const registrations: Registration[] = [
      {
        ...registrationWithStaticDates,
        group: { date: mockedGroups[0].date, key: '2021-02-10-ap', number: 1, time: 'ap' as const },
        id: 'participant-1',
      },
      {
        ...registrationWithStaticDates,
        group: { date: mockedGroups[0].date, key: '2021-02-10-ap', number: 2, time: 'ap' as const },
        id: 'participant-2',
      },
      {
        ...registrationWithStaticDates,
        group: { key: GROUP_KEY_RESERVE, number: 1 },
        id: 'reserve-1',
      },
    ]

    const { user } = renderWithUserEvents(
      <ClassEntrySelection event={activeEvent} eventClass="ALO" registrations={registrations} />,
      { wrapper: Wrapper },
      { advanceTimers: vi.advanceTimersByTime }
    )
    await flushPromises()

    await act(async () => {
      mockLastCallbacks.moveToPosition('reserve-1')
    })
    await flushPromises()

    expect(screen.getByTestId('move-position-max')).toHaveTextContent('1,2,3')
  })

  it('shows NOU group rule warnings to the secretary', async () => {
    const registrations: Registration[] = [
      {
        ...registrationWithStaticDates,
        dog: { ...registrationWithStaticDates.dog, gender: 'M' },
        group: { date: mockedGroups[0].date, key: '2021-02-10-ap', number: 1, time: 'ap' as const },
        id: 'participant-1',
      },
      {
        ...registrationWithStaticDates,
        dog: { ...registrationWithStaticDates.dog, gender: 'M', regNo: 'FI99999/21' },
        group: { date: mockedGroups[0].date, key: '2021-02-10-ap', number: 2, time: 'ap' as const },
        id: 'participant-2',
      },
    ]

    render(
      <ClassEntrySelection
        event={{ ...activeEvent, eventType: 'NOU' }}
        eventClass="ALO"
        registrations={registrations}
      />,
      { wrapper: Wrapper }
    )
    await flushPromises()

    expect(screen.getByText('eventManagement.groupRules.singleGender.male')).toBeInTheDocument()
    expect(screen.getByText('eventManagement.groupRules.duplicateHandler count, email, name')).toBeInTheDocument()
  })

  it('uses only position 1 when there are no participant dogs yet', async () => {
    const registrations: Registration[] = [
      {
        ...registrationWithStaticDates,
        group: { key: GROUP_KEY_RESERVE, number: 1 },
        id: 'reserve-1',
      },
    ]

    const { user } = renderWithUserEvents(
      <ClassEntrySelection event={activeEvent} eventClass="ALO" registrations={registrations} />,
      { wrapper: Wrapper },
      { advanceTimers: vi.advanceTimersByTime }
    )
    await flushPromises()

    await act(async () => {
      mockLastCallbacks.moveToPosition('reserve-1')
    })
    await flushPromises()

    expect(screen.getByTestId('move-position-max')).toHaveTextContent('1')
  })
})
