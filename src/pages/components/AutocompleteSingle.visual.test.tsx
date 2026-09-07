import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import AutocompleteSingle from './AutocompleteSingle'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div
    data-testid="visual-root"
    style={{ background: '#fff', display: 'flex', flexDirection: 'column', gap: 16, padding: 16, width: 320 }}
  >
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

it('shows an empty field, a selected value, and a helper text error stacked', async () => {
  const screen = await render(
    <Frame>
      <AutocompleteSingle id="empty" label="Valitse" options={['Ensimmäinen', 'Toinen']} />
      <AutocompleteSingle id="selected" label="Valittu" options={['Ensimmäinen', 'Toinen']} value="Toinen" />
      <AutocompleteSingle
        error
        helperText="Pakollinen tieto"
        id="virhe"
        label="Virhe"
        options={['Ensimmäinen', 'Toinen']}
      />
    </Frame>
  )

  await expect.element(screen.getByText('Pakollinen tieto')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('autocomplete-single-states')
})
