import type { DeepPartial, Registration } from '../../../types'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../../assets/Theme'
import { TestProvider } from '../../../test-utils/AtomProvider'
import { OwnerInfo } from './OwnerInfo'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 900 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

const registration: DeepPartial<Registration> = {
  dog: { regNo: 'FI13775/22' },
  ownerHandles: 'owner-1',
  ownerPays: 'owner-2',
  owners: [
    {
      email: 'minsu@example.com',
      key: 'owner-1',
      location: 'Helsinki',
      membership: true,
      name: 'Minsu Rauramo',
      phone: '+358401234567',
    },
    {
      email: 'matti@example.com',
      key: 'owner-2',
      location: 'Espoo',
      membership: false,
      name: 'Matti Meikäläinen',
      phone: '+358407654321',
    },
  ],
}

it('keeps the owner rows to contact details — membership moved to its own section', async () => {
  // KOE-1276: the owner rows no longer carry membership checkboxes; those live in MembershipInfo.
  const screen = await render(
    <TestProvider>
      <Frame>
        <OwnerInfo reg={registration} orgId="org" open />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByText('Lisää omistaja')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('owner-info-two-owners')
})
