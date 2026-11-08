import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import { eventWithStations } from '@/__mockData__/resultsEvent'
import theme from '@/assets/Theme'
import { StationHeading } from './StationHeading'
import { StationScoring } from './StationScoring'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 760 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

const judge = { id: 223, name: 'Tuomari 2', official: true }
const station = { id: 'post-2', judges: [judge], number: 2 }
/** The group's second exercise, at this post, split into two parts of 10 (KOE-1665). */
const visit = { exercise: 2, exercisePosts: ['post-1', 'post-2'], parts: 2 as const }
const group = { date: eventWithStations.startDate, key: 'ALO-AP', time: 'ap' as const }

// One dog through the post, the next one open in front of the judge (KOE-1258).
const registrations = [
  {
    class: 'ALO' as const,
    dog: { name: 'Ensimmainen' },
    eventResult: { tasks: [{ exercise: 2, judge, part: 0, points: 8 }] },
    eventType: 'NOWT',
    group: { ...group, number: 1 },
    handler: { name: 'Minsu Rauramo' },
    id: 'run-1',
    visit,
  },
  {
    class: 'ALO' as const,
    dog: { name: 'Toinen' },
    eventType: 'NOWT',
    group: { ...group, number: 2 },
    handler: { name: 'Sari Alho' },
    id: 'run-2',
    visit,
  },
]

// A closed span gives the clock a stable footer (one group through, a seven-minute pace) without
// putting the ticking wall clock itself into the picture.
const turns = [
  {
    dogs: [{ name: 'Ensimmainen', number: 1 }],
    endedAt: new Date('2026-09-12T08:07:00Z'),
    id: 'turn-1',
    startedAt: new Date('2026-09-12T08:00:00Z'),
    stationId: 'post-2',
  },
]

it('scores the dog at the post, one round at a time', async () => {
  const screen = await render(
    <Frame>
      <StationScoring
        classes={eventWithStations.classes}
        event={{ eventType: 'NOWT' }}
        onSave={async () => ({ registrations: [], saved: [] })}
        onTurn={async () => {}}
        registrations={registrations}
        station={station}
        header={<StationHeading event={{ eventType: 'NOWT' }} station={station} subtitle="Tuloskoe" />}
        turns={turns}
      />
    </Frame>
  )

  await screen.getByText('2 Toinen').click()
  await expect.element(screen.getByText('2. Toinen')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('station-scoring')
})

// A NOME-B runs its day at one post that nobody lays out, and its result is the judge's word rather
// than a score: the same screen, with the result picker where the task inputs would be.
it("takes the judge's decision at the post of a qualitative type", async () => {
  const screen = await render(
    <Frame>
      <StationScoring
        classes={eventWithStations.classes}
        event={{ eventType: 'NOME-B' }}
        onSave={async () => ({ registrations: [], saved: [] })}
        onTurn={async () => {}}
        registrations={registrations.map((dog) => ({ ...dog, eventResult: undefined, eventType: 'NOME-B' }))}
        station={{ id: '1', judges: [judge], number: 1, tasks: 1 }}
        header={<StationHeading event={{ eventType: 'NOME-B' }} station={station} subtitle="Tuloskoe" />}
        turns={[{ ...turns[0], stationId: '1' }]}
      />
    </Frame>
  )

  await screen.getByText('1 Ensimmainen').click()
  await expect.element(screen.getByText('1. Ensimmainen')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('station-scoring-qualitative')
})

// A NOME-A runs no classes: its stored NOME-A1 reads as KoiraNet lists it, A1 (KOE-1592).
it('shows a NOME-A result at the post as Kennelliitto lists it', async () => {
  const kp = { date: eventWithStations.startDate, key: `${eventWithStations.startDate}-kp`, time: 'kp' as const }
  const nomeA = registrations.map(({ class: _class, ...dog }) => ({
    ...dog,
    eventResult: dog.id === 'run-1' ? { judge, result: 'NOME-A1' } : undefined,
    eventType: 'NOME-A',
    group: { ...kp, number: dog.group.number },
  }))
  const screen = await render(
    <Frame>
      <StationScoring
        event={{ eventType: 'NOME-A' }}
        onSave={async () => ({ registrations: [], saved: [] })}
        onTurn={async () => {}}
        registrations={nomeA}
        station={{ id: '1', judges: [judge], number: 1, tasks: 1 }}
        header={<StationHeading event={{ eventType: 'NOME-A' }} station={station} subtitle="Tuloskoe" />}
        turns={[{ ...turns[0], stationId: '1' }]}
      />
    </Frame>
  )

  await screen.getByText('1 Ensimmainen').click()
  await expect.element(screen.getByText('A1', { exact: true })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('station-scoring-nome-a')
})

// A dog whose handler withdrew it at the post before comes no further: its chip reads as done, and its
// tasks here read "kesk" instead of asking for points (KOE-1669).
it('shows kesk at an exercise the dog never reached', async () => {
  const withdrawn = {
    ...registrations[1],
    eventResult: { retirement: { cause: 'handlerChoice' as const, exercise: 1 } },
  }
  const screen = await render(
    <Frame>
      <StationScoring
        classes={eventWithStations.classes}
        event={{ eventType: 'NOWT' }}
        onSave={async () => ({ registrations: [], saved: [] })}
        onTurn={async () => {}}
        registrations={[registrations[0], withdrawn]}
        station={station}
        header={<StationHeading event={{ eventType: 'NOWT' }} station={station} subtitle="Tuloskoe" />}
        turns={turns}
      />
    </Frame>
  )

  await screen.getByText('2 Toinen').click()
  await expect.element(screen.getByText('Rasti 2, osa 1/2: kesk')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('station-scoring-not-reached')
})

// On the post's link an outcome recorded at another post only shows: the server keeps it (KOE-1615).
it("shows an outcome recorded at another post as not this link's to change", async () => {
  const withdrawn = {
    ...registrations[1],
    eventResult: { retirement: { cause: 'handlerChoice' as const, exercise: 1 } },
  }
  const screen = await render(
    <Frame>
      <StationScoring
        classes={eventWithStations.classes}
        event={{ eventType: 'NOWT' }}
        onSave={async () => ({ registrations: [], saved: [] })}
        onTurn={async () => {}}
        ownOutcomeOnly
        registrations={[registrations[0], withdrawn]}
        station={station}
        header={<StationHeading event={{ eventType: 'NOWT' }} station={station} subtitle="Tuloskoe" />}
        turns={turns}
      />
    </Frame>
  )

  await screen.getByText('2 Toinen').click()
  await expect.element(screen.getByText('Rasti 2, osa 1/2: kesk')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('station-scoring-outcome-elsewhere')
})
