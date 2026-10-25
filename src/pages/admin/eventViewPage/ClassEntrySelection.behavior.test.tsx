import type { ComponentProps, ReactNode } from 'react'
import type { ConfirmedEvent, Registration, RegistrationDate } from '@/types'
import type DroppableDataGrid from './classEntrySelection/DroppableDataGrid'
import type { useClassEntrySelectionColumns } from './classEntrySelection/useClassEntrySelectionColumns'
import { act, render, screen } from '@testing-library/react'
import { Provider } from 'jotai'
import { ConfirmProvider } from 'material-ui-confirm'
import { Suspense } from 'react'
import { eventWithStaticDatesAnd3Classes } from '@/__mockData__/events'
import { registrationWithStaticDates, registrationWithStaticDatesCancelled } from '@/__mockData__/registrations'
import { GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE } from '@/lib/registration'
import { noonOfFinnishDay } from '@/test-utils/finnishDays'
import { flushPromises, renderWithUserEvents } from '@/test-utils/utils'
import AppSnackbarProvider from '../../components/AppSnackbarProvider'
import ClassEntrySelection from './ClassEntrySelection'

const mockSaveGroups = vi.fn().mockResolvedValue(undefined)
const mockHandleOpen = vi.fn()
const mockHandleCancel = vi.fn()
const activeEvent: ConfirmedEvent = {
  ...eventWithStaticDatesAnd3Classes,
  endDate: '2099-12-31',
}
const mockedGroups: RegistrationDate[] = [
  { date: eventWithStaticDatesAnd3Classes.startDate, key: '2021-02-10-ap', time: 'ap' } as RegistrationDate,
  { date: eventWithStaticDatesAnd3Classes.startDate, key: '2021-02-10-ip', time: 'ip' } as RegistrationDate,
]

type Callbacks = NonNullable<Parameters<typeof useClassEntrySelectionColumns>[2]>
type CallbackName = {
  [K in keyof Callbacks]-?: NonNullable<Callbacks[K]> extends (id: string) => void ? K : never
}[keyof Callbacks]

let mockLastCallbacks: Callbacks | undefined
let mockDroppableProps: ComponentProps<typeof DroppableDataGrid>[] = []

/** The callback the columns were last given, failing the test when the page did not pass it. */
const callback = (name: CallbackName) => {
  const fn = mockLastCallbacks?.[name]
  if (!fn) throw new Error(`no ${name} callback was passed to the columns`)
  return fn
}

vi.mock('@/hooks/useAdminEventRegistrationDates', () => ({
  useAdminEventRegistrationDates: () => mockedGroups,
}))

vi.mock('@/hooks/useAdminEventRegistrationGroups', () => ({
  useAdminEventRegistrationGroups: () => mockedGroups,
}))

vi.mock('../state/registrations/actions', () => ({
  useAdminRegistrationActions: () => ({
    saveGroups: mockSaveGroups,
  }),
}))

