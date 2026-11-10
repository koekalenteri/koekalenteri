import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStations, registrationsToEventWithStations } from '@/__mockData__/resultsEvent'
import theme from '@/assets/Theme'
import { dogRound } from '@/lib/resultTasks'
import { rotationDogOf } from '@/lib/rotation'
import { describeInLanguage } from '@/test-utils/language'
import { TaskScore } from './TaskScore'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 320 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

const [task] = dogRound(eventWithStations, rotationDogOf(registrationsToEventWithStations[0]))
const judges = [{ id: 223, name: 'Tuomari 2', official: true }]

// A zero's reason is optional, so the empty field looks like any other empty field, not an error (KOE-1709).
it('shows a zero with no reason chosen without an error', async () => {
  await render(
    <Frame>
      <TaskScore
        judges={judges}
        name="Rasti 1"
        onChange={() => {}}
        onJudgeChange={() => {}}
        task={task}
        value={{ exercise: task.exercise, part: task.part, points: 0 }}
      />
    </Frame>
  )

  await expect.element(page.getByRole('combobox', { name: 'Nollan syy' })).toBeVisible()
  await expect(page.getByTestId('visual-root')).toMatchScreenshot('task-score-zero-no-reason')
})

// A zero offers the reasons: first "Ei tiedossa", the empty option that takes a chosen reason back (KOE-1709),
// then the nollatulokseen johtavat virheet of NOWT §5.3.4 in the rules' own order and words, noudon
// epäonnistuminen as one reason (KOE-1678). The menu opens over the page, so the capture is the menu itself.
it('lists "Ei tiedossa", then the reasons for a zero in the order of §5.3.4', async () => {
  await render(
    <Frame>
      <TaskScore
        judges={judges}
        name="Rasti 1"
        onChange={() => {}}
        onJudgeChange={() => {}}
        task={task}
        value={{ exercise: task.exercise, part: task.part, points: 0 }}
      />
    </Frame>
  )

  await page.getByRole('combobox', { name: 'Nollan syy' }).click()
  const menu = page.getByRole('listbox')
  await expect.element(menu.getByRole('option', { name: 'Fyysinen kosketus koiraan' })).toBeVisible()
  await expect(menu).toMatchScreenshot('task-score-zero-faults')
})

// A trial that follows NOWT may score 0–30 in halves (KOE-1736): the field shows a half point as the
// reader's language writes it, "29,5" in Finnish and "29.5" in English, and the ceiling beside it.
const halfPointTask = { ...task, maxPoints: 30 }
const renderHalfPoints = () =>
  render(
    <Frame>
      <TaskScore
        judges={judges}
        name="Rasti 1"
        onChange={() => {}}
        onJudgeChange={() => {}}
        showName
        step={0.5}
        task={halfPointTask}
        value={{ exercise: task.exercise, part: task.part, points: 29.5 }}
      />
    </Frame>
  )

it('shows a half point as Finnish writes it', async () => {
  await renderHalfPoints()

  await expect.element(page.getByRole('textbox', { name: 'Rasti 1' })).toHaveValue('29,5')
  await expect(page.getByTestId('visual-root')).toMatchScreenshot('task-score-half-points')
})

describeInLanguage('en', () => {
  it('shows a half point as English writes it', async () => {
    await renderHalfPoints()

    await expect.element(page.getByRole('textbox', { name: 'Rasti 1' })).toHaveValue('29.5')
    await expect(page.getByTestId('visual-root')).toMatchScreenshot('task-score-half-points-en')
  })
})
