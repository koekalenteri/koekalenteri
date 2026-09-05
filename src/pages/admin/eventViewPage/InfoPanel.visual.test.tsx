import type { ConfirmedEvent, Registration } from '../../../types'
import { ThemeProvider } from '@mui/material/styles'
import { parseISO } from 'date-fns'
import { ConfirmProvider } from 'material-ui-confirm'
import { MemoryRouter } from 'react-router'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStations, registrationsToEventWithStations } from '../../../__mockData__/resultsEvent'
import theme from '../../../assets/Theme'
import { zonedStartOfDay } from '../../../i18n/dates'
import { TestProvider } from '../../../test-utils/AtomProvider'
import { TEST_ID_TOKEN } from '../../../test-utils/utils'
import { idTokenAtom } from '../../state'
import InfoPanel from './InfoPanel'

// The sibling sections have screenshots of their own; this one is about the panel as the secretary
// meets it -- every section stacked in the drawer, which is where crowding shows and a single
// section's capture never can (KOE-1356).

// A far-future trial day keeps the entry closed and the trial still ahead no matter when this runs.
const EVENT_DAY = zonedStartOfDay(parseISO('2099-06-05T12:00:00Z'))

// Entry is over (the fixture's entry dates are in the past) and the places are picked: the busiest
// the panel gets, with every step live rather than greyed out.
const event: ConfirmedEvent = {
  ...eventWithStations,
  classes: eventWithStations.classes.map((eventClass) => ({
    ...eventClass,
    date: EVENT_DAY,
    places: 8,
    state: 'picked' as const,
  })),
  endDate: EVENT_DAY,
  kcId: 451859,
  startDate: EVENT_DAY,
  state: 'picked',
}

const registrations: Registration[] = registrationsToEventWithStations.map((registration) =>
  registration.group?.date ? { ...registration, group: { ...registration.group, date: EVENT_DAY } } : registration
)

// The drawer is as tall as the window, so the window has to be taller than the panel's content for
// the capture to hold all of it.
const openPanel = async () => {
  await page.viewport(900, 1500)

  const screen = await render(
    <ThemeProvider theme={theme}>
      <TestProvider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
        <MemoryRouter>
          <ConfirmProvider>
            <InfoPanel event={event} registrations={registrations} />
          </ConfirmProvider>
        </MemoryRouter>
      </TestProvider>
    </ThemeProvider>
  )

  await screen.getByRole('button', { name: 'Avaa tapahtuman hallinta' }).click()

  return screen
}

it('stacks the trial steps in the drawer, with no koetunnus above them', async () => {
  const screen = await openPanel()

  await expect.element(screen.getByText('Osallistujien valinta')).toBeVisible()
  await expect.element(screen.getByText('Koetunnus')).not.toBeInTheDocument()
  await expect(screen.getByTestId('info-panel')).toMatchScreenshot('info-panel')
})
