import type { ConfirmedEvent } from '../../../../types'
import { ThemeProvider } from '@mui/material/styles'
import { ConfirmProvider } from 'material-ui-confirm'
import { render } from 'vitest-browser-react'
import { eventWithStations } from '../../../../__mockData__/resultsEvent'
import theme from '../../../../assets/Theme'
import ResultsPublishing from './ResultsPublishing'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 400 }}>
    <ThemeProvider theme={theme}>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ThemeProvider>
  </div>
)

// One class already public and one still waiting, so both states of the control are in the picture.
const event: ConfirmedEvent = {
  ...eventWithStations,
  resultsPublished: { ALO: true },
  startListPublished: true,
  state: 'started',
}

it('offers publishing per class, saving and publishing kept explicitly apart', async () => {
  const screen = await render(
    <Frame>
      <ResultsPublishing event={event} />
    </Frame>
  )

  await expect.element(screen.getByText('Tulosten julkaisu')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-publishing')
})
