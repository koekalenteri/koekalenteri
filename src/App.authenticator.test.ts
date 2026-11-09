import { Authenticator } from '@aws-amplify/ui-react'
import { AuthenticatorProvider } from '@aws-amplify/ui-react-core'

describe('the root AuthenticatorProvider', () => {
  // App takes the provider from ui-react-core and the login page reads it through ui-react: two installed copies would be two contexts.
  it('is the provider of the Authenticator the login page renders', () => {
    expect(Authenticator.Provider).toBe(AuthenticatorProvider)
  })
})
