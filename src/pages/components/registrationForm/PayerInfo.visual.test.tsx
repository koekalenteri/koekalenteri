import type { DeepPartial, Registration } from '../../../types'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../../assets/Theme'
import { TestProvider } from '../../../test-utils/AtomProvider'
import { PayerInfo } from './PayerInfo'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 900 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

const registration: DeepPartial<Registration> = {
  dog: { regNo: 'FI13775/22' },
  payer: { email: 'matti@example.com', name: 'Matti Meikäläinen', phone: '+358407654321' },
}

it('shows the payer contact details without a hometown field', async () => {
  // The payer is billed and receives the receipt, but nobody reads their hometown off anything.
  const screen = await render(
    <TestProvider>
      <Frame>
        <PayerInfo reg={registration} open />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByLabelText('Nimi')).toHaveValue('Matti Meikäläinen')
  await expect.element(screen.getByLabelText('Kotikunta')).not.toBeInTheDocument()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('payer-info-contact')
})
