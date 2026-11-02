import type { DroppedTasksDog } from '@/lib/resultTasks'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { describeInLanguage } from '@/test-utils/language'
import DroppedTasksDialog from './DroppedTasksDialog'

// The first post of a NOWT day made one task instead of two (KOE-1666): two dogs had scored its second task.
const dogs: DroppedTasksDog[] = [
  { class: 'ALO', id: 'dog-a', name: 'Metsäpirtin Hukka', number: 3, tasks: 1 },
  { class: 'AVO', id: 'dog-b', name: 'Kultarannan Ystävä', number: 12, tasks: 2 },
  { class: 'VOI', id: 'dog-c', name: 'Revontulen Tähti', tasks: 1 },
]

const renderDialog = () =>
  render(
    <ThemeProvider theme={theme}>
      <DroppedTasksDialog dogs={dogs} open onCancel={() => {}} onConfirm={async () => {}} />
    </ThemeProvider>
  )

it('asks before a change of the posts drops recorded scores', async () => {
  const screen = await renderDialog()

  // The dialog renders through a portal, so the capture is the dialog itself, not a frame around it.
  await expect(screen.getByRole('dialog')).toMatchScreenshot('dropped-tasks')
})

describeInLanguage('en', () => {
  it('asks before a change of the posts drops recorded scores', async () => {
    const screen = await renderDialog()

    await expect(screen.getByRole('dialog')).toMatchScreenshot('dropped-tasks-en')
  })
})
