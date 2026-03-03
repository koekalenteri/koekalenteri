import type { DogEvent, Registration, RegistrationDate } from '../../../types'

import { render, screen } from '@testing-library/react'
import { enqueueSnackbar } from 'notistack'

import { eventWithStaticDates } from '../../../__mockData__/events'
import { registrationWithStaticDates } from '../../../__mockData__/registrations'
import { eventRegistrationDateKey } from '../../../lib/event'
import { flushPromises, renderWithUserEvents } from '../../../test-utils/utils'

import MoveToGroupDialog from './MoveToGroupDialog'

jest.mock('notistack', () => ({
  enqueueSnackbar: jest.fn(),
}))

describe('MoveToGroupDialog', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => {
    jest.runOnlyPendingTimers()
    ;(enqueueSnackbar as jest.Mock).mockClear()
  })
  afterAll(() => jest.useRealTimers())

  const makeGroup = (date: Date, time: 'ap' | 'ip'): RegistrationDate => ({ date, time })

  it('renders', async () => {
    const groups: RegistrationDate[] = [
      makeGroup(eventWithStaticDates.startDate, 'ap'),
      makeGroup(eventWithStaticDates.startDate, 'ip'),
    ]
    const currentGroupKey = eventRegistrationDateKey(groups[0])
    const registration: Registration = {
      ...registrationWithStaticDates,
      dates: [groups[0]],
      group: { key: currentGroupKey, number: 1, date: groups[0].date, time: groups[0].time } as any,
    }

    const { baseElement } = render(
      <MoveToGroupDialog
        open={true}
        onClose={jest.fn()}
        registration={registration}
        event={eventWithStaticDates as unknown as DogEvent}
        groups={groups}
        onMove={jest.fn()}
      />
    )
    await flushPromises()
    expect(baseElement).toMatchSnapshot()
  })

  it('prevents moving to a day/time the dog is not registered for', async () => {
    const groups: RegistrationDate[] = [
      makeGroup(eventWithStaticDates.startDate, 'ap'),
      makeGroup(eventWithStaticDates.endDate, 'ip'),
    ]
    const currentGroupKey = 'dateFormat.wdshort date registration.timeLong.ap'
    const notRegisteredGroupKey = 'dateFormat.wdshort date registration.timeLong.ip'

    const registration: Registration = {
      ...registrationWithStaticDates,
      dates: [groups[0]],
      group: { key: currentGroupKey, number: 1, date: groups[0].date, time: groups[0].time } as any,
    }

    const onClose = jest.fn()
    const onMove = jest.fn().mockResolvedValue(undefined)

    renderWithUserEvents(
      <MoveToGroupDialog
        open={true}
        onClose={onClose}
        registration={registration}
        event={eventWithStaticDates as unknown as DogEvent}
        groups={groups}
        onMove={onMove}
      />,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )

    await flushPromises()

    expect(screen.getByLabelText(notRegisteredGroupKey)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'registration.moveToGroupDialog.moveToGroup' })).toBeDisabled()
    await flushPromises()

    expect(onMove).toHaveBeenCalledTimes(0)
    expect(onClose).toHaveBeenCalledTimes(0)
  })

  it('moves to another registered group and closes on success', async () => {
    const groups: RegistrationDate[] = [
      makeGroup(eventWithStaticDates.startDate, 'ap'),
      makeGroup(eventWithStaticDates.startDate, 'ip'),
    ]
    const currentGroupKey =
      'dateFormat.wdshort date registration.timeLong.ap registration.moveToGroupDialog.currentGroup'
    const targetGroupKey = 'dateFormat.wdshort date registration.timeLong.ip'

    const registration: Registration = {
      ...registrationWithStaticDates,
      dates: [groups[0], groups[1]],
      group: { key: currentGroupKey, number: 1, date: groups[0].date, time: groups[0].time } as any,
    }

    const onClose = jest.fn()
    const onMove = jest.fn().mockResolvedValue(undefined)

    const { user } = renderWithUserEvents(
      <MoveToGroupDialog
        open={true}
        onClose={onClose}
        registration={registration}
        event={eventWithStaticDates as unknown as DogEvent}
        groups={groups}
        onMove={onMove}
      />,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )

    await flushPromises()

    // select different group
    await user.click(screen.getByRole('radio', { name: targetGroupKey }))
    await flushPromises()

    await user.click(screen.getByRole('button', { name: 'registration.moveToGroupDialog.moveToGroup' }))
    await flushPromises()

    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalledWith('2021-02-10-ip')
    expect(enqueueSnackbar).toHaveBeenCalledWith('registration.moveToGroupDialog.moved', { variant: 'success' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows error snackbar when move fails', async () => {
    const mockConsoleError = jest.spyOn(console, 'error').mockImplementation()

    const groups: RegistrationDate[] = [
      makeGroup(eventWithStaticDates.startDate, 'ap'),
      makeGroup(eventWithStaticDates.startDate, 'ip'),
    ]
    const currentGroupKey =
      'dateFormat.wdshort date registration.timeLong.ap registration.moveToGroupDialog.currentGroup'
    const targetGroupKey = 'dateFormat.wdshort date registration.timeLong.ip'

    const registration: Registration = {
      ...registrationWithStaticDates,
      dates: [groups[0], groups[1]],
      group: { key: currentGroupKey, number: 1, date: groups[0].date, time: groups[0].time } as any,
    }

    const onClose = jest.fn()
    const onMove = jest.fn().mockRejectedValue(new Error('move failed'))

    const { user } = renderWithUserEvents(
      <MoveToGroupDialog
        open={true}
        onClose={onClose}
        registration={registration}
        event={eventWithStaticDates as unknown as DogEvent}
        groups={groups}
        onMove={onMove}
      />,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )

    await flushPromises()
    await user.click(screen.getByRole('radio', { name: targetGroupKey }))
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'registration.moveToGroupDialog.moveToGroup' }))
    await flushPromises()

    expect(enqueueSnackbar).toHaveBeenCalledWith('Virhe siirrossa', { variant: 'error' })
    expect(onClose).toHaveBeenCalledTimes(0)
    expect(mockConsoleError).toHaveBeenCalled()

    mockConsoleError.mockRestore()
  })
})
