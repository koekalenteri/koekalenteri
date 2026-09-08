import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import { eventWithStaticDatesAndClass } from '@/__mockData__/events'
import theme from '@/assets/Theme'
import EventFormPlaces from './EventFormPlaces'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 500 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

it('shows the mode toggle above a two-row class places table', async () => {
  const event = {
    ...eventWithStaticDatesAndClass,
    classes: [
      { ...eventWithStaticDatesAndClass.classes[0], places: 12 },
      { ...eventWithStaticDatesAndClass.classes[1], places: 8 },
    ],
    places: 20,
  }

  const screen = await render(
    <Frame>
      <EventFormPlaces event={event} />
    </Frame>
  )

  await expect.element(screen.getByRole('textbox').first()).toHaveValue('12')
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-form-places-per-class')
})
