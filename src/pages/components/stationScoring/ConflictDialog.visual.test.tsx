import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { ConflictDialog } from './ConflictDialog'
import { nomeAConflictRegistrations, nomeAConflicts } from './conflictDialogFixtures'

const noop = () => {}

it('names both versions of a NOME-A result as Kennelliitto lists them (KOE-1592)', async () => {
  await page.viewport(900, 700)
  // The dialog renders through a portal, so the capture is the dialog itself.
  const screen = await render(
    <ThemeProvider theme={theme}>
      <ConflictDialog
        choices={{}}
        conflicts={nomeAConflicts}
        eventType="NOME-A"
        onChoose={noop}
        onClose={noop}
        onResolve={async () => {}}
        registrations={nomeAConflictRegistrations}
      />
    </ThemeProvider>
  )

  await expect.element(screen.getByText('Sinun: A1')).toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot('results-conflict-nome-a')
})

it("shows a post's own scores and how the round ended, on a phone (KOE-1697)", async () => {
  await page.viewport(390, 700)
  const at = new Date('2026-10-21T10:00:00Z')
  const screen = await render(
    <ThemeProvider theme={theme}>
      <ConflictDialog
        choices={{}}
        conflicts={[
          {
            id: 'dog',
            stored: {
              retirement: { cause: 'injury', exercise: 2 },
              tasks: [
                { exercise: 1, part: 0, points: 15, updatedAt: at },
                { exercise: 2, part: 0, points: 8, updatedAt: at },
                { exercise: 2, part: 1, points: 7, updatedAt: at },
              ],
              updatedAt: at,
            },
            submitted: { tasks: [{ exercise: 1, part: 0, points: 18, updatedAt: at }], updatedAt: at },
          },
        ]}
        eventType="NOWT"
        exercisesOf={() => [1, 2]}
        onChoose={noop}
        onClose={noop}
        onResolve={async () => {}}
        registrations={[{ dog: { name: 'Rekku' }, id: 'dog' }]}
      />
    </ThemeProvider>
  )

  await expect.element(screen.getByText('Sinun: Rasti 1: 18 p')).toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot('results-conflict-post')
})
