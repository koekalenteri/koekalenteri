import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import { eventWithStaticDatesAndClass } from '../../__mockData__/events'
import { registrationWithStaticDatesAndClass } from '../../__mockData__/registrations'
import theme from '../../assets/Theme'
import { sanitizeDogEvent } from '../../lib/event'
import { describeInLanguage } from '../../test-utils/language'
import CancelDialog from './CancelDialog'

const publicEventWithStaticDatesAndClass = sanitizeDogEvent(eventWithStaticDatesAndClass)

/** The dialog as a participant opens it in time, with a reason to pick. */
const renderOpen = () =>
  render(
    <ThemeProvider theme={theme}>
      <CancelDialog
        event={publicEventWithStaticDatesAndClass}
        open
        registration={registrationWithStaticDatesAndClass}
      />
    </ThemeProvider>
  )

it('offers a reason to pick and a button to confirm', async () => {
  const screen = await renderOpen()

  // The dialog renders through a portal, so the capture is the dialog itself, not a frame around it.
  await expect.element(screen.getByLabelText('Perumisen syy')).toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot('cancel-dialog-open')
})

// The guide's English page shows the dialog in English (KOE-1437).
describeInLanguage('en', () => {
  it('offers a reason to pick and a button to confirm', async () => {
    const screen = await renderOpen()

    await expect.element(screen.getByLabelText('Reason for cancellation')).toBeVisible()
    await expect(screen.getByRole('dialog')).toMatchScreenshot('cancel-dialog-open-en')
  })
})

it('points a late cancellation to the secretary instead, with no reason to pick', async () => {
  const screen = await render(
    <ThemeProvider theme={theme}>
      <CancelDialog
        disabled
        event={publicEventWithStaticDatesAndClass}
        open
        registration={registrationWithStaticDatesAndClass}
      />
    </ThemeProvider>
  )

  await expect.element(screen.getByText(/Ilmoittautumisen voi perua/)).toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot('cancel-dialog-disabled')
})