vi.mock('./classEntrySelection/useEntryHandlers', () => ({
  useEntryHandlers: () => ({
    handleCancel: mockHandleCancel,
    handleCellClick: vi.fn(),
    handleDoubleClick: vi.fn(),
    handleOpen: mockHandleOpen,
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
  useClassEntrySelectionColumns: (_available: unknown, _event: unknown, callbacks: Callbacks) => {
    mockLastCallbacks = callbacks
    return {
      cancelledColumns: [{ field: 'id', sortable: false }],
      entryColumns: [{ field: 'id', sortable: false }],
      participantColumns: [{ field: 'id', sortable: false }],
    }
  },
}))

vi.mock('./classEntrySelection/DroppableDataGrid', () => ({
  default: (props: ComponentProps<typeof DroppableDataGrid>) => {
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
  default: (props: ComponentProps<typeof import('./MoveToGroupDialog').default>) =>
    props.open ? (
      <button onClick={() => props.onMove('2021-02-10-ip')} type="button">
        move-group
      </button>
    ) : null,
}))

vi.mock('./MoveToPositionDialog', () => ({
  default: (props: ComponentProps<typeof import('./MoveToPositionDialog').default>) =>
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
  default: (props: ComponentProps<typeof import('./SendMessageDialog').default>) =>
    props.open ? <div>send-message-open</div> : null,
}))

function Wrapper(props: { readonly children?: ReactNode }) {
  return (
    <Provider>
      <AppSnackbarProvider>
        <ConfirmProvider>
          <Suspense fallback={<>loading...</>}>{props.children}</Suspense>
        </ConfirmProvider>
      </AppSnackbarProvider>
    </Provider>
  )
}

describe('ClassEntrySelection behavior coverage', () => {
  beforeAll(() => vi.useFakeTimers())

  beforeEach(() => {
    mockSaveGroups.mockClear()
    mockHandleOpen.mockClear()
    mockHandleCancel.mockClear()
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
        setSelectedRegistrationId={vi.fn()}
      />,
      { wrapper: Wrapper }
    )

    await flushPromises()
    await act(async () => {
      callback('moveToReserve')('target-participant')
    })

    expect(mockSaveGroups).toHaveBeenCalledWith(eventWithStaticDatesAnd3Classes.id, [
      expect.objectContaining({
        group: expect.objectContaining({ key: GROUP_KEY_RESERVE }),
        id: 'target-participant',
      }),
    ])
  })

  it('prevents changing registrations after the event has ended, but still opens them', async () => {
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
        state="invited"
      />,
      { wrapper: Wrapper }
    )
    await flushPromises()

    expect(mockLastCallbacks?.movementDisabled).toBe(true)
    expect(mockLastCallbacks?.actionsDisabled).toBe(true)
    await act(async () => {
      callback('openEditDialog')(registration.id)
      callback('cancelRegistration')(registration.id)
      callback('sendMessage')(registration.id)
      callback('moveToReserve')(registration.id)
      callback('moveToGroup')(registration.id)
      callback('moveToPosition')(registration.id)
    })

    expect(mockSaveGroups).not.toHaveBeenCalled()
    expect(mockHandleCancel).not.toHaveBeenCalled()
    // Opening is reading, not acting: the entry stays reachable, and the dialog locks its own
    // fields instead (KOE-1388). Every list keeps its double click for the same reason.
    expect(mockHandleOpen).toHaveBeenCalledWith(registration.id)
    expect(mockDroppableProps.every((props) => props.onRowDoubleClick)).toBe(true)
    expect(screen.queryByText('send-message-open')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'move-group' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'move-position' })).not.toBeInTheDocument()
    expect(mockDroppableProps).not.toHaveLength(0)
    mockDroppableProps.forEach((props) => {
      expect(props.canDrop?.({ groupKey: GROUP_KEY_RESERVE, groups: [], id: 'dragged', index: 0 })).toBe(false)
      expect(props.slotProps?.row?.draggable).toBe(false)
    })
  })

  // KOE-1589: the trial ended 11.2.2021 and its class has been judged; a fee may still be asked for
  // through the 7th day after, and no later, while every other action stays closed.
  describe('the payment request in the week after the trial', () => {
    afterEach(() => {
      vi.setSystemTime(vi.getRealSystemTime())
    })

    it.each([
      ['2021-02-18', false],
      ['2021-02-19', true],
    ] as const)('on %s is disabled: %s', async (day, disabled) => {
      vi.setSystemTime(noonOfFinnishDay(day))
      const registration = {
        ...registrationWithStaticDates,
        group: { date: mockedGroups[0].date, key: '2021-02-10-ap', number: 1, time: 'ap' as const },
        id: 'participant-1',
      }

      render(
        <ClassEntrySelection
          event={{ ...eventWithStaticDatesAnd3Classes, state: 'completed' }}
          eventClass="ALO"
          registrations={[registration]}
          state="completed"
        />,
        { wrapper: Wrapper }
      )
      await flushPromises()

      expect(mockLastCallbacks?.actionsDisabled).toBe(true)
      expect(mockLastCallbacks?.paymentRequestDisabled).toBe(disabled)
      await act(async () => {
        callback('requestPayment')(registration.id)
      })
      await flushPromises()
      if (disabled) expect(screen.queryByText('send-message-open')).not.toBeInTheDocument()
      else expect(screen.getByText('send-message-open')).toBeInTheDocument()
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
      callback('moveToGroup')('participant-1')
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
      callback('moveToPosition')('reserve-1')
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
      callback('moveToPosition')('participant-1')
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
      callback('moveToParticipants')('reserve-1')
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
      callback('sendMessage')('participant-1')
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

    renderWithUserEvents(
      <ClassEntrySelection event={activeEvent} eventClass="ALO" registrations={registrations} />,
      { wrapper: Wrapper },
      { advanceTimers: vi.advanceTimersByTime }
    )
    await flushPromises()

    await act(async () => {
      callback('moveToPosition')('reserve-1')
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

    renderWithUserEvents(
      <ClassEntrySelection event={activeEvent} eventClass="ALO" registrations={registrations} />,
      { wrapper: Wrapper },
      { advanceTimers: vi.advanceTimersByTime }
    )
    await flushPromises()

    await act(async () => {
      callback('moveToPosition')('reserve-1')
    })
    await flushPromises()

    expect(screen.getByTestId('move-position-max')).toHaveTextContent('1')
  })

  describe('raising a reserve dog once the places are picked (KOE-289)', () => {
    const bothDays = [
      { date: mockedGroups[0].date, time: 'ap' as const },
      { date: mockedGroups[1].date, time: 'ip' as const },
    ]
    const reserveAndParticipant: Registration[] = [
      {
        ...registrationWithStaticDates,
        dates: bothDays,
        group: { date: mockedGroups[0].date, key: '2021-02-10-ap', number: 1, time: 'ap' as const },
        id: 'participant-1',
      },
      {
        ...registrationWithStaticDates,
        dates: bothDays,
        group: { date: mockedGroups[1].date, key: '2021-02-10-ip', number: 2, time: 'ip' as const },
        id: 'participant-2',
      },
      {
        ...registrationWithStaticDates,
        dates: bothDays,
        group: { key: GROUP_KEY_RESERVE, number: 1 },
        id: 'reserve-1',
      },
    ]

    const openReserveMove = async (action: 'moveToParticipants' | 'moveToPosition') => {
      const rendered = renderWithUserEvents(
        <ClassEntrySelection
          event={activeEvent}
          eventClass="ALO"
          registrations={reserveAndParticipant}
          state="picked"
        />,
        { wrapper: Wrapper },
        { advanceTimers: vi.advanceTimersByTime }
      )
      await flushPromises()

      await act(async () => {
        callback(action)('reserve-1')
      })
      await flushPromises()

      await rendered.user.click(
        screen.getByRole('button', { name: action === 'moveToParticipants' ? 'move-group' : 'move-position' })
      )
      await flushPromises()

      return rendered.user
    }

    it.each(['moveToParticipants', 'moveToPosition'] as const)(
      'warns about the koepaikkailmoitus before %s saves anything',
      async (action) => {
        await openReserveMove(action)

        expect(
          screen.getByRole('button', { name: 'eventManagement.participantSelection.moveToParticipants.confirm' })
        ).toBeInTheDocument()
        expect(mockSaveGroups).not.toHaveBeenCalled()
      }
    )

    it('leaves the dog on the reserve list when the secretary backs out', async () => {
      const user = await openReserveMove('moveToParticipants')

      await user.click(screen.getByRole('button', { name: 'cancel' }))
      await flushPromises()

      expect(mockSaveGroups).not.toHaveBeenCalled()
    })

    it('saves the move once the secretary accepts', async () => {
      const user = await openReserveMove('moveToParticipants')

      await user.click(
        screen.getByRole('button', { name: 'eventManagement.participantSelection.moveToParticipants.confirm' })
      )
      await flushPromises()

      expect(mockSaveGroups).toHaveBeenCalledWith(eventWithStaticDatesAnd3Classes.id, [
        expect.objectContaining({ group: expect.objectContaining({ key: '2021-02-10-ip' }), id: 'reserve-1' }),
      ])
    })

    it('moves a dog that already holds a place without a warning', async () => {
      const rendered = renderWithUserEvents(
        <ClassEntrySelection
          event={activeEvent}
          eventClass="ALO"
          registrations={reserveAndParticipant}
          state="picked"
        />,
        { wrapper: Wrapper },
        { advanceTimers: vi.advanceTimersByTime }
      )
      await flushPromises()

      await act(async () => {
        callback('moveToGroup')('participant-1')
      })
      await flushPromises()
      await rendered.user.click(screen.getByRole('button', { name: 'move-group' }))
      await flushPromises()

      expect(
        screen.queryByRole('button', { name: 'eventManagement.participantSelection.moveToParticipants.confirm' })
      ).not.toBeInTheDocument()
      expect(mockSaveGroups).toHaveBeenCalledWith(eventWithStaticDatesAnd3Classes.id, [
        expect.objectContaining({ group: expect.objectContaining({ key: '2021-02-10-ip' }), id: 'participant-1' }),
      ])
    })
  })
})
