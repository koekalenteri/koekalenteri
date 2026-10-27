import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { ConfirmProvider } from 'material-ui-confirm'
import { render } from 'vitest-browser-react'
import { eventWithStaticDates } from '@/__mockData__/events'
import { registrationWithStaticDates } from '@/__mockData__/registrations'
import theme from '@/assets/Theme'
import { locales } from '@/i18n'
import { freezeClockAt } from '@/test-utils/freezeClock'
import AppSnackbarProvider from '../../components/AppSnackbarProvider'
import RegistrationDialogBase from './RegistrationDialogBase'

// RegistrationEditDialog is a thin data-fetching wrapper (event/registration come from atoms
// backed by real API calls) around RegistrationDialogBase, which takes them as plain props. The
// frame this ticket is about -- title, scroll area, action buttons -- belongs to the base
// component, so it's rendered directly here rather than fighting the wrapper's atom graph.
// The dog section says how long ago Kennelliitto was asked, which depends on where today falls; the
// day the baselines were taken is the day this file keeps (KOE-1423).
freezeClockAt('2026-10-28')

vi.mock('../state/registrations/actions', () => ({
  useAdminRegistrationActions: () => ({
    putInternalNotes: async () => ({}),
    save: async (registration: unknown) => registration,
  }),
}))

it('scrolls a long registration form inside a fixed-height frame', async () => {
  const screen = await render(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <AppSnackbarProvider>
          <ConfirmProvider>
            <RegistrationDialogBase
              changes={false}
              event={eventWithStaticDates}
              open
              registration={registrationWithStaticDates}
              savedRegistration={registrationWithStaticDates}
              resetRegistration={() => {}}
              setRegistration={() => {}}
            />
          </ConfirmProvider>
        </AppSnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  )

  // The dialog renders through a portal, so the capture is the dialog itself, not a frame around it.
  // First, the frame as it opens: title bar above a scroll area too short for the whole form.
  await expect.element(screen.getByLabelText('Rekisterinumero')).toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot('registration-edit-dialog-frame')

  // The save/cancel buttons live inside the same scrolling content as the form (there is no
  // pinned action bar); scrolling to them shows the frame's other end.
  const saveButton = screen.getByRole('button', { name: 'Tallenna muutokset' })
  await saveButton.element().scrollIntoView({ block: 'end' })
  await expect.element(saveButton).toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot('registration-edit-dialog-actions')
})

it('shows the entry read-only once the trial is over', async () => {
  // An entry of a trial that is over stays readable but not editable (KOE-1388): every field greys
  // out, the way a cancelled entry's already did, and the save button never wakes up. The dog is
  // Kennelliitto's, so none of its details opens either (KOE-1650).
  const screen = await render(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <AppSnackbarProvider>
          <ConfirmProvider>
            <RegistrationDialogBase
              changes={false}
              event={eventWithStaticDates}
              open
              registration={registrationWithStaticDates}
              savedRegistration={registrationWithStaticDates}
              resetRegistration={() => {}}
              setRegistration={() => {}}
              typedDogOnly
            />
          </ConfirmProvider>
        </AppSnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  )

  await expect.element(screen.getByLabelText('Rekisterinumero')).toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot('registration-edit-dialog-read-only')
})

it('leaves the typed details of a hand-entered dog open once the trial is over', async () => {
  // The issue's case (KOE-1650): a dog entered by hand, its chip a registration number's digits. The
  // secretary may fix the chip, the sex, the birth date and the breed for the results send; the rest
  // of the entry stays read-only.
  const { refreshDate: _refreshDate, ...handEnteredDog } = registrationWithStaticDates.dog
  const handEntered = { ...registrationWithStaticDates, dog: { ...handEnteredDog, rfid: '623372020' } }
  const screen = await render(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <AppSnackbarProvider>
          <ConfirmProvider>
            <RegistrationDialogBase
              changes={false}
              event={eventWithStaticDates}
              open
              registration={handEntered}
              savedRegistration={handEntered}
              resetRegistration={() => {}}
              setRegistration={() => {}}
              typedDogOnly
            />
          </ConfirmProvider>
        </AppSnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  )

  // The field says it, and so does the dog section's summary.
  await expect.element(screen.getByText('Tunnistusmerkinnässä pitää olla 15 numeroa').first()).toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot('registration-edit-dialog-after-trial-typed-dog')
})
