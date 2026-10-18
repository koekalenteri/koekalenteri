import { DefaultTexts, translations } from '@aws-amplify/ui'
import { fiAuthenticationDict } from './auth'

/**
 * Every text Amplify's Authenticator translates through `I18n`: the English dictionary and the
 * defaults its text getters read. The lists differ (`Reset Password` and `Continue` are only in the
 * defaults), so both count.
 */
const amplifyTexts = new Set<string>([...Object.keys(translations.en), ...Object.values(DefaultTexts)])

/**
 * Texts the login can never show in this app, each with the reason. The user pool has no MFA, no
 * phone number, no passwordless sign-in and no sign-up attributes beyond the email
 * (`template/cognito.yaml`); the Authenticator signs in with email and Google only
 * (`src/pages/LoginPage.tsx`).
 */
const NO_MFA = 'MFA is off in the user pool: the confirm sign in, select MFA and setup routes are never reached'
const NO_PHONE = 'the user pool has no phone number and sends no SMS'
const NO_PASSWORDLESS =
  'the pool client allows USER_PASSWORD_AUTH only, so the passwordless and passkey views never open'
const NO_ATTRIBUTE = 'sign-up asks for the email and password only, and the pool requires no other attribute'
const NO_PROVIDER = 'Google is the only social provider'
const NO_USERNAME = 'the login mechanism is the email, never a username'

const notShown: Record<string, string> = {
  'Add your Profile': NO_ATTRIBUTE,
  'Add your Website': NO_ATTRIBUTE,
  'Authenticator App (TOTP)': NO_MFA,
  Birthdate: NO_ATTRIBUTE,
  COPY: NO_MFA,
  'Confirm Email Code': NO_MFA,
  'Confirm MFA Code': NO_MFA,
  'Confirm SMS Code': NO_MFA,
  'Confirm TOTP Code': NO_MFA,
  Continue: NO_PASSWORDLESS,
  'Continue without a Passkey': NO_PASSWORDLESS,
  'Create a Passkey': NO_PASSWORDLESS,
  'Create account with Email OTP': NO_PASSWORDLESS,
  'Create account with Password': NO_PASSWORDLESS,
  'Create account with SMS OTP': NO_PASSWORDLESS,
  'Email Message': NO_MFA,
  'Enter your Birthdate': NO_ATTRIBUTE,
  'Enter your Family Name': NO_ATTRIBUTE,
  'Enter your Given Name': NO_ATTRIBUTE,
  'Enter your Middle Name': NO_ATTRIBUTE,
  'Enter your Name': NO_ATTRIBUTE,
  'Enter your Nickname': NO_ATTRIBUTE,
  'Enter your Phone Number': NO_PHONE,
  'Enter your Preferred Username': NO_ATTRIBUTE,
  'Enter your phone number': NO_PHONE,
  'Enter your username': NO_USERNAME,
  'Existing Passkeys': NO_PASSWORDLESS,
  'Failed to create passkey. Please try again.': NO_PASSWORDLESS,
  'Family Name': NO_ATTRIBUTE,
  'Given Name': NO_ATTRIBUTE,
  'Middle Name': NO_ATTRIBUTE,
  'Multi-Factor Authentication': NO_MFA,
  'Multi-Factor Authentication Setup': NO_MFA,
  Name: NO_ATTRIBUTE,
  Nickname: NO_ATTRIBUTE,
  'Other sign-in options': NO_PASSWORDLESS,
  Passkey: NO_PASSWORDLESS,
  'Passkey authentication was canceled. Please try again or use a different sign-in method.': NO_PASSWORDLESS,
  'Passkey created successfully!': NO_PASSWORDLESS,
  'Passkeys are WebAuthn credentials that validate your identity using biometric data like touch or facial recognition or device authentication like passwords or PINs, serving as a secure password replacement.':
    NO_PASSWORDLESS,
  'Passwordless authentication is not enabled for this account. Please contact your administrator or use password sign-in.':
    NO_PASSWORDLESS,
  'Phone Number': NO_PHONE,
  'Please enter your username first': NO_PASSWORDLESS,
  'Preferred Username': NO_ATTRIBUTE,
  Profile: NO_ATTRIBUTE,
  Registering: NO_PASSWORDLESS,
  'Select MFA Type': NO_MFA,
  'Setup another Passkey': NO_PASSWORDLESS,
  'Setup Email': NO_MFA,
  'Setup TOTP': NO_MFA,
  'Sign In with Amazon': NO_PROVIDER,
  'Sign In with Apple': NO_PROVIDER,
  'Sign In with Email': NO_PASSWORDLESS,
  'Sign In with Facebook': NO_PROVIDER,
  'Sign In with Passkey': NO_PASSWORDLESS,
  'Sign In with Password': NO_PASSWORDLESS,
  'Sign In with SMS': NO_PASSWORDLESS,
  'Sign in faster with Passkey': NO_PASSWORDLESS,
  'Text Message (SMS)': NO_MFA,
  'The verification code you entered is incorrect. Please try again.': `${NO_PASSWORDLESS} (an email OTP error)`,
  'Unable to send verification code. Please try again.': `${NO_PASSWORDLESS} (an email OTP error)`,
  Username: NO_USERNAME,
  'We Sent A Code': `${NO_PHONE} (Amplify shows it only for an SMS delivery)`,
  Website: NO_ATTRIBUTE,
  'Your code is on the way. To log in, enter the code we texted to': NO_PHONE,
  'Your passkey has been successfully registered.': NO_PASSWORDLESS,
  'Your verification code has expired. Please request a new code.': `${NO_PASSWORDLESS} (an email OTP error)`,
}

