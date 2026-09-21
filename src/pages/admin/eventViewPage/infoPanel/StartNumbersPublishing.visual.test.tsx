import type { ConfirmedEvent, Registration } from '@/types'
import { TZDate } from '@date-fns/tz'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import { registrationWithStaticDates } from '@/__mockData__/registrations'
import { eventWithStations } from '@/__mockData__/resultsEvent'
import theme from '@/assets/Theme'
import StartNumbersPublishing from './StartNumbersPublishing'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 460 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// One class out, one still holding its numbers back (KOE-1006), so both faces of the button are in
// the picture — and the draw entry under them, which is the step this section leads to.
const event: ConfirmedEvent = {
  ...eventWithStations,
  classes: eventWithStations.classes.map((eventClass) => ({ ...eventClass, state: 'invited' as const })),
  startListPublished: { ALO: true, AVO: true },
  startNumbersPublished: { ALO: true, AVO: false },
  state: 'invited',
}

it('is its own step, with the draw entry under it', async () => {
  const screen = await render(
    <Frame>
      <StartNumbersPublishing
        event={event}
        eventWithCurrentAttachments={event}
        numbersByClass={{ ALO: [], AVO: [] } as never}
        onSetStartNumbersPublished={async () => {}}
        selectedByClass={{}}
        stateByClass={{}}
      />
    </Frame>
  )

  await expect.element(screen.getByText('Julkaistu')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-numbers-publishing')
})

// A two-day class publishes its draw one morning at a time (KOE-1304): Friday is out, Saturday is
// still to come, and the caption says which. Pinned dates keep the weekday labels still.
const friday = new TZDate(2026, 8, 4, 'Europe/Helsinki')
const saturday = new TZDate(2026, 8, 5, 'Europe/Helsinki')
const twoDayEvent: ConfirmedEvent = {
  ...eventWithStations,
  classes: [
    { class: 'VOI', date: friday, state: 'invited' },
    { class: 'VOI', date: saturday, state: 'invited' },
  ],
  endDate: saturday,
  startDate: friday,
  startListPublished: { VOI: true },
  startNumbersPublished: { VOI: ['2026-09-04'] },
  state: 'invited',
}

it('publishes a two-day class one day at a time', async () => {
  const screen = await render(
    <Frame>
      <StartNumbersPublishing
        event={twoDayEvent}
        eventWithCurrentAttachments={twoDayEvent}
        numbersByClass={{ VOI: [] } as never}
        onSetStartNumbersPublished={async () => {}}
        selectedByClass={{}}
        stateByClass={{}}
      />
    </Frame>
  )

  await expect.element(screen.getByText('Piilota pe 4.9.')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-numbers-publishing-two-days')
})

// A one-day class whose morning and afternoon are drawn apart (KOE-1430): the morning is out, the
// afternoon's draw is still to come. The halves' buttons stand beside the class's own, and the
// caption names the half that is out.
const halfDayEvent: ConfirmedEvent = {
  ...eventWithStations,
  classes: [
    { class: 'ALO', date: saturday, state: 'invited' },
    { class: 'AVO', date: saturday, state: 'invited' },
  ],
  endDate: saturday,
  startDate: saturday,
  startListPublished: { ALO: true, AVO: true },
  startNumbersPublished: { ALO: ['2026-09-05/ap'], AVO: false },
  state: 'invited',
}
const placed = (id: string, key: string, time: 'ap' | 'ip', number: number): Registration => ({
  ...registrationWithStaticDates,
  class: 'ALO',
  group: { date: saturday, key, number, time },
  id,
})

it('publishes a day drawn in halves one half at a time', async () => {
  const screen = await render(
    <Frame>
      <StartNumbersPublishing
        event={halfDayEvent}
        eventWithCurrentAttachments={halfDayEvent}
        numbersByClass={{ ALO: [], AVO: [] } as never}
        onSetStartNumbersPublished={async () => {}}
        selectedByClass={{ ALO: [placed('r1', 'ALO-AP', 'ap', 1), placed('r2', 'ALO-IP', 'ip', 2)] }}
        stateByClass={{}}
      />
    </Frame>
  )

  await expect.element(screen.getByText('Piilota aamupäivä')).toBeVisible()
  await expect.element(screen.getByText('Julkaise iltapäivä')).toBeVisible()
  await expect.element(screen.getByText('Julkaistu: la 5.9. (ap)')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-numbers-publishing-half-day')
})
