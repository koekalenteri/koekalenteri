/**
 * Signing in without Cognito. The app keeps the id token in localStorage under `idToken`, and a
 * token that has not expired is used as is: nothing asks Amplify or Cognito for it. The API server
 * turns the token's payload into the authorizer's claims without checking the signature (see
 * e2e/server/api.mjs), so an unsigned token with the right claims is a signed-in user.
 *
 * When the frontend's session moves elsewhere (Auth0, KOE-1032), this file is what changes.
 */
import type { BrowserContext } from '@playwright/test'
import type { JsonUser } from '../../src/types'
import { randomUUID } from 'node:crypto'
import { linkCognitoUser } from './db'

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

const idToken = (sub: string, user: Pick<JsonUser, 'email' | 'name'>) => {
  const now = Math.floor(Date.now() / 1000)
  const claims = {
    aud: 'e2eclient',
    email: user.email,
    email_verified: true,
    exp: now + 12 * 3600,
    iat: now,
    name: user.name,
    sub,
    token_use: 'id',
  }
  return [base64url({ alg: 'none', typ: 'JWT' }), base64url(claims), 'unsigned'].join('.')
}

/** Every page of the context opens signed in as `user`. */
export const signInAs = async (context: BrowserContext, user: Pick<JsonUser, 'email' | 'id' | 'name'>) => {
  const sub = randomUUID()
  await linkCognitoUser(sub, user.id)
  await context.addInitScript(
    (token) => {
      localStorage.setItem('idToken', JSON.stringify(token))
    },
    idToken(sub, user)
  )
}
