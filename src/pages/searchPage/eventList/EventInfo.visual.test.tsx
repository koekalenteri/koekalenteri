import type { PublicDogEvent } from '../../../types'
import { TZDate } from '@date-fns/tz'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import { emptyEvent } from '../../../__mockData__/emptyEvent'
import theme from '../../../assets/Theme'
import { TIME_ZONE } from '../../../i18n/dates'
import { sanitizeDogEvent } from '../../../lib/event'
import { TestProvider } from '../../../test-utils/AtomProvider'
import { languageAtom } from '../../state'
import { EventInfo } from './EventInfo'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 1200 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// Entry closed well before the capture, so neither the countdown nor the entry status depends on the clock.
const event: PublicDogEvent = {
  ...sanitizeDogEvent(emptyEvent),
  classes: [
    { class: 'ALO', date: new TZDate('2026-06-06', TIME_ZONE), places: 12 },
    { class: 'AVO', date: new TZDate('2026-06-06', TIME_ZONE), places: 12 },
  ],
  endDate: new TZDate('2026-06-06', TIME_ZONE),
  entryEndDate: new TZDate('2026-05-17', TIME_ZONE),
  entryStartDate: new TZDate('2026-04-25', TIME_ZONE),
  eventType: 'NOME-B',
  location: 'Hollola',
  places: 24,
  retrieveType: 'game',
  startDate: new TZDate('2026-06-06', TIME_ZONE),
}

it('tells whether a B-trial is run with game or dummies (KOE-439)', async () => {
  const screen = await render(
    <TestProvider initializeState={({ set }) => set(languageAtom, 'fi')}>
      <Frame>
        <EventInfo event={event} />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByText('Koe pidetään')).toBeVisible()
  await expect.element(screen.getByText('riistoilla')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-info-retrieve-type')
})

it('shows the entry restrictions beside the priorities (KOE-524)', async () => {
  const screen = await render(
    <TestProvider initializeState={({ set }) => set(languageAtom, 'fi')}>
      <Frame>
        <EventInfo event={{ ...event, restrictions: ['member', '111', '122'] }} />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByText('Rajoitukset')).toBeVisible()
  await expect.element(screen.getByText('labradorinnoutaja')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-info-restrictions')
})
