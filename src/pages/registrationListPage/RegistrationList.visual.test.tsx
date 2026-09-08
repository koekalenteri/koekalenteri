import type { PublicDogEvent } from '../../types'
import { fiFI } from '@mui/material/locale'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { fiFI as gridFiFI } from '@mui/x-data-grid/locales'
import { MemoryRouter } from 'react-router'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStaticDates } from '../../__mockData__/events'
import {
  registrationWithStaticDates,
  registrationWithStaticDatesCancelled,
  unpaidRegistrationWithStaticDates,
} from '../../__mockData__/registrations'
import theme from '../../assets/Theme'
import RegistrationList from './RegistrationList'

const VIEWPORT = { height: 400, width: 900 }

/** The grid's own texts in Finnish, as App.tsx sets them. */
const finnishTheme = createTheme(theme, fiFI, gridFiFI)

/** Paying at entry, so the unpaid row has something left to pay and shows the payment action. */
const event: PublicDogEvent = { ...eventWithStaticDates, paymentTime: 'registration' }

const noop = () => {}

// One row with a fee still to pay and one already cancelled — the two shapes the actions column has
// to tell apart. Since KOE-973 the row carries the payment action and the menu button only: editing
// and cancelling live behind the menu, because as bare icons the red cross was taken for a payment
// mark and an entrant paid the same place twice.
it('offers paying on the row and hides editing behind the menu', async () => {
  await page.viewport(VIEWPORT.width, VIEWPORT.height)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', boxSizing: 'border-box', padding: 8, width: '100%' }}>
      <ThemeProvider theme={finnishTheme}>
        <MemoryRouter>
          <RegistrationList
            event={event}
            rows={[unpaidRegistrationWithStaticDates, registrationWithStaticDatesCancelled]}
            onUnregister={noop}
          />
        </MemoryRouter>
      </ThemeProvider>
    </div>
  )

  await expect.element(screen.getByText('Ilmoitetut koirat')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('registration-list-row-actions')
})

// A place paid at the member price by someone who was not a member (KOE-722): the payment went
// through, and the row still has a part to pay, so paying comes back beside the menu.
it('offers paying the part still missing of a paid fee', async () => {
  await page.viewport(VIEWPORT.width, VIEWPORT.height)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', boxSizing: 'border-box', padding: 8, width: '100%' }}>
      <ThemeProvider theme={finnishTheme}>
        <MemoryRouter>
          <RegistrationList
            event={{ ...event, cost: 130, costMember: 123 }}
            rows={[registrationWithStaticDates]}
            onUnregister={noop}
          />
        </MemoryRouter>
      </ThemeProvider>
    </div>
  )

  await expect.element(screen.getByRole('menuitem', { name: 'Maksa ilmoittautuminen' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('registration-list-part-missing')
})
