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
