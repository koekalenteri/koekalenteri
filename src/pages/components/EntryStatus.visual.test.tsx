import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import { EntryStatus } from './EntryStatus'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div
    data-testid="visual-root"
    style={{ background: '#fff', display: 'flex', flexDirection: 'column', gap: 8, padding: 16, width: 280 }}
  >
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

it('shows the tentative, cancelled, and extended notes stacked', async () => {
  const screen = await render(
    <Frame>
      <EntryStatus event={{ state: 'tentative' }} />
      <EntryStatus event={{ state: 'cancelled' }} />
      <EntryStatus event={{ entryOrigEndDate: new Date('2026-06-01'), state: 'confirmed' }} />
    </Frame>
  )

  await expect.element(screen.getByText('(Alustava)')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('entry-status-notes')
})