/**
 * Texts the app translates that neither Amplify list holds, each with where it is shown. A key that is
 * in none of the lists never matches anything and only looks like a translation.
 *
 * Two English texts stay out of reach: the alert's 'Dismiss alert' (the Authenticator passes its error
 * alert no label) and VerifyUser's 'Verifying…' (written into the component). 'Dismiss alert' and
 * 'Hide password' are translated all the same, as Amplify's own list has them. 'Password must have
 * special characters' never shows: the user pool requires no symbols (passwordFormat in
 * src/amplify-env.ts).
 */
const PASSWORD_POLICY =
  'the password policy check on sign up, new password and reset password (defaultServices validateFormPassword against passwordFormat in src/amplify-env.ts)'

const shownOutsideTheLists: Record<string, string> = {
  'Code *': 'label of the code field on confirm reset password and confirm verify user (formFields/defaults)',
  'Enter your email':
    'label and placeholder of the forgot password field, built from the email label (formFields/defaults)',
  'Invalid verification code provided, please try again.': 'Cognito error for a wrong code, shown as is',
  'New Password': 'label and placeholder of the new password on confirm reset password (formFields/defaults)',
  'Password is hidden': 'state of a password field, passed to it by src/pages/loginPage/passwordFormFields.ts',
  'Password is shown': 'state of a password field, passed to it by src/pages/loginPage/passwordFormFields.ts',
  'Password must have at least 8 characters': PASSWORD_POLICY,
  'Password must have lower case letters': PASSWORD_POLICY,
  'Password must have numbers': PASSWORD_POLICY,
  'Password must have upper case letters': PASSWORD_POLICY,
  'Sign Up with Google': 'the Google button on the sign up tab (textUtil getSignInWithFederationText)',
  'Your passwords must match': 'sign-up and reset password check of the confirmation field (defaultServices)',
}

const translated = new Set(Object.keys(fiAuthenticationDict))

describe('fiAuthenticationDict', () => {
  it('translates every Amplify text the login can show', () => {
    const untranslated = [...amplifyTexts].filter((text) => !translated.has(text) && !Object.hasOwn(notShown, text))

    expect(untranslated).toEqual([])
  })

  it('translates the texts Amplify shows from outside its lists', () => {
    expect(Object.keys(shownOutsideTheLists).filter((text) => !translated.has(text))).toEqual([])
  })

  it('lists only texts Amplify still has as not shown', () => {
    expect(Object.keys(notShown).filter((text) => !amplifyTexts.has(text))).toEqual([])
  })

  it('does not both translate a text and list it as not shown', () => {
    expect(Object.keys(notShown).filter((text) => translated.has(text))).toEqual([])
  })

  it('holds no key Amplify never shows', () => {
    const unused = [...translated].filter(
      (text) => !amplifyTexts.has(text) && !Object.hasOwn(shownOutsideTheLists, text)
    )

    expect(unused).toEqual([])
  })
})
