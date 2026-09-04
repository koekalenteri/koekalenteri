import type { DeepPartial, Registration } from '../../../types'
import { ThemeProvider } from '@mui/material/styles'
import i18n from 'i18next'
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

/** The same two owners, but the co-owner neither handles nor pays and has given nothing but a name. */
const registrationWithNamedCoOwner: DeepPartial<Registration> = {
  ...registration,
  ownerPays: 'owner-1',
  owners: [registration.owners![0], { email: '', key: 'owner-2', membership: false, name: 'Matti Meikäläinen' }],
}

/** A co-owner who volunteered contact details and got the phone number wrong. */
const registrationWithInvalidCoOwnerPhone: DeepPartial<Registration> = {
  ...registration,
  ownerPays: 'owner-1',
  owners: [
    registration.owners![0],
    { email: 'matti@example.com', key: 'owner-2', membership: false, name: 'Matti Meikäläinen', phone: '+35841234' },
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

it('asks a co-owner who neither handles nor pays for a name only', async () => {
  // KOE-1351: a co-owner's phone, hometown and email are nobody's business unless they handle or pay.
  const screen = await render(
    <TestProvider>
      <Frame>
        <OwnerInfo reg={registrationWithNamedCoOwner} orgId="org" open />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByText('Lisää yhteystiedot')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('owner-info-named-co-owner')
})

it('flags the contact detail that is wrong, not just the section', async () => {
  // KOE-1351: an optional field was never flagged, so the header's "invalid phone number" named no
  // field at all — with several owners there was no telling whose number it meant.
  // The section's message comes from the form, which owns validation; the capture is only the
  // owner section, so it is passed in the way RegistrationForm passes it.
  const screen = await render(
    <TestProvider>
      <Frame>
        <OwnerInfo
          reg={registrationWithInvalidCoOwnerPhone}
          orgId="org"
          open
          error
          helperText={i18n.t('validation.registration.phoneOptional')}
        />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByText('korjaa se tai tyhjennä kenttä', { exact: false })).toBeVisible()
  await expect
    .element(screen.getByLabelText('Puhelin', { exact: false }).nth(1))
    .toHaveAttribute('aria-invalid', 'true')
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('owner-info-invalid-co-owner-phone')
})
