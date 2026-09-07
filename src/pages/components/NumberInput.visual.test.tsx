import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import { NumberInput } from './NumberInput'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', display: 'flex', gap: 16, padding: 16, width: 200 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

it('right-aligns a small number field, empty or filled', async () => {
  const screen = await render(
    <Frame>
      <NumberInput slotProps={{ input: { inputProps: { 'aria-label': 'empty' } } }} value={undefined} />
      <NumberInput slotProps={{ input: { inputProps: { 'aria-label': 'filled' } } }} value={123} />
    </Frame>
  )

  await expect.element(screen.getByRole('textbox', { name: 'filled' })).toHaveValue('123')
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('number-input-states')
})
