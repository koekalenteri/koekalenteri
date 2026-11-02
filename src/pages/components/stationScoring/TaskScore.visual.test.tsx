import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStations, registrationsToEventWithStations } from '@/__mockData__/resultsEvent'
import theme from '@/assets/Theme'
import { dogRound } from '@/lib/resultTasks'
import { rotationDogOf } from '@/lib/rotation'
import { TaskScore } from './TaskScore'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 320 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

const [task] = dogRound(eventWithStations, rotationDogOf(registrationsToEventWithStations[0]))
const judges = [{ id: 223, name: 'Tuomari 2', official: true }]

// A zero asks why: the nollatulokseen johtavat virheet of NOWT §5.3.4 in the rules' own order and words,
// noudon epäonnistuminen as one reason, then "Ei tiedossa" (KOE-1664, KOE-1678). The menu opens over the
// page, so the capture is the menu itself.
it('asks why an exercise scored zero, in the order of §5.3.4', async () => {
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
