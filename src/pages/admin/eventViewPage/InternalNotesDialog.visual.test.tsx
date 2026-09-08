import { ThemeProvider } from '@mui/material/styles'
import { SnackbarProvider } from 'notistack'
import { render } from 'vitest-browser-react'
import { registrationWithStaticDates } from '@/__mockData__/registrations'
import theme from '@/assets/Theme'
import InternalNotesDialog from './InternalNotesDialog'

const registration = { ...registrationWithStaticDates, internalNotes: 'Ei vastaa puhelimeen, käytä sähköpostia.' }

it('shows the stored note, open', async () => {
  const screen = await render(
    <ThemeProvider theme={theme}>
      <SnackbarProvider>
        <InternalNotesDialog open onClose={() => {}} registration={registration} onSave={async () => {}} />
      </SnackbarProvider>
    </ThemeProvider>
  )

  // The dialog renders through a portal, so the capture is the dialog itself, not a frame around it.
  await expect.element(screen.getByText(registration.internalNotes)).toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot('internal-notes-dialog-open')
})
