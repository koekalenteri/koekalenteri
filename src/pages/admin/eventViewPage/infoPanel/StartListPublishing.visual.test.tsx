import type { ConfirmedEvent } from '../../../../types'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import { eventWithStations } from '../../../../__mockData__/resultsEvent'
import theme from '../../../../assets/Theme'
import StartListPublishing from './StartListPublishing'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 460 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// One class out and one still to go, so both faces of the button are in the picture. The numbers are
// a step of their own now (KOE-1297) and are not in this section; the preview stays, because the
// numbers are a column of the very list it shows.
const event: ConfirmedEvent = {
  ...eventWithStations,
  classes: eventWithStations.classes.map((eventClass) => ({ ...eventClass, state: 'invited' as const })),
  startListPublished: { ALO: true, AVO: false },
  startNumbersPublished: { ALO: true, AVO: false },
  state: 'invited',
}

it('publishes the list per class, and keeps the preview', async () => {
  const screen = await render(
    <Frame>
      <StartListPublishing
        event={event}
        eventWithCurrentAttachments={event}
        numbersByClass={{ ALO: [], AVO: [] } as never}
        onSetStartListPublished={async () => {}}
        selectedByClass={{}}
        stateByClass={{}}
      />
    </Frame>
  )

  await expect.element(screen.getByText('Starttilista julkaistu')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-list-publishing')
})
