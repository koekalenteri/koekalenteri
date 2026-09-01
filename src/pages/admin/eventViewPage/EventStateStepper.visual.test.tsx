import type { ConfirmedEvent } from '../../../types'
import { ThemeProvider } from '@mui/material/styles'
import { parseISO } from 'date-fns'
import { render } from 'vitest-browser-react'
import { eventWithStations } from '../../../__mockData__/resultsEvent'
import theme from '../../../assets/Theme'
import { zonedStartOfDay } from '../../../i18n/dates'
import EventStateStepper from './EventStateStepper'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 1080 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// A far-future event day keeps the temporal steps pending no matter when the test runs.
const EVENT_DAY = zonedStartOfDay(parseISO('2099-06-05T12:00:00Z'))

// Start lists out for both classes, numbers out for one: the start number step (KOE-1006 feedback)
// is the active instruction, with its class progress on show.
const event: ConfirmedEvent = {
  ...eventWithStations,
  classes: eventWithStations.classes.map((eventClass) => ({
    ...eventClass,
    date: EVENT_DAY,
    state: 'invited' as const,
  })),
  endDate: EVENT_DAY,
  startDate: EVENT_DAY,
  startListPublished: { ALO: true, AVO: true },
  startNumbersPublished: { ALO: true, AVO: false },
  state: 'invited',
}

it('shows start number publishing as its own step after the start list', async () => {
  const screen = await render(
    <Frame>
      <EventStateStepper event={event} />
    </Frame>
  )

  await expect.element(screen.getByText(/Julkaise starttinumerot/)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-state-stepper')
})
