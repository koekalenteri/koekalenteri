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
        positions={[1, 2, 3, 4]}
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
        positions={[1, 2, 3]}
        onMove={jest.fn()}
      />,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )
    await user.click(screen.getByRole('button', { name: 'close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves participant from smaller position to after the selected position', async () => {
    const onClose = jest.fn()
    const onMove = jest.fn().mockResolvedValue(undefined)
    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { date: new Date('2026-08-14T21:00:00.000Z'), key: '2026-08-15-ap', number: 1, time: 'ap' } as any,
    }

    const { user } = renderWithUserEvents(
      <MoveToPositionDialog
        open={true}
        onClose={onClose}
        registration={registration}
        positions={[1, 2, 3, 4, 5]}
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
    expect(onMove).toHaveBeenCalledWith(4.5)
    expect(enqueueSnackbar).toHaveBeenCalledWith('registration.moveToPositionDialog.moved name, position', {
      variant: 'success',
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves dated participant from position 1 to after position 2', async () => {
    const onClose = jest.fn()
    const onMove = jest.fn().mockResolvedValue(undefined)
    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { date: new Date('2026-08-14T21:00:00.000Z'), key: '2026-08-15-ap', number: 1, time: 'ap' } as any,
    }

    const { user } = renderWithUserEvents(
      <MoveToPositionDialog
        open={true}
        onClose={onClose}
        registration={registration}
        positions={[1, 2, 3]}
        onMove={onMove}
      />,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )

    await user.click(screen.getByRole('combobox', { name: 'registration.moveToPositionDialog.selectPosition' }))
    await user.click(screen.getByRole('option', { name: '2' }))
    await flushPromises(false)

    await user.click(screen.getByRole('button', { name: 'registration.moveToPositionDialog.moveToPosition' }))
    await flushPromises(false)

    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalledWith(2.5)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves participant from larger position to before the selected position', async () => {
    const onClose = jest.fn()
    const onMove = jest.fn().mockResolvedValue(undefined)
    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { date: new Date('2026-08-14T21:00:00.000Z'), key: '2026-08-15-ap', number: 3, time: 'ap' } as any,
    }

    const { user } = renderWithUserEvents(
      <MoveToPositionDialog
        open={true}
        onClose={onClose}
        registration={registration}
        positions={[1, 2, 3, 4, 5]}
        onMove={onMove}
      />,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )

    await user.click(screen.getByRole('combobox', { name: 'registration.moveToPositionDialog.selectPosition' }))
    await user.click(screen.getByRole('option', { name: '1' }))
    await flushPromises(false)

    await user.click(screen.getByRole('button', { name: 'registration.moveToPositionDialog.moveToPosition' }))
    await flushPromises(false)

    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalledWith(0.5)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves non-participant before the selected participant position', async () => {
    const onClose = jest.fn()
    const onMove = jest.fn().mockResolvedValue(undefined)
    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { key: 'reserve', number: 1 } as any,
    }

    const { user } = renderWithUserEvents(
      <MoveToPositionDialog
        open={true}
        onClose={onClose}
        registration={registration}
        positions={[1, 2, 3]}
        onMove={onMove}
      />,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )

    await user.click(screen.getByRole('combobox', { name: 'registration.moveToPositionDialog.selectPosition' }))
    await user.click(screen.getByRole('option', { name: '3' }))
    await flushPromises(false)

    await user.click(screen.getByRole('button', { name: 'registration.moveToPositionDialog.moveToPosition' }))
    await flushPromises(false)

    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalledWith(2.5)
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
        positions={[1, 2, 3]}
        onMove={onMove}
      />,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )
    await flushPromises()

    await user.click(screen.getByRole('button', { name: 'registration.moveToPositionDialog.moveToPosition' }))
    await flushPromises()

    expect(enqueueSnackbar).toHaveBeenCalledWith('Virhe siirrossa', { persist: true, variant: 'error' })
    expect(onClose).toHaveBeenCalledTimes(0)
    expect(mockConsoleError).toHaveBeenCalled()
  })

  it('shows only position 1 when only one position is available', async () => {
    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { key: 'participants', number: 1 } as any,
    }

    const { user } = renderWithUserEvents(
      <MoveToPositionDialog
        open={true}
        onClose={jest.fn()}
        registration={registration}
        positions={[1]}
        onMove={jest.fn()}
      />,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )

    await user.click(screen.getByRole('combobox', { name: 'registration.moveToPositionDialog.selectPosition' }))

    expect(screen.getByRole('option', { name: '1' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '2' })).not.toBeInTheDocument()
  })

  it('shows only explicitly allowed positions', async () => {
    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { key: 'participants', number: 2 } as any,
    }

    const { user } = renderWithUserEvents(
      <MoveToPositionDialog
        open={true}
        onClose={jest.fn()}
        registration={registration}
        positions={[2, 5]}
        onMove={jest.fn()}
      />,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )

    await user.click(screen.getByRole('combobox', { name: 'registration.moveToPositionDialog.selectPosition' }))

    expect(screen.getByRole('option', { name: '2' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '5' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '1' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '3' })).not.toBeInTheDocument()
  })

  it('shows the dog name in the title', async () => {
    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { key: 'participants', number: 2 } as any,
    }

    render(
      <MoveToPositionDialog
        open={true}
        onClose={jest.fn()}
        registration={registration}
        positions={[2, 5]}
        onMove={jest.fn()}
      />
    )

    await flushPromises(false)

    expect(screen.getByText('registration.moveToPositionDialog.title name')).toBeInTheDocument()
  })
})
