import type { FormFieldComponents, FormFieldOptions } from '@aws-amplify/ui'
import { translate } from '@aws-amplify/ui'

/**
 * Amplify's password field names its show-password switch and announces the field's state in English
 * constants that never pass through `I18n`. The Authenticator spreads a field's `formFields` options
 * onto the field, so these labels reach it from there.
 */
interface PasswordFieldOptions extends FormFieldOptions {
  passwordIsHiddenLabel: string
  passwordIsShownLabel: string
  showPasswordButtonLabel: string
}

type PasswordFieldName = 'password' | 'confirm_password'

/**
 * Every password field the login's routes draw. Amplify merges a custom field over the field's generic
 * defaults, not over the route's own, so where a route draws its field differently from those defaults
 * the route's options are repeated here (`getCustomFormFields` and `formFields/defaults` in
 * `@aws-amplify/ui`).
 */
const passwordFields: Partial<Record<FormFieldComponents, Partial<Record<PasswordFieldName, FormFieldOptions>>>> = {
  confirmResetPassword: {
    confirm_password: { placeholder: 'Confirm Password' },
    password: { label: 'New Password', placeholder: 'New Password' },
  },
  forceNewPassword: { confirm_password: {}, password: {} },
  signIn: { password: { autocomplete: 'current-password' } },
  signUp: { confirm_password: {}, password: {} },
}

/** The Authenticator's `formFields`, its password fields labelled in the language `I18n` is set to. */
export const passwordFormFields = (): Partial<Record<FormFieldComponents, Record<string, PasswordFieldOptions>>> => {
  const labels = {
    passwordIsHiddenLabel: translate('Password is hidden'),
    passwordIsShownLabel: translate('Password is shown'),
    showPasswordButtonLabel: translate('Show password'),
  }

  return Object.fromEntries(
    Object.entries(passwordFields).map(([route, fields]) => [
      route,
      // Amplify copies `isRequired` over a custom field's `required` before merging in the defaults, so
      // a field that leaves it out loses its required mark (`convertFormFields`).
      Object.fromEntries(
        Object.entries(fields).map(([name, options]) => [name, { ...options, ...labels, isRequired: true }])
      ),
    ])
  )
}
