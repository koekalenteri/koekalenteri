import type { UseAuthenticator, useAuthenticator } from '@aws-amplify/ui-react'

type CodeDeliveryDetails = UseAuthenticator['codeDeliveryDetails']

/** A sign-up code Cognito sent by email, as this user pool does. */
export const emailCodeDelivery: CodeDeliveryDetails = {
  AttributeName: 'email',
  DeliveryMedium: 'EMAIL',
  Destination: 'h***@e***',
}

// Where Cognito sent the sign-up code lives in the auth machine's context, which only a real sign-up
// fills; without it Amplify's sign-up header reads "We Texted You".
let codeDelivery: CodeDeliveryDetails | undefined

/** Sets the delivery the wrapped hook reports; undefined leaves the real hook's answer alone. */
export const setCodeDelivery = (details: CodeDeliveryDetails | undefined) => {
  codeDelivery = details
}

const withCodeDelivery =
  (real: typeof useAuthenticator): typeof useAuthenticator =>
  (selector) => {
    const context = real(selector)
    return codeDelivery ? { ...context, codeDeliveryDetails: codeDelivery } : context
  }

/**
 * The real Amplify module, its useAuthenticator reporting the delivery set with setCodeDelivery.
 *
 * ```ts
 * vi.mock(import('@aws-amplify/ui-react'), async (importOriginal) =>
 *   (await import('./authenticatorFixtures')).mockAuthenticatorModule(importOriginal)
 * )
 * ```
 */
export const mockAuthenticatorModule = async (
  importOriginal: () => Promise<typeof import('@aws-amplify/ui-react')>
) => {
  const original = await importOriginal()
  return { ...original, useAuthenticator: withCodeDelivery(original.useAuthenticator) }
}
