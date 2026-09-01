import type { Registration, RegistrationGroup } from '../../../types'
import { render, screen } from '@testing-library/react'
import { enqueueSnackbar } from 'notistack'
import { eventWithStaticDates } from '../../../__mockData__/events'
import { registrationWithStaticDates } from '../../../__mockData__/registrations'
import { eventRegistrationDateKey } from '../../../lib/event'
import { flushPromises, renderWithUserEvents } from '../../../test-utils/utils'
import MoveToGroupDialog from './MoveToGroupDialog'

type TestRegistrationGroup = RegistrationGroup & { date: Date }

vi.mock('notistack', () => ({
  enqueueSnackbar: vi.fn(),
}))

describe('MoveToGroupDialog', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    vi.runOnlyPendingTimers()
    ;(enqueueSnackbar as import('vitest').Mock).mockClear()
  })
  afterAll(() => vi.useRealTimers())

  const makeGroup = (date: Date, time: 'ap' | 'ip'): TestRegistrationGroup => ({
    date,
    key: eventRegistrationDateKey({ date, time }),
    number: 0,
    time,
  })

  it('renders', async () => {
    const groups: TestRegistrationGroup[] = [
      makeGroup(eventWithStaticDates.startDate, 'ap'),
      makeGroup(eventWithStaticDates.startDate, 'ip'),
    ]
    const currentGroupKey = eventRegistrationDateKey(groups[0])
    const registration: Registration = {
      ...registrationWithStaticDates,
      dates: [groups[0]],
      group: { date: groups[0].date, key: currentGroupKey, number: 1, time: groups[0].time },
    }

    const { baseElement } = render(
      <MoveToGroupDialog
        open={true}
        onClose={vi.fn()}
        registration={registration}
        event={eventWithStaticDates}
        groups={groups}
        onMove={vi.fn()}
      />
    )
    await flushPromises()
    expect(baseElement).toMatchSnapshot()
  })

  it('prevents moving to a day/time the dog is not registered for', async () => {
    const groups: TestRegistrationGroup[] = [
      makeGroup(eventWithStaticDates.startDate, 'ap'),
      makeGroup(eventWithStaticDates.endDate, 'ip'),
    ]
    const currentGroupKey = 'dateFormat.wdshort date registration.timeLong.ap'
    const notRegisteredGroupKey = 'dateFormat.wdshort date registration.timeLong.ip'

    const registration: Registration = {
      ...registrationWithStaticDates,
      dates: [groups[0]],
      group: { date: groups[0].date, key: currentGroupKey, number: 1, time: groups[0].time },
    }

    const onClose = vi.fn()
    const onMove = vi.fn().mockResolvedValue(undefined)

    renderWithUserEvents(
      <MoveToGroupDialog
        open={true}
        onClose={onClose}
        registration={registration}
        event={eventWithStaticDates}
        groups={groups}
        onMove={onMove}
      />,
      undefined,
      { advanceTimers: vi.advanceTimersByTime }
    )

    await flushPromises()

    expect(screen.getByLabelText(notRegisteredGroupKey)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'registration.moveToGroupDialog.moveToGroup' })).not.toBeDisabled()
    await flushPromises()

    expect(onMove).toHaveBeenCalledTimes(0)
    expect(onClose).toHaveBeenCalledTimes(0)
  })

  it('moves to another registered group and closes on success', async () => {
    const groups: TestRegistrationGroup[] = [
      makeGroup(eventWithStaticDates.startDate, 'ap'),
      makeGroup(eventWithStaticDates.startDate, 'ip'),
    ]
    const currentGroupKey =
      'dateFormat.wdshort date registration.timeLong.ap registration.moveToGroupDialog.currentGroup'
    const targetGroupKey = 'dateFormat.wdshort date registration.timeLong.ip'

    const registration: Registration = {
      ...registrationWithStaticDates,
      dates: [groups[0], groups[1]],
      group: { date: groups[0].date, key: currentGroupKey, number: 1, time: groups[0].time },
    }

    const onClose = vi.fn()
    const onMove = vi.fn().mockResolvedValue(undefined)

    const { user } = renderWithUserEvents(
      <MoveToGroupDialog
        open={true}
        onClose={onClose}
        registration={registration}
        event={eventWithStaticDates}
        groups={groups}
        onMove={onMove}
      />,
      undefined,
      { advanceTimers: vi.advanceTimersByTime }
    )

    await flushPromises()

    // select different group
    await user.click(screen.getByRole('radio', { name: targetGroupKey }))
    await flushPromises()

    await user.click(screen.getByRole('button', { name: 'registration.moveToGroupDialog.moveToGroup' }))
    await flushPromises()

    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalledWith('2021-02-10-ip')
    expect(enqueueSnackbar).toHaveBeenCalledWith('registration.moveToGroupDialog.moved name', { variant: 'success' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows error snackbar when move fails', async () => {
    const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const groups: TestRegistrationGroup[] = [
      makeGroup(eventWithStaticDates.startDate, 'ap'),
      makeGroup(eventWithStaticDates.startDate, 'ip'),
    ]
    const currentGroupKey =
      'dateFormat.wdshort date registration.timeLong.ap registration.moveToGroupDialog.currentGroup'
    const targetGroupKey = 'dateFormat.wdshort date registration.timeLong.ip'

    const registration: Registration = {
      ...registrationWithStaticDates,
      dates: [groups[0], groups[1]],
      group: { date: groups[0].date, key: currentGroupKey, number: 1, time: groups[0].time },
    }

    const onClose = vi.fn()
    const onMove = vi.fn().mockRejectedValue(new Error('move failed'))

    const { user } = renderWithUserEvents(
      <MoveToGroupDialog
        open={true}
        onClose={onClose}
        registration={registration}
        event={eventWithStaticDates}
        groups={groups}
        onMove={onMove}
      />,
      undefined,
      { advanceTimers: vi.advanceTimersByTime }
    )

    await flushPromises()
    await user.click(screen.getByRole('radio', { name: targetGroupKey }))
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'registration.moveToGroupDialog.moveToGroup' }))
    await flushPromises()

    expect(enqueueSnackbar).toHaveBeenCalledWith('Virhe siirrossa', { persist: true, variant: 'error' })
    expect(onClose).toHaveBeenCalledTimes(0)
    expect(mockConsoleError).toHaveBeenCalled()

    mockConsoleError.mockRestore()
  })

  it('defaults selection to a registered group when current group is reserve', async () => {
    const groups: TestRegistrationGroup[] = [
      makeGroup(eventWithStaticDates.startDate, 'ap'),
      makeGroup(eventWithStaticDates.startDate, 'ip'),
    ]

    const registration: Registration = {
      ...registrationWithStaticDates,
      dates: [groups[1]],
      group: { key: 'reserve', number: 1 },
    }

    render(
      <MoveToGroupDialog
        open={true}
        onClose={vi.fn()}
        registration={registration}
        event={eventWithStaticDates}
        groups={groups}
        onMove={vi.fn()}
      />
    )

    await flushPromises()

    expect(screen.getByRole('radio', { name: 'dateFormat.wdshort date registration.timeLong.ip' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'registration.moveToGroupDialog.moveToGroup' })).not.toBeDisabled()
  })

  it('shows the dog name in the title', async () => {
    const groups: TestRegistrationGroup[] = [makeGroup(eventWithStaticDates.startDate, 'ap')]
    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { date: groups[0].date, key: eventRegistrationDateKey(groups[0]), number: 1, time: groups[0].time },
    }

    render(
      <MoveToGroupDialog
        open={true}
        onClose={vi.fn()}
        registration={registration}
        event={eventWithStaticDates}
        groups={groups}
        onMove={vi.fn()}
      />
    )

    await flushPromises()

    expect(screen.getByText('registration.moveToGroupDialog.title name')).toBeInTheDocument()
  })
})
