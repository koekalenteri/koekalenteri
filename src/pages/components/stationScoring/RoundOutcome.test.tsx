import type { ResultEdit } from './types'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eliminatingFaults } from '@/lib/results'
import { RoundOutcome } from './RoundOutcome'

const features = vi.hoisted(() => ({ outcomeReasonEnabled: false }))
vi.mock('@/lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/features')>()),
  get outcomeReasonEnabled() {
    return features.outcomeReasonEnabled
  },
}))

const judge = { id: 224, name: 'Tuomari 3' }
const tasks = [{ exercise: 1, part: 1, points: 15 }]

const renderOutcome = (value: ResultEdit, eventType = 'NOWT') => {
  const onChange = vi.fn()
  render(<RoundOutcome eventType={eventType} onChange={onChange} stations={[]} value={value} />)
  return onChange
}

const choose = async (name: string) => {
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox'))
  await user.click(screen.getByRole('option', { name }))
}

describe('RoundOutcome', () => {
  // What the control does not own stays as it was, whatever else an edit comes to hold (KOE-1706).
  describe('choosing an outcome changes only the outcome', () => {
    it.each([
      ['a retirement', 'results.retirement.injury', { retirement: { cause: 'injury' } }],
      ['the judge stopping the trial', 'results.retirement.judgeStopped', { retirement: { cause: 'judgeStopped' } }],
      ['none', 'results.notInterrupted', {}],
    ])('with %s', async (_name, option, outcome) => {
      const onChange = renderOutcome({ judge, resultCode: '1', retirement: { cause: 'handlerChoice' }, tasks })

      await choose(option)

      expect(onChange).toHaveBeenCalledWith({ judge, resultCode: '1', tasks, ...outcome })
    })

    it('fills in the nought of a qualitative stop, and nothing else', async () => {
      const onChange = renderOutcome({ judge, tasks: [] }, 'NOME-B')

      await choose('results.retirement.judgeStopped')

      expect(onChange).toHaveBeenCalledWith({
        judge,
        resultCode: '0',
        retirement: { cause: 'judgeStopped' },
        tasks: [],
      })
    })

    it('leaves the nought when a qualitative stop is taken away', async () => {
      const onChange = renderOutcome(
        { judge, resultCode: '0', retirement: { cause: 'judgeStopped' }, tasks: [] },
        'NOME-B'
      )

      await choose('results.notInterrupted')

      expect(onChange).toHaveBeenCalledWith({ judge, resultCode: '0', tasks: [] })
    })
  })

  describe('where the hylkäävät virheet are on offer', () => {
    const [fault] = eliminatingFaults('NOWT')

    beforeEach(() => {
      features.outcomeReasonEnabled = true
    })

    afterEach(() => {
      features.outcomeReasonEnabled = false
    })

    it('an elimination replaces a retirement', async () => {
      const onChange = renderOutcome({ judge, retirement: { cause: 'injury' }, tasks })

      await choose(`results.eliminatingFaults.${fault}`)

      expect(onChange).toHaveBeenCalledWith({ elimination: { fault }, judge, tasks })
    })

    it('a retirement replaces an elimination', async () => {
      const onChange = renderOutcome({ elimination: { fault }, judge, tasks })

      await choose('results.retirement.illness')

      expect(onChange).toHaveBeenCalledWith({ judge, retirement: { cause: 'illness' }, tasks })
    })
  })

  describe("the handler's withdrawal", () => {
    it.each([
      ['ticking', false, true],
      ['clearing', true, false],
    ])('%s whether the dog could still have placed changes nothing else', async (_name, before, after) => {
      const user = userEvent.setup()
      const onChange = renderOutcome({
        judge,
        resultCode: '1',
        retirement: { cause: 'handlerChoice', couldStillHavePlaced: before },
        tasks,
      })

      await user.click(screen.getByRole('checkbox', { name: 'results.couldStillHavePlaced' }))

      expect(onChange).toHaveBeenCalledWith({
        judge,
        resultCode: '1',
        retirement: { cause: 'handlerChoice', couldStillHavePlaced: after },
        tasks,
      })
    })
  })
})
