import type { Auth0Client } from '@auth0/auth0-spa-js'

import { createAuth0Client } from '@auth0/auth0-spa-js'

import {
  assertAuth0Config,
  AUTH0_AUDIENCE,
  AUTH0_CLIENT_ID,
  AUTH0_DOMAIN,
  AUTH0_REDIRECT_URI,
  AUTH0_SCOPE,
} from './config'

let clientPromise: Promise<Auth0Client> | undefined

export function getAuth0Client(): Promise<Auth0Client> {
  if (!clientPromise) {
    assertAuth0Config()
    clientPromise = createAuth0Client({
      domain: AUTH0_DOMAIN,
      clientId: AUTH0_CLIENT_ID,
      authorizationParams: {
        redirect_uri: AUTH0_REDIRECT_URI,
        audience: AUTH0_AUDIENCE,
        scope: AUTH0_SCOPE,
      },
      // Best-practice for SPAs: Authorization Code + PKCE is the default in this SDK.
      cacheLocation: 'memory',
      useRefreshTokens: false,
    })
  }

  return clientPromise
}
