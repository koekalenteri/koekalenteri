import type { Registration } from '../../../types'

import { render, screen } from '@testing-library/react'
import { enqueueSnackbar } from 'notistack'

import { registrationWithStaticDates } from '../../../__mockData__/registrations'
import { flushPromises, renderWithUserEvents } from '../../../test-utils/utils'

import MoveToPositionDialog from './MoveToPositionDialog'

jest.mock('notistack', () => ({
  enqueueSnackbar: jest.fn(),
}))

describe('MoveToPositionDialog', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(async () => {
    await flushPromises()
    ;(enqueueSnackbar as jest.Mock).mockClear()
  })
  afterAll(() => jest.useRealTimers())

  it('renders', async () => {
    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { key: 'participants', number: 2 } as any,
    }

    const { baseElement } = render(
      <MoveToPositionDialog
        open={true}
        onClose={jest.fn()}
        registration={registration}
        maxPosition={4}
        onMove={jest.fn()}
      />
    )
    await flushPromises(false)
    expect(baseElement).toMatchSnapshot()
  })

  it('calls onClose when close is clicked', async () => {
    const onClose = jest.fn()
    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { key: 'participants', number: 1 } as any,
    }

    const { user } = renderWithUserEvents(
      <MoveToPositionDialog
        open={true}
        onClose={onClose}
        registration={registration}
        maxPosition={3}
        onMove={jest.fn()}
      />,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )
    await user.click(screen.getByRole('button', { name: 'close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves to selected position (before the selected position)', async () => {
    const onClose = jest.fn()
    const onMove = jest.fn().mockResolvedValue(undefined)
    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { key: 'participants', number: 1 } as any,
    }

    const { user } = renderWithUserEvents(
      <MoveToPositionDialog
        open={true}
        onClose={onClose}
        registration={registration}
        maxPosition={5}
        onMove={onMove}
      />,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )

    // open MUI select + choose position 4
    await user.click(screen.getByRole('combobox', { name: 'registration.moveToPositionDialog.selectPosition' }))
    await user.click(screen.getByRole('option', { name: '4' }))
    await flushPromises(false)

    await user.click(screen.getByRole('button', { name: 'registration.moveToPositionDialog.moveToPosition' }))
    await flushPromises(false)

    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalledWith(3.5)
    expect(enqueueSnackbar).toHaveBeenCalledWith('registration.moveToPositionDialog.moved position', {
      variant: 'success',
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows error snackbar when move fails', async () => {
    const mockConsoleError = jest.spyOn(console, 'error').mockImplementation()

    const onClose = jest.fn()
    const onMove = jest.fn().mockRejectedValue(new Error('move failed'))
    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { key: 'participants', number: 2 } as any,
    }

    const { user } = renderWithUserEvents(
      <MoveToPositionDialog
        open={true}
        onClose={onClose}
        registration={registration}
        maxPosition={3}
        onMove={onMove}
      />,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )
    await flushPromises()

    await user.click(screen.getByRole('button', { name: 'registration.moveToPositionDialog.moveToPosition' }))
    await flushPromises()

    expect(enqueueSnackbar).toHaveBeenCalledWith('Virhe siirrossa', { variant: 'error' })
    expect(onClose).toHaveBeenCalledTimes(0)
    expect(mockConsoleError).toHaveBeenCalled()
  })
})
