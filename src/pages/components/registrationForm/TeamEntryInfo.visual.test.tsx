import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { describeInLanguage } from '@/test-utils/language'
import { TeamEntryInfo } from './TeamEntryInfo'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 700 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// KOE-1721: the team the dog runs in, named at entry, and the club's first-team mark.
const renderNamed = () =>
  render(
    <Frame>
      <TeamEntryInfo onChange={() => undefined} open teamEntry={{ name: 'Golden Ring', primary: true }} />
    </Frame>
  )

it('names the team the dog runs in, and marks it the first team', async () => {
  const screen = await renderNamed()

  await expect.element(screen.getByRole('textbox', { name: 'Joukkueen nimi' })).toHaveValue('Golden Ring')
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('team-entry-info')
})

describeInLanguage('en', () => {
  it('names the team the dog runs in, and marks it the first team', async () => {
    const screen = await renderNamed()

    await expect.element(screen.getByRole('textbox', { name: 'Team name' })).toHaveValue('Golden Ring')
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('team-entry-info-en')
  })
})

it('says what is wrong with the name', async () => {
  const screen = await render(
    <Frame>
      <TeamEntryInfo
        error
        helperText="Joukkueen nimessä voi olla enintään 60 merkkiä."
        onChange={() => undefined}
        open
        teamEntry={{ name: 'Golden Ring Golden Ring Golden Ring Golden Ring Golden Ring Golden' }}
      />
    </Frame>
  )

  await expect.element(screen.getByText('Joukkueen nimessä voi olla enintään 60 merkkiä.').first()).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('team-entry-info-error')
})
