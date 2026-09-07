import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import SelectMulti from './SelectMulti'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 320 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

it('shows the selected options as chips, each with its own delete icon', async () => {
  const screen = await render(
    <Frame>
      <SelectMulti label="Valitut luokat" onChange={() => {}} options={['ALO', 'AVO', 'VOI']} value={['ALO', 'VOI']} />
    </Frame>
  )

  await expect.element(screen.getByText('ALO')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('select-multi-chips')
})
