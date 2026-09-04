import type { DeepPartial, Registration } from '../../../types'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../../assets/Theme'
import { TestProvider } from '../../../test-utils/AtomProvider'
import { BreederInfo } from './BreederInfo'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 900 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

const registration: DeepPartial<Registration> = {
  breeder: { name: 'Minsu Rauramo' },
  dog: { regNo: 'FI13775/22' },
}

it('asks for the breeder by name alone', async () => {
  // KOE-1264: nobody reads the breeder's home town off a start list, so it is not asked for.
  const screen = await render(
    <TestProvider>
      <Frame>
        <BreederInfo reg={registration} open />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByLabelText('Nimi')).toHaveValue('Minsu Rauramo')
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('breeder-info-name-only')
})
