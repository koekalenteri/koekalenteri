import type { StationTurnItem } from './StationTurnControls'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SnackbarProvider } from 'notistack'
import { StationTurnControls } from './StationTurnControls'

const openTurn: StationTurnItem = {
  dogs: [{ name: 'Ensimmainen', number: 5 }],
  startedAt: new Date('2026-09-12T08:00:00Z'),
  stationId: 'post-1',
}

const renderControls = (props: Partial<Parameters<typeof StationTurnControls>[0]> = {}) => {
  const onTurn = vi.fn().mockResolvedValue(undefined)
  render(
    <SnackbarProvider>
      <StationTurnControls onTurn={onTurn} stationId="post-1" turns={[]} {...props} />
    </SnackbarProvider>
  )
  return { onTurn }
}

describe('StationTurnControls', () => {
  it('shows a free post and offers a start only when a dog is selected', () => {
    renderControls()

    expect(screen.getByText('liveStatus.free')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'liveStatus.startTurn' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'liveStatus.endTurn' })).toBeDisabled()
  })

  it('starts a turn with the selected dog', async () => {
    const user = userEvent.setup()
    const { onTurn } = renderControls({ selectedDog: { id: 'run-1', name: 'Ensimmainen', number: 5 } })

    await user.click(screen.getByRole('button', { name: 'liveStatus.startTurn' }))

    expect(onTurn).toHaveBeenCalledWith({ registrationIds: ['run-1'], type: 'start' })
  })

  it('shows the running group and ends it', async () => {
    const user = userEvent.setup()
    const { onTurn } = renderControls({ turns: [openTurn] })

    expect(screen.getByText(/5 Ensimmainen/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'liveStatus.endTurn' }))

    expect(onTurn).toHaveBeenCalledWith({ type: 'end' })
  })

  it('starts a labeled break from the menu', async () => {
    const user = userEvent.setup()
    const { onTurn } = renderControls()

    await user.click(screen.getByRole('button', { name: 'liveStatus.startBreak' }))
    await user.click(within(screen.getByRole('menu')).getByText('liveStatus.pause.lunch'))

    expect(onTurn).toHaveBeenCalledWith({ pause: 'lunch', type: 'break' })
  })

  it('labels the end button for the open break', () => {
    renderControls({
      turns: [{ dogs: [], pause: 'coffee', startedAt: new Date('2026-09-12T10:00:00Z'), stationId: 'post-1' }],
    })

    expect(screen.getByRole('button', { name: 'liveStatus.endBreak' })).toBeEnabled()
  })
})
