import type { AuthenticatorProps } from '@aws-amplify/ui-react'
import type { ReactNode } from 'react'
import { authenticatorTextUtil } from '@aws-amplify/ui'
import { Heading, useAuthenticator } from '@aws-amplify/ui-react'

interface RouteHeadingProps {
  readonly children: ReactNode
  /** The level Amplify renders this heading at, whose size and weight it keeps. */
  readonly look: 3 | 4
}

/**
 * Amplify's route headings start at h3 or h4, which skips a level under the login page's h1. These
 * render the same text one level below the h1, sized as Amplify draws them (KOE-1562).
 */
const RouteHeading = ({ children, look }: RouteHeadingProps) => (
  <Heading
    fontSize={`var(--amplify-components-heading-${look}-font-size)`}
    fontWeight={`var(--amplify-components-heading-${look}-font-weight)`}
    level={2}
  >
    {children}
  </Heading>
)

const ConfirmSignUpHeader = () => {
  const { codeDeliveryDetails } = useAuthenticator((context) => [context.codeDeliveryDetails])
  return <RouteHeading look={4}>{authenticatorTextUtil.getDeliveryMethodText(codeDeliveryDetails)}</RouteHeading>
}

const ResetPasswordHeader = () => (
  <RouteHeading look={3}>{authenticatorTextUtil.getResetYourPasswordText()}</RouteHeading>
)

const ForceNewPasswordHeader = () => (
  <RouteHeading look={4}>{authenticatorTextUtil.getChangePasswordText()}</RouteHeading>
)

const AccountRecoveryHeader = () => (
  <RouteHeading look={3}>{authenticatorTextUtil.getAccountRecoveryInfoText()}</RouteHeading>
)

/**
 * The routes this user pool can reach that carry a heading. Sign in and sign up have none; the MFA
 * and passkey routes stay Amplify's own, since the pool has neither.
 */
export const authenticatorComponents = {
  ConfirmResetPassword: { Header: ResetPasswordHeader },
  ConfirmSignUp: { Header: ConfirmSignUpHeader },
  ConfirmVerifyUser: { Header: AccountRecoveryHeader },
  ForceNewPassword: { Header: ForceNewPasswordHeader },
  ForgotPassword: { Header: ResetPasswordHeader },
  VerifyUser: { Header: AccountRecoveryHeader },
} satisfies NonNullable<AuthenticatorProps['components']>
