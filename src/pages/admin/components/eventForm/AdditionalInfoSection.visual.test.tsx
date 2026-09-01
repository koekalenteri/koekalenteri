import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../../../assets/Theme'
import AdditionalInfoSection from './AdditionalInfoSection'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 1000 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

it('shows a text field per language, Finnish first (KOE-1263)', async () => {
  const screen = await render(
    <Frame>
      <AdditionalInfoSection
        description={'Ilmoittautuminen tapahtuu Koekalenterin kautta.\n\nKanttiini on avoinna koko koepäivän ajan.'}
        descriptions={{ en: 'Entries are made through Koekalenteri.\n\nThe canteen is open all day.' }}
        open
      />
    </Frame>
  )

  await expect.element(screen.getByText(/Kanttiini on avoinna/)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('additional-info-section-languages')
})
