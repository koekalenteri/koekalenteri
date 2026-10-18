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

/** The real useAuthenticator, reporting the delivery set with setCodeDelivery. For a vi.mock factory. */
export const withCodeDelivery =
  (real: typeof useAuthenticator): typeof useAuthenticator =>
  (selector) => {
    const context = real(selector)
    return codeDelivery ? { ...context, codeDeliveryDetails: codeDelivery } : context
  }
