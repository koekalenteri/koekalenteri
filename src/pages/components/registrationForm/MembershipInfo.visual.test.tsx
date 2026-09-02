import type { DeepPartial, Registration } from '../../../types'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../../assets/Theme'
import { TestProvider } from '../../../test-utils/AtomProvider'
import MembershipInfo from './MembershipInfo'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 900 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

const registration: DeepPartial<Registration> = {
  dog: { regNo: 'FI13775/22' },
  handler: { membership: true, name: 'Liisa Virtanen' },
  ownerHandles: false,
  owners: [
    { key: 'owner-1', membership: true, name: 'Minsu Rauramo' },
    { key: 'owner-2', membership: false, name: 'Matti Meikäläinen' },
  ],
}

it('lists every owner and the separate handler by name', async () => {
  // KOE-1276: all memberships are told in the membership section — nobody's checkbox lives anywhere else.
  const screen = await render(
    <TestProvider>
      <Frame>
        <MembershipInfo reg={registration} orgId="org" />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByText('Liisa Virtanen on järjestävän yhdistyksen jäsen')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('membership-info-owners-and-handler')
})

it('shows no handler row when an owner handles', async () => {
  // The handling owner's own checkbox covers them — the old disabled mirror checkbox is gone.
  const screen = await render(
    <TestProvider>
      <Frame>
        <MembershipInfo reg={{ ...registration, ownerHandles: 'owner-1' }} orgId="org" />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByText('Minsu Rauramo on järjestävän yhdistyksen jäsen')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('membership-info-owner-handles')
})
