import type { ConfirmedEvent } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { ConfirmProvider } from 'material-ui-confirm'
import { render } from 'vitest-browser-react'
import { eventWithStaticDates } from '@/__mockData__/events'
import { eventWithStations } from '@/__mockData__/resultsEvent'
import theme from '@/assets/Theme'
import { freezeClockAt } from '@/test-utils/freezeClock'
import { describeInLanguage } from '@/test-utils/language'
import ResultsPublishing from './ResultsPublishing'

// The evening of the first day of the two-day trial below: its second day has not begun.
freezeClockAt('2026-09-12')

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 400 }}>
    <ThemeProvider theme={theme}>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ThemeProvider>
  </div>
)

// One class already public and one still waiting, so both states of the control are in the picture.
const event: ConfirmedEvent = {
  ...eventWithStations,
  resultsPublished: { ALO: true },
  startListPublished: true,
  state: 'started',
}

// The scoring entry belongs to this section (KOE-1354); the trial has run, so it is live in the shot.
const renderStarted = () =>
  render(
    <Frame>
      <ResultsPublishing event={event} eventStarted />
    </Frame>
  )

it('offers publishing per class with the scoring entry beneath, saving and publishing kept apart', async () => {
  const screen = await renderStarted()

  await expect.element(screen.getByText('Tulosten julkaisu')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-publishing')
})

// A classless trial (NOU) publishes as rows named after its type, one for each of its two days
// (KOE-1510); before KOE-1464 it had none.
it('offers publishing a classless event a day at a time', async () => {
  const classless: ConfirmedEvent = { ...eventWithStaticDates, startListPublished: true, state: 'ended' }
  const screen = await render(
    <Frame>
      <ResultsPublishing event={classless} eventStarted />
    </Frame>
  )

  await expect.element(screen.getByText('NOU to 11.2.')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-publishing-classless')
})

/**
 * A two-day trial publishes each class day on its own (KOE-1510): ALO's first day is out, its second
 * day cannot be published before it has begun, and AVO, which runs on the first day only, waits.
 */
it('offers publishing each day of a two-day trial on its own row', async () => {
  const twoDays: ConfirmedEvent = {
    ...eventWithStations,
    classes: [
      { class: 'ALO', date: '2026-09-12' },
      { class: 'ALO', date: '2026-09-13' },
      { class: 'AVO', date: '2026-09-12' },
    ],
    endDate: '2026-09-13',
    resultsPublished: { ALO: ['2026-09-12'] },
    startDate: '2026-09-12',
    startListPublished: true,
    state: 'invited',
  }
  const screen = await render(
    <Frame>
      <ResultsPublishing event={twoDays} eventStarted />
    </Frame>
  )

  await expect.element(screen.getByText('ALO su 13.9.')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-publishing-two-days')
})

// The guide's English page shows the section in English (KOE-1437).
describeInLanguage('en', () => {
  it('offers publishing per class with the scoring entry beneath', async () => {
    const screen = await renderStarted()

    await expect.element(screen.getByText('Publishing results')).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-publishing-en')
  })
})
