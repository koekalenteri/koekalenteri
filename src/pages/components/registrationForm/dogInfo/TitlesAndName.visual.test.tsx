import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../../../assets/Theme'
import { TitlesAndName } from './TitlesAndName'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', display: 'flex', gap: 24, padding: 16, width: 700 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

it('locks both fields once the registry has answered for the dog', async () => {
  const screen = await render(
    <Frame>
      <div style={{ width: 320 }}>
        <TitlesAndName id="editable" nameLabel="Nimi (muokattava)" titlesLabel="Tittelit (muokattava)" name="Molli" />
      </div>
      <div style={{ width: 320 }}>
        <TitlesAndName
          id="locked"
          nameLabel="Nimi (lukittu)"
          titlesLabel="Tittelit (lukittu)"
          name="Rekka"
          titles="FI MVA"
          disabledName
          disabledTitles
        />
      </div>
    </Frame>
  )

  await expect.element(screen.getByRole('textbox', { name: 'Nimi (lukittu)' })).toHaveValue('REKKA')
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('titles-and-name-states')
})
