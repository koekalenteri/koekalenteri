import type { StationTurnItem } from './StationTurnControls'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SnackbarProvider } from 'notistack'
import { StationScoring } from './StationScoring'

const judge = { id: 223, name: 'Tuomari 2' }
const otherJudge = { id: 224, name: 'Tuomari 3' }
const station = { id: '1', judges: [judge], number: 1, tasks: 1 as const }
const group = { date: new Date('2026-09-12'), key: 'ALO-AP', time: 'ap' as const }

/** A NOME-B: judged, not scored — the post is the whole trial, and the result is the judge's word. */
const dogs = [
  {
    class: 'ALO' as const,
    dog: { name: 'Ensimmainen' },
    eventType: 'NOME-B',
    group: { ...group, number: 1 },
    handler: { name: 'Ohjaaja 1' },
    id: 'run-1',
  },
  {
    class: 'ALO' as const,
    dog: { name: 'Toinen' },
    eventType: 'NOME-B',
    group: { ...group, number: 2 },
    id: 'run-2',
  },
  {
    class: 'AVO' as const,
    dog: { name: 'Kolmas' },
    eventType: 'NOME-B',
    group: { ...group, key: 'AVO-AP', number: 1 },
    id: 'run-3',
  },
]

const renderScoring = (props: Partial<Parameters<typeof StationScoring>[0]> = {}) => {
  const onSave = vi.fn().mockResolvedValue({ conflicts: [], saved: [{ id: 'run-1' }], unchanged: [] })
  render(
    <SnackbarProvider>
      <StationScoring
        eventType="NOME-B"
        onSave={onSave}
        onTurn={async () => {}}
        registrations={dogs}
        station={station}
        turns={[]}
        {...props}
      />
    </SnackbarProvider>
  )
  return { onSave }
}

describe('StationScoring', () => {
  describe('a qualitative type', () => {
    it('asks for the result rather than points, since there is nothing to score', async () => {
      const user = userEvent.setup()
      renderScoring()

      await user.click(screen.getByRole('button', { name: '1 Ensimmainen' }))

      expect(screen.getByLabelText('results.column.result')).toBeInTheDocument()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it("saves the judge's decision, attributed to the lone judge without asking", async () => {
      const user = userEvent.setup()
      const { onSave } = renderScoring()

      await user.click(screen.getByRole('button', { name: '1 Ensimmainen' }))
      await user.click(screen.getByLabelText('results.column.result'))
      await user.click(within(screen.getByRole('listbox')).getByText('ALO1'))
      await user.click(screen.getByRole('button', { name: 'results.save' }))

      expect(onSave).toHaveBeenCalledWith({
        basedOn: undefined,
        eventResult: { judge, resultCode: '1', tasks: [] },
        id: 'run-1',
        stationId: '1',
      })
    })

    it('offers the choice where the post has more than one judge', async () => {
      const user = userEvent.setup()
      const { onSave } = renderScoring({ station: { ...station, judges: [judge, otherJudge] } })

      await user.click(screen.getByRole('button', { name: '1 Ensimmainen' }))
      await user.click(screen.getByLabelText('results.judge'))
      await user.click(within(screen.getByRole('listbox')).getByText('Tuomari 3'))
      await user.click(screen.getByLabelText('results.column.result'))
      await user.click(within(screen.getByRole('listbox')).getByText('ALO0'))
      await user.click(screen.getByRole('button', { name: 'results.save' }))

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ eventResult: { judge: otherJudge, resultCode: '0', tasks: [] } })
      )
    })

    it('starts a correction from what is recorded, and marks a judged dog as done', async () => {
      const user = userEvent.setup()
      const judged = { ...dogs[0], eventResult: { judge, result: 'ALO2' } }
      renderScoring({ registrations: [judged, dogs[1]] })

      await user.click(screen.getByRole('button', { name: '1 Ensimmainen' }))

      expect(screen.getByLabelText('results.column.result')).toHaveTextContent('ALO2')
      // A filled chip is a dog that has been through; an outlined one is still to come.
      expect(screen.getByRole('button', { name: '1 Ensimmainen' })).toHaveClass('MuiChip-filled')
      expect(screen.getByRole('button', { name: '2 Toinen' })).toHaveClass('MuiChip-outlined')
    })
  })

  describe('coming back to a turn already started', () => {
    const running: StationTurnItem = {
      dogs: [{ name: 'Kolmas', number: 1 }],
      startedAt: new Date('2026-09-12T08:00:00Z'),
      stationId: '1',
    }

    it('opens on the dog at the post, class tab and all', () => {
      renderScoring({ turns: [running] })

      // The dog at the post is in the other class: the tab follows the dog, not the other way round.
      expect(screen.getByRole('tab', { name: 'AVO', selected: true })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '1. Kolmas' })).toBeInTheDocument()
    })

    it('opens on an empty screen over a break, which holds no dog', () => {
      renderScoring({ turns: [{ ...running, dogs: [], pause: 'coffee' }] })

      expect(screen.getByRole('tab', { name: 'ALO', selected: true })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: /Kolmas/ })).not.toBeInTheDocument()
    })
  })
})
