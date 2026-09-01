import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import { eventWithStations } from '../../../__mockData__/resultsEvent'
import theme from '../../../assets/Theme'
import { StationScoring } from './StationScoring'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 760 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

const judge = { id: 223, name: 'Tuomari 2', official: true }
const station = { id: 'post-2', judges: [judge], number: 2, tasks: 2 }
const group = { date: eventWithStations.startDate, key: 'ALO-AP', time: 'ap' as const }

// One dog through the post, the next one open in front of the judge (KOE-1258).
const registrations = [
  {
    class: 'ALO' as const,
    dog: { name: 'Ensimmainen' },
    eventResult: { tasks: [{ index: 0, judge, points: 8, stationId: 'post-2' }] },
    eventType: 'NOWT',
    group: { ...group, number: 1 },
    handler: { name: 'Minsu Rauramo' },
    id: 'run-1',
  },
  {
    class: 'ALO' as const,
    dog: { name: 'Toinen' },
    eventType: 'NOWT',
    group: { ...group, number: 2 },
    handler: { name: 'Sari Alho' },
    id: 'run-2',
  },
]

it('scores the dog at the post, one round at a time', async () => {
  const screen = await render(
    <Frame>
      <StationScoring
        classes={eventWithStations.classes}
        eventType="NOWT"
        onSave={async () => ({ registrations: [], saved: [] })}
        registrations={registrations}
        station={station}
        subtitle="Tuloskoe"
      />
    </Frame>
  )

  await screen.getByText('2 Toinen').click()
  await expect.element(screen.getByText('2. Toinen')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('station-scoring')
})
