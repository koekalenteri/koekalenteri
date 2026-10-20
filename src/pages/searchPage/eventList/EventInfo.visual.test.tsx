import type { PublicDogEvent } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import { emptyEvent } from '@/__mockData__/emptyEvent'
import theme from '@/assets/Theme'
import { sanitizeDogEvent } from '@/lib/event'
import { TestProvider } from '@/test-utils/AtomProvider'
import { freezeClockAt } from '@/test-utils/freezeClock'
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
    { class: 'ALO', date: '2026-06-06', places: 12 },
    { class: 'AVO', date: '2026-06-06', places: 12 },
  ],
  endDate: '2026-06-06',
  entryEndDate: '2026-05-17',
  entryStartDate: '2026-04-25',
  eventType: 'NOME-B',
  location: 'Hollola',
  places: 24,
  retrieveType: 'game',
  startDate: '2026-06-06',
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

// A championship shows its ranking period from the first day it counts: an entry closing on 17.5.2026
// counts NOWT results from 18.5.2025, the day after the same day a year back (KOE-1558).
describe('the ranking period of a championship', () => {
  freezeClockAt('2026-06-20')

  it('shows the first and the last day the period counts', async () => {
    const screen = await render(
      <TestProvider initializeState={({ set }) => set(languageAtom, 'fi')}>
        <Frame>
          <EventInfo event={{ ...event, eventType: 'NOWT SM', retrieveType: undefined }} />
        </Frame>
      </TestProvider>
    )

    await expect.element(screen.getByText('Karsinta-aika')).toBeVisible()
    await expect.element(screen.getByText(/^18\.5\.2025/)).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-info-ranking-period')
  })
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
