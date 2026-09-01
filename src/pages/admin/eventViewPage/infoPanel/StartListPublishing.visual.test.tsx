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

// One class fully public, one holding its numbers back (KOE-1006), so both faces of the second
// button are in the picture.
const event: ConfirmedEvent = {
  ...eventWithStations,
  classes: eventWithStations.classes.map((eventClass) => ({ ...eventClass, state: 'invited' as const })),
  startListPublished: { ALO: true, AVO: true },
  startNumbersPublished: { ALO: true, AVO: false },
  state: 'invited',
}

it('publishes the list and its numbers as two separate decisions', async () => {
  const screen = await render(
    <Frame>
      <StartListPublishing
        event={event}
        eventWithCurrentAttachments={event}
        numbersByClass={{ ALO: [], AVO: [] } as never}
        onSetStartListPublished={async () => {}}
        onSetStartNumbersPublished={async () => {}}
        selectedByClass={{}}
        stateByClass={{}}
      />
    </Frame>
  )

  await expect.element(screen.getByText('Starttinumerot julkaistu')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-list-publishing')
})
