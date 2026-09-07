import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../../../../assets/Theme'
import GroupColors, { availableGroups } from '../GroupColors'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', height: 40, padding: 16, width: 100 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// GroupColorTooltip is only the tooltip wrapper; the colors it labels come from GroupColors,
// which it always renders as its child in real use. A DOM dump of the tooltip alone says
// nothing about a color -- a screenshot of the two together does.
it('gives each available slot its own color, leaving unselected ones transparent', async () => {
  const dates = [new Date('2026-06-01'), new Date('2026-06-02')]
  const available = availableGroups(dates)
  const selected = [available[0], available[2]]

  const screen = await render(
    <Frame>
      <GroupColors available={available} selected={selected} />
    </Frame>
  )

  await expect.element(screen.getByTestId('visual-root')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('group-color-tooltip-colors')
})
