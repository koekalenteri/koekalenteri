import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import { eventWithStaticDatesAndClass } from '@/__mockData__/events'
import theme from '@/assets/Theme'
import ClassPlacesTable from './ClassPlacesTable'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 400 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// Same two days, same 5+5 split as DayPlacesTable.visual.test.tsx: the two tables are
// alternative presentations of the same capacity, and the difference (a column per class here,
// a single "Paikat" column there) is meant to show directly by comparing the two captures.

it('shows one row per class-day, with per-class and grand totals', async () => {
  const event = {
    ...eventWithStaticDatesAndClass,
    classes: [
      { ...eventWithStaticDatesAndClass.classes[0], places: 5 },
      { ...eventWithStaticDatesAndClass.classes[1], places: 5 },
    ],
  }

  const screen = await render(
    <Frame>
      <ClassPlacesTable event={event} disabled={false} handleChange={() => {}} />
    </Frame>
  )

  await expect.element(screen.getByRole('textbox').first()).toHaveValue('5')
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('class-places-table')
})
