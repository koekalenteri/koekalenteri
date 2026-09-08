import type { StationTurnItem } from './StationTurnControls'
import { cleanup, render, screen, within } from '@testing-library/react'
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
      <StationTurnControls onTurn={onTurn} station={{ id: 'post-1', tasks: 1 }} turns={[]} {...props} />
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

  it('offers no start while a run is under way: the run is ended, not run over', () => {
    renderControls({ selectedDog: { id: 'run-2', name: 'Toinen', number: 6 }, turns: [openTurn] })

    expect(screen.getByRole('button', { name: 'liveStatus.startTurn' })).toBeDisabled()
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

  it('waits for the post to be free before a break: the run is ended first, one tap', () => {
    renderControls({ turns: [openTurn] })

    expect(screen.getByRole('button', { name: 'liveStatus.startBreak' })).toBeDisabled()
  })

  it('labels the end button for the open break', () => {
    renderControls({
      turns: [{ dogs: [], pause: 'coffee', startedAt: new Date('2026-09-12T10:00:00Z'), stationId: 'post-1' }],
    })

    expect(screen.getByRole('button', { name: 'liveStatus.endBreak' })).toBeEnabled()
  })

  describe('per format (KOE-1259 phase 4)', () => {
    const walkUpDogs = [
      { id: 'run-1', name: 'Ensimmainen', number: 5 },
      { id: 'run-2', name: 'Toinen', number: 6 },
      { id: 'run-3', name: 'Kolmas', number: 7 },
    ]

    it('offers no group picker where a post takes one dog at a time', () => {
      renderControls({ dogs: walkUpDogs, eventType: 'NOWT', station: { id: 'post-1', tasks: 1 } })

      expect(screen.queryByRole('button', { name: /liveStatus.group/ })).not.toBeInTheDocument()
    })

    it('starts a walk-up as one turn holding the whole picked group', async () => {
      const user = userEvent.setup()
      const { onTurn } = renderControls({
        dogs: walkUpDogs,
        eventType: 'NOWT',
        station: { dogsAtOnce: 4, id: 'post-1', tasks: 1 },
      })

      await user.click(screen.getByRole('button', { name: /liveStatus.group/ }))
      const menu = within(screen.getByRole('menu'))
      await user.click(menu.getByText('5 Ensimmainen'))
      await user.click(menu.getByText('7 Kolmas'))
      await user.keyboard('{Escape}')
      await user.click(screen.getByRole('button', { name: 'liveStatus.startTurn' }))

      expect(onTurn).toHaveBeenCalledWith({ registrationIds: ['run-1', 'run-3'], type: 'start' })
    })

    it("starts a run at the first of the day's phases, from the fixed list of a taipumuskoe", async () => {
      const user = userEvent.setup()
      const { onTurn } = renderControls({
        eventType: 'NOU',
        selectedDog: { id: 'run-1', name: 'Ensimmainen', number: 5 },
      })

      await user.click(screen.getByRole('button', { name: 'liveStatus.startTurn' }))

      expect(onTurn).toHaveBeenCalledWith({ phase: 'waterMark', registrationIds: ['run-1'], type: 'start' })
    })

    it('moves the open run on to the next phase, and offers no move past the last', async () => {
      const user = userEvent.setup()
      const atWater = { ...openTurn, phases: [{ key: 'waterMark', startedAt: openTurn.startedAt }] }
      const { onTurn } = renderControls({ eventType: 'NOU', turns: [atWater] })

      expect(screen.getByText(/5 Ensimmainen · liveStatus.phase.waterMark/)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'liveStatus.nextPhaseTo label' }))
      expect(onTurn).toHaveBeenCalledWith({ type: 'next' })

      cleanup()
      renderControls({
        eventType: 'NOU',
        turns: [{ ...atWater, phases: [...atWater.phases, { key: 'search', startedAt: openTurn.startedAt }] }],
      })
      expect(screen.getByRole('button', { name: 'liveStatus.nextPhase' })).toBeDisabled()
    })

    it('starts the briefing on its own button, with nobody picked: the whole entry is there at once', async () => {
      const user = userEvent.setup()
      const { onTurn } = renderControls({ eventType: 'NOU' })

      expect(screen.getByRole('button', { name: 'liveStatus.startTurn' })).toBeDisabled()
      await user.click(screen.getByRole('button', { name: 'liveStatus.phase.briefing' }))

      expect(onTurn).toHaveBeenCalledWith({ phase: 'briefing', registrationIds: [], type: 'start' })
    })

    it('offers the briefing only before the first run: it is never held after one', () => {
      const ran = { ...openTurn, endedAt: new Date('2026-09-12T08:07:00Z') }
      renderControls({ eventType: 'NOU', turns: [ran] })

      expect(screen.getByRole('button', { name: 'liveStatus.phase.briefing' })).toBeDisabled()
    })

    it("starts a B trial's run at the first phase the post wrote down", async () => {
      const user = userEvent.setup()
      const { onTurn } = renderControls({
        eventType: 'NOME-B',
        selectedDog: { id: 'run-1', name: 'Ensimmainen', number: 5 },
        station: { id: '1', phases: ['Markkeeraus', 'Haku'], tasks: 1 },
      })

      await user.click(screen.getByRole('button', { name: 'liveStatus.startTurn' }))

      expect(onTurn).toHaveBeenCalledWith({ phase: 'Markkeeraus', registrationIds: ['run-1'], type: 'start' })
    })

    it('does not send a dog out twice: the timeline already names it', async () => {
      const user = userEvent.setup()
      const through = { ...openTurn, endedAt: new Date('2026-09-12T08:07:00Z') }
      renderControls({
        eventType: 'NOWT',
        selectedDog: { id: 'run-1', name: 'Ensimmainen', number: 5 },
        turns: [through],
      })

      const start = screen.getByRole('button', { name: 'liveStatus.startTurn' })
      expect(start).toBeDisabled()
      // The reason is a hover away, since a greyed button says nothing on its own.
      await user.hover(start.parentElement ?? start)
      expect(await screen.findByText('liveStatus.alreadyThrough')).toBeInTheDocument()
    })

    it('does not send a scored dog out, whatever the timeline says — even at a NOME-A', () => {
      renderControls({ eventType: 'NOME-A', selectedDog: { done: true, id: 'run-1', name: 'Ensimmainen', number: 5 } })

      expect(screen.getByRole('button', { name: 'liveStatus.startTurn' })).toBeDisabled()
    })

    it('lets a NOME-A dog out for retrieve after retrieve', () => {
      const through = { ...openTurn, endedAt: new Date('2026-09-12T08:07:00Z') }
      renderControls({
        eventType: 'NOME-A',
        selectedDog: { id: 'run-1', name: 'Ensimmainen', number: 5 },
        turns: [through],
      })

      expect(screen.getByRole('button', { name: 'liveStatus.startTurn' })).toBeEnabled()
    })

    it('does not send a dog whose run is over out again, however many phases it had', () => {
      const ran = {
        ...openTurn,
        endedAt: new Date('2026-09-12T08:07:00Z'),
        phases: [{ key: 'waterMark', startedAt: openTurn.startedAt }],
      }
      renderControls({
        eventType: 'NOU',
        selectedDog: { id: 'run-1', name: 'Ensimmainen', number: 5 },
        turns: [ran],
      })

      expect(screen.getByRole('button', { name: 'liveStatus.startTurn' })).toBeDisabled()
    })

    it('leaves the dogs that have been through out of the walk-up', async () => {
      const user = userEvent.setup()
      const through = { ...openTurn, endedAt: new Date('2026-09-12T08:07:00Z') }
      renderControls({
        dogs: walkUpDogs,
        eventType: 'NOWT',
        station: { dogsAtOnce: 4, id: 'post-1', tasks: 1 },
        turns: [through],
      })

      await user.click(screen.getByRole('button', { name: /liveStatus.group/ }))
      const menu = within(screen.getByRole('menu'))

      expect(menu.queryByText('5 Ensimmainen')).not.toBeInTheDocument()
      expect(menu.getByText('6 Toinen')).toBeInTheDocument()
    })

    it("marks a dog of the open group where the format's live facts are marks", async () => {
      const user = userEvent.setup()
      const { onTurn } = renderControls({
        eventType: 'NOME-A',
        turns: [
          {
            ...openTurn,
            dogs: [
              { name: 'Ensimmainen', number: 5 },
              { name: 'Toinen', number: 6 },
            ],
          },
        ],
      })

      await user.click(screen.getByRole('button', { name: '6 Toinen' }))
      await user.click(within(screen.getByRole('menu')).getByText('liveStatus.mark.eyeWipe'))

      expect(onTurn).toHaveBeenCalledWith({ index: 1, mark: 'eyeWipe', type: 'mark' })
    })

    it('offers no marks where a turn records only that the dog ran', () => {
      renderControls({ eventType: 'NOWT', turns: [openTurn] })

      expect(screen.queryByRole('button', { name: '5 Ensimmainen' })).not.toBeInTheDocument()
    })
  })
})
