import Grid from '@mui/material/Grid'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import { TestProvider } from '../../test-utils/AtomProvider'
import { languageAtom } from '../state'
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
    <TestProvider initializeState={({ set }) => set(languageAtom, 'fi')}>
      <Frame>
        <EventDescription event={{ description }} />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByText(/Kanttiini on avoinna/)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-description-paragraphs')
})

it('prints the English translation for an English viewer', async () => {
  // KOE-1263: the secretary gave the additional info in English too, and the viewer reads English.
  const descriptions = {
    en: [
      'Entries are made through Koekalenteri.',
      '',
      'The canteen is open all day. Cash and MobilePay accepted.',
    ].join('\n'),
  }

  const screen = await render(
    <TestProvider initializeState={({ set }) => set(languageAtom, 'en')}>
      <Frame>
        <EventDescription event={{ description, descriptions }} />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByText(/The canteen is open/)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-description-translated')
})
