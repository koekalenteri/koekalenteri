import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import { eventWithStaticDates } from '../../../../../../__mockData__/events'
import theme from '../../../../../../assets/Theme'
import DayPlacesTable from './DayPlacesTable'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 400 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// Same two days, same 5+5 split as ClassPlacesTable.visual.test.tsx: see the comment there.
const eventWithPlacesPerDay = {
  ...eventWithStaticDates,
  classes: [],
  places: 10,
  placesPerDay: {
    '2021-02-10': 5,
    '2021-02-11': 5,
  },
}

it('shows one row per day, with a single places column and a grand total', async () => {
  const screen = await render(
    <Frame>
      <DayPlacesTable event={eventWithPlacesPerDay} disabled={false} handleDayPlacesChange={() => {}} />
    </Frame>
  )

  await expect.element(screen.getByRole('textbox').first()).toHaveValue('5')
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('day-places-table')
})
