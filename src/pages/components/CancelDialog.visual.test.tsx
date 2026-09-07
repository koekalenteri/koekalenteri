import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import { eventWithStaticDatesAndClass } from '../../__mockData__/events'
import { registrationWithStaticDatesAndClass } from '../../__mockData__/registrations'
import theme from '../../assets/Theme'
import { sanitizeDogEvent } from '../../lib/event'
import CancelDialog from './CancelDialog'

const publicEventWithStaticDatesAndClass = sanitizeDogEvent(eventWithStaticDatesAndClass)

it('offers a reason to pick and a button to confirm', async () => {
  const screen = await render(
    <ThemeProvider theme={theme}>
      <CancelDialog
        event={publicEventWithStaticDatesAndClass}
        open
        registration={registrationWithStaticDatesAndClass}
      />
    </ThemeProvider>
  )

  // The dialog renders through a portal, so the capture is the dialog itself, not a frame around it.
  await expect.element(screen.getByLabelText('Perumisen syy')).toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot('cancel-dialog-open')
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
