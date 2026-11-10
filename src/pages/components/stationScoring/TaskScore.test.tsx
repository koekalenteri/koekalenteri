import { screen } from '@testing-library/react'
import { renderWithUserEvents } from '@/test-utils/utils'
import { TaskScore } from './TaskScore'

// KOE-1736: the points field takes half points as typed, "29,5" or "29.5", where the trial scores in
// halves, and shows them in the reader's language.
describe('TaskScore', () => {
  const task = { exercise: 1, maxPoints: 30, part: 0, parts: 1 as const, stationId: 'post-1' }
  const renderScore = (step: number) => {
    const onChange = vi.fn()
    const rendered = renderWithUserEvents(
      <TaskScore judges={[]} name="Rasti 1" onChange={onChange} onJudgeChange={vi.fn()} step={step} task={task} />,
      undefined
    )
    return { ...rendered, onChange }
  }

  it.each(['29,5', '29.5'])('takes %j as 29.5 points in halves', async (typed) => {
    const { onChange, user } = renderScore(0.5)

    await user.type(screen.getByRole('textbox', { name: 'Rasti 1' }), typed)

    await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(task, 29.5, undefined))
  })

  // A phone's number pad has no separator, so a trial in halves asks for the decimal one.
  it.each([
    [0.5, 'decimal'],
    [1, 'numeric'],
  ])('offers a phone the keyboard for a step of %d', (step, inputMode) => {
    renderScore(step)
    expect(screen.getByRole('textbox', { name: 'Rasti 1' })).toHaveAttribute('inputmode', inputMode)
  })

  it('holds the whole points while the separator waits for its digit', async () => {
    const { onChange, user } = renderScore(0.5)

    await user.type(screen.getByRole('textbox', { name: 'Rasti 1' }), '29,')

    await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(task, 29, undefined))
  })

  it('takes a half point down to the whole point below where the trial scores whole points', async () => {
    const { onChange, user } = renderScore(1)

    await user.type(screen.getByRole('textbox', { name: 'Rasti 1' }), '29,5')

    await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(task, 29, undefined))
  })
})
