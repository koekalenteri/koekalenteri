import Grid from '@mui/material/Grid'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import { EventDescription } from './EventDescription'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 900 }}>
    <ThemeProvider theme={theme}>
      <Grid container columnSpacing={1}>
        {children}
      </Grid>
    </ThemeProvider>
  </div>
)

// The ticket's own complaint: without the paragraph breaks the secretary's instructions render as
// one heavy block ("aika raskaaksi pötkyläksi").
const description = [
  'Ilmoittautuminen tapahtuu Koekalenterin kautta.',
  '',
  'Koepaikalle saavutaan hyvissä ajoin ennen oman luokan alkua. Pysäköinti tapahtuu opasteiden',
  'mukaisesti, ja koirat pidetään kytkettyinä kokoontumisalueella.',
  '',
  'Kanttiini on avoinna koko koepäivän ajan. Maksuvälineinä käyvät käteinen ja MobilePay.',
].join('\n')

it('prints the additional info as the paragraphs the secretary wrote', async () => {
  const screen = await render(
    <Frame>
      <EventDescription description={description} />
    </Frame>
  )

  await expect.element(screen.getByText(/Kanttiini on avoinna/)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-description-paragraphs')
})
