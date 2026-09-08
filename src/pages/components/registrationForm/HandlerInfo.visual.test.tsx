import type { DeepPartial, Registration } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { TestProvider } from '@/test-utils/AtomProvider'
import { HandlerInfo } from './HandlerInfo'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 900 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

const registration: DeepPartial<Registration> = {
  dog: { regNo: 'FI13775/22' },
  handler: {
    email: 'liisa@example.com',
    location: 'Lahti',
    membership: true,
    name: 'Liisa Virtanen',
    phone: '+358401234567',
  },
}

it('shows the handler contact details', async () => {
  const screen = await render(
    <TestProvider>
      <Frame>
        <HandlerInfo reg={registration} orgId="org" open />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByLabelText('Nimi')).toHaveValue('Liisa Virtanen')
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('handler-info-contact')
})
