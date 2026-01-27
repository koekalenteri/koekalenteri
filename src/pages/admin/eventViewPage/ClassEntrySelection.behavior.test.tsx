import type { ReactNode } from 'react'
import type { Registration, RegistrationDate } from '../../../types'
import { act, render, screen } from '@testing-library/react'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { RecoilRoot } from 'recoil'
import { eventWithStaticDatesAnd3Classes } from '../../../__mockData__/events'
import { registrationWithStaticDates, registrationWithStaticDatesCancelled } from '../../../__mockData__/registrations'
import { GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE } from '../../../lib/registration'
import { flushPromises, renderWithUserEvents } from '../../../test-utils/utils'
import ClassEntrySelection from './ClassEntrySelection'

const mockSaveGroups = jest.fn().mockResolvedValue(undefined)
const mockedGroups: RegistrationDate[] = [
  { date: eventWithStaticDatesAnd3Classes.startDate, key: '2021-02-10-ap', time: 'ap' } as RegistrationDate,
  { date: eventWithStaticDatesAnd3Classes.startDate, key: '2021-02-10-ip', time: 'ip' } as RegistrationDate,
]

let mockLastCallbacks: any

jest.mock('../../../hooks/useAdminEventRegistrationDates', () => ({
  useAdminEventRegistrationDates: () => mockedGroups,
}))

jest.mock('../../../hooks/useAdminEventRegistrationGroups', () => ({
  useAdminEventRegistrationGroups: () => mockedGroups,
}))

jest.mock('../recoil/registrations/actions', () => ({
  useAdminRegistrationActions: () => ({
    saveGroups: mockSaveGroups,
  }),
}))

jest.mock('./classEntrySelection/useEntryHandlers', () => ({
  useEntryHandlers: () => ({
    handleCancel: jest.fn(),
    handleCellClick: jest.fn(),
    handleDoubleClick: jest.fn(),
    handleOpen: jest.fn(),
    handleRefund: jest.fn(),
    handleSelectionModeChange: jest.fn(),
  }),
}))

jest.mock('./classEntrySelection/useDnDHandlers', () => ({
  useDnDHandlers: () => ({
    handleDrop: () => jest.fn(),
    handleReject: () => jest.fn(),
  }),
}))

jest.mock('./classEntrySelection/useClassEntrySelectionColumns', () => ({
  useClassEntrySelectionColumns: (_available: unknown, _event: unknown, callbacks: unknown) => {
    mockLastCallbacks = callbacks
    return {
      cancelledColumns: [{ field: 'id', sortable: false }],
      entryColumns: [{ field: 'id', sortable: false }],
      participantColumns: [{ field: 'id', sortable: false }],
    }
  },
}))

jest.mock('./classEntrySelection/DroppableDataGrid', () => () => <div data-testid="droppable-grid" />)
jest.mock('../../components/StyledDataGrid', () => () => <div data-testid="header-grid" />)
jest.mock('./classEntrySelection/UnlockArrange', () => () => <div data-testid="unlock-arrange" />)
jest.mock('./classEntrySelection/GroupHeader', () => () => <div />)
jest.mock('./classEntrySelection/NoRowsOverlay', () => () => <div />)
jest.mock('../../components/NullComponent', () => ({ NullComponent: () => <div /> }))

jest.mock(
  './MoveToGroupDialog',
  () => (props: any) =>
    props.open ? (
      <button onClick={() => props.onMove('2021-02-10-ip')} type="button">
        move-group
      </button>
    ) : null
)

jest.mock(
  './MoveToPositionDialog',
  () => (props: any) =>
    props.open ? (
      <button onClick={() => props.onMove(2.5)} type="button">
        move-position
      </button>
    ) : null
)

jest.mock('./SendMessageDialog', () => (props: any) => (props.open ? <div>send-message-open</div> : null))

function Wrapper(props: { readonly children?: ReactNode }) {
  return (
    <RecoilRoot>
      <SnackbarProvider>
        <ConfirmProvider>
          <Suspense fallback={<>loading...</>}>{props.children}</Suspense>
        </ConfirmProvider>
      </SnackbarProvider>
    </RecoilRoot>
  )
}

describe('ClassEntrySelection behavior coverage', () => {
  beforeAll(() => jest.useFakeTimers())

  beforeEach(() => {
    mockSaveGroups.mockClear()
    mockLastCallbacks = undefined
  })

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers()
    })
  })

  afterAll(() => jest.useRealTimers())

  it('executes move to reserve callback and saves reserve placement', async () => {
    const registrations: Registration[] = [
      {
        ...registrationWithStaticDates,
        group: { date: mockedGroups[0].date, key: '2021-02-10-ap', number: 1, time: 'ap' } as any,
        id: 'target-participant',
      },
      {
        ...registrationWithStaticDates,
        group: { key: GROUP_KEY_RESERVE, number: 1 } as any,
        id: 'already-reserve-1',
      },
    ]

    render(
      <ClassEntrySelection
        event={eventWithStaticDatesAnd3Classes}
        eventClass="ALO"
        registrations={registrations}
        setOpen={jest.fn()}
        setCancelOpen={jest.fn()}
        setRefundOpen={jest.fn()}
        setSelectedRegistrationId={jest.fn()}
      />,
      { wrapper: Wrapper }
    )

    await flushPromises()
    await act(async () => {
      await mockLastCallbacks.moveToReserve('target-participant')
    })

    expect(mockSaveGroups).toHaveBeenCalledWith(eventWithStaticDatesAnd3Classes.id, [
      expect.objectContaining({
        group: expect.objectContaining({ key: GROUP_KEY_RESERVE, number: 2 }),
        id: 'target-participant',
      }),
    ])
  })

  it('opens dialogs through callbacks and executes group/position move handlers', async () => {
    const registrations: Registration[] = [
      {
        ...registrationWithStaticDates,
        group: { date: mockedGroups[0].date, key: '2021-02-10-ap', number: 1, time: 'ap' } as any,
        id: 'participant-1',
      },
      {
        ...registrationWithStaticDatesCancelled,
        group: { key: GROUP_KEY_CANCELLED, number: 1 } as any,
        id: 'cancelled-1',
      },
      {
        ...registrationWithStaticDates,
        group: { key: GROUP_KEY_RESERVE, number: 1 } as any,
        id: 'reserve-1',
      },
    ]

    const { user } = renderWithUserEvents(
      <ClassEntrySelection event={eventWithStaticDatesAnd3Classes} eventClass="ALO" registrations={registrations} />,
      { wrapper: Wrapper },
      { advanceTimers: jest.advanceTimersByTime }
    )
    await flushPromises()

    await act(async () => {
      mockLastCallbacks.moveToGroup('participant-1')
    })
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'move-group' }))

    expect(mockSaveGroups).toHaveBeenCalledWith(eventWithStaticDatesAnd3Classes.id, [
      expect.objectContaining({
        group: expect.objectContaining({ key: '2021-02-10-ip' }),
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
        group: expect.objectContaining({ number: 2.5 }),
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
        group: expect.objectContaining({ key: '2021-02-10-ap', number: 2.5 }),
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
        group: expect.objectContaining({ key: '2021-02-10-ip' }),
        id: 'reserve-1',
      }),
    ])

    await act(async () => {
      mockLastCallbacks.sendMessage('participant-1')
    })
    await flushPromises()
    expect(screen.getByText('send-message-open')).toBeInTheDocument()
  })
})
