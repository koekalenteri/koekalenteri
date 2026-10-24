import type { Registration } from '@/types'
import type { ResultConflict } from './ConflictDialog'
import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { registrationsToEventWithStations } from '@/__mockData__/resultsEvent'
import theme from '@/assets/Theme'
import { ConflictDialog } from './ConflictDialog'

const noop = () => {}
const at = new Date('2026-10-21T10:00:00Z')

const [first] = registrationsToEventWithStations
const registrations: Registration[] = [{ ...first, class: undefined, eventType: 'NOME-A' }]

// Another secretary saved a nought while this one entered a first prize: both read as KoiraNet lists
// them, A0 and A1, though they are stored as NOME-A0 and NOME-A1 (KOE-1592).
const conflicts: ResultConflict[] = [
  {
    id: first.id,
    stored: { result: 'NOME-A0', updatedAt: at, updatedBy: 'Toinen sihteeri' },
    submitted: { result: 'NOME-A1', updatedAt: at, updatedBy: 'Sihteeri' },
  },
]

it('names both versions of a NOME-A result as Kennelliitto lists them (KOE-1592)', async () => {
  await page.viewport(900, 700)
  // The dialog renders through a portal, so the capture is the dialog itself.
  const screen = await render(
    <ThemeProvider theme={theme}>
      <ConflictDialog
        choices={{}}
        conflicts={conflicts}
        eventType="NOME-A"
        onChoose={noop}
        onClose={noop}
        onResolve={async () => {}}
        registrations={registrations}
      />
    </ThemeProvider>
  )

  await expect.element(screen.getByText('Sinun: A1')).toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot('results-conflict-nome-a')
})
