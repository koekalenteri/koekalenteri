import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonUser } from '../../types'

import { diff } from 'deep-object-diff'
import { nanoid } from 'nanoid'

import { CONFIG } from '../config'
import { response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'

import { appendEmailHistory } from './emailHistory'
import { getBearerTokenFromHeaders, normalizeIssuer, verifyOidcJwt } from './jwt'
import { findUserByEmail, updateUser, userIsMemberOf } from './user'

export interface UserLink {
  /**
   * Provider-agnostic subject.
   *
   * NOTE: this is stored under the legacy DynamoDB partition key attribute name
   * `cognitoUser` to avoid an immediate table migration.
   */
  cognitoUser: string
  userId: string
}

const { userTable, userLinkTable } = CONFIG

const dynamoDB = new CustomDynamoClient(userLinkTable)

type UserInfo = Partial<Pick<JsonUser, 'email' | 'name'>>

async function fetchUserInfoFromIssuer(issuer: string, token: string): Promise<UserInfo | null> {
  try {
    const url = `${normalizeIssuer(issuer)}userinfo`
    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`,
      },
    })
    if (!res.ok) {
      console.warn('userinfo fetch failed', { url, status: res.status })
      return null
    }
    const json: any = await res.json()
    return {
      email: typeof json?.email === 'string' ? json.email : undefined,
      name: typeof json?.name === 'string' ? json.name : undefined,
    }
  } catch (e) {
    console.warn('userinfo fetch errored', e)
    return null
  }
}

export async function authorize(event?: Partial<APIGatewayProxyEvent>, updateLastSeen?: boolean) {
  const user = await getOrCreateUserFromEvent(event, updateLastSeen)

  return user
}

async function getOrCreateUserFromEvent(event?: Partial<APIGatewayProxyEvent>, updateLastSeen?: boolean) {
  let user: JsonUser | undefined

  let claims: any =
    // REST API Gateway + Cognito authorizer
    (event as any)?.requestContext?.authorizer?.claims ??
    // HTTP API Gateway + JWT authorizer
    (event as any)?.requestContext?.authorizer?.jwt?.claims

  // SAM Local: API Gateway authorizers do not execute, so requestContext.authorizer is empty.
  // For local development, verify the JWT inside Lambda and treat its payload as claims.
  const isLocal = (event as any)?.requestContext?.domainName === 'localhost:8080'

  // Access token is still available in the headers even when using an API Gateway authorizer.
  // We may need it to call the issuer /userinfo endpoint when email is not in the access token.
  const bearerToken = getBearerTokenFromHeaders((event as any)?.headers)

  if (!claims && isLocal) {
    if (bearerToken && CONFIG.authJwtIssuer && CONFIG.authJwtAudience) {
      try {
        claims = await verifyOidcJwt({
          token: bearerToken,
          issuer: normalizeIssuer(CONFIG.authJwtIssuer),
          audience: CONFIG.authJwtAudience,
        })
      } catch (e) {
        console.warn('local jwt verification failed', e)
      }
    } else {
      console.warn('local jwt verification skipped (missing token or AUTH_JWT_* env vars)', {
        hasToken: Boolean(bearerToken),
        hasIssuer: Boolean(CONFIG.authJwtIssuer),
        hasAudience: Boolean(CONFIG.authJwtAudience),
      })
    }
  }

  if (!claims) {
    console.log('no authorizer in requestContext', event?.requestContext)
    return null
  }

  const sub = claims.sub
  if (!sub) {
    console.log('no claims.sub in requestContext.autorizer', (event as any).requestContext.authorizer)
    return null
  }

  // Provider-agnostic subject key.
  const iss = typeof claims.iss === 'string' ? claims.iss : undefined
  const subject = iss ? `${iss}|${sub}` : String(sub)

  console.log('claims', claims)

  const link = await dynamoDB.read<UserLink>({ cognitoUser: subject })

  // Auth0 often omits `email` from access tokens, even when `scope` includes `email`.
  // In that case, fetch it from the issuer's /userinfo endpoint.
  let name: string | undefined = typeof claims?.name === 'string' ? claims.name : undefined
  let email: string | undefined = typeof claims?.email === 'string' ? claims.email : undefined
  if ((!email || !email.trim()) && iss && bearerToken) {
    const userInfo = await fetchUserInfoFromIssuer(iss, bearerToken)
    if (userInfo?.email) email = userInfo.email
    if (!name && userInfo?.name) name = userInfo.name
  }

  if (link) {
    user = await dynamoDB.read<JsonUser>({ id: link.userId }, userTable)
    if (user) {
      // If we cannot resolve email, still allow an existing linked user to proceed.
      // We can update lastSeen/name without needing an email lookup.
      if (typeof email === 'string' && email.trim()) {
        user = await getAndUpdateUserByEmail(email, { name }, false, updateLastSeen)
      } else {
        const modifiedBy = 'system'
        const dateString = new Date().toISOString()
        const final: JsonUser = {
          ...user,
          ...(typeof name === 'string' && !user.name ? { name } : {}),
          ...(updateLastSeen ? { lastSeen: dateString } : {}),
          modifiedAt: dateString,
          modifiedBy,
        }
        if (Object.keys(diff(user ?? {}, final)).length > 0) {
          console.warn('authorize: linked user but email claim missing; updating without email', {
            subject,
            userId: user.id,
          })
          await updateUser(final)
        }
        user = final
      }
    }
  } else {
    // no user link found for the subject

    if (typeof email !== 'string' || !email.trim()) {
      console.warn('authorize: cannot create/link user without email claim', { subject })
      return null
    }

    // Mitigation for email changes (e.g. user changes email in KL while staying logged in):
    // If a user record already exists by email, link this cognito user to that record instead
    // of creating a new user (or failing later due to mismatched identities).
    const normalizedEmail = email.toLocaleLowerCase().trim()
    const existingByEmail = await findUserByEmail(normalizedEmail)

    if (existingByEmail) {
      console.warn('no user link found; linking subject to existing user by email', {
        subject,
        userId: existingByEmail.id,
        email: normalizedEmail,
      })

      // Update lastSeen/name on the existing user record.
      user = await getAndUpdateUserByEmail(normalizedEmail, { name }, false, updateLastSeen)
      await dynamoDB.write({ cognitoUser: subject, userId: existingByEmail.id }, userLinkTable)
      console.log('added user link', { cognitoUser: subject, userId: existingByEmail.id })
    } else {
      user = await getAndUpdateUserByEmail(email, { name }, false, updateLastSeen)
      await dynamoDB.write({ cognitoUser: subject, userId: user.id }, userLinkTable)
      console.log('added user link', { cognitoUser: subject, userId: user.id })
    }
  }
  return user
}

export async function getAndUpdateUserByEmail(
  rawEmail: string,
  props: Omit<Partial<JsonUser>, 'id' | 'email'>,
  updateName?: boolean,
  updateLastSeen?: boolean
) {
  const modifiedBy = 'system'
  const dateString = new Date().toISOString()
  const email = rawEmail.toLocaleLowerCase().trim()
  const existing = await findUserByEmail(email)

  if (existing && existing.email !== email) {
    console.warn('getAndUpdateUserByEmail: existing user email differs from claims email', {
      userId: existing.id,
      existingEmail: existing.email,
      claimsEmail: email,
    })
  }
  const newUser: JsonUser = {
    id: nanoid(10),
    name: '',
    email,
    createdAt: dateString,
    createdBy: modifiedBy,
    modifiedAt: dateString,
    modifiedBy,
  }

  const changes = { ...props }

  // lets not change a stored name or use a non-string value as name
  if ('name' in changes && ((existing?.name && !updateName) || typeof changes.name !== 'string')) {
    delete changes.name
  }
  // if for some reason we have a non-string name in database, replace it
  if (existing && 'name' in existing && typeof existing.name !== 'string') {
    existing.name = changes.name ?? ''
  }

  const final: JsonUser = {
    ...newUser,
    ...existing,
    ...changes,
    // Ensure the canonical email from claims always wins over any stored value.
    email,
    ...(existing?.email && existing.email !== email
      ? { emailHistory: appendEmailHistory(existing, existing.email, email, dateString, 'login') }
      : {}),
    ...(updateLastSeen ? { lastSeen: dateString } : {}),
  }
  if (Object.keys(diff(existing ?? {}, final)).length > 0) {
    if (existing) console.log('updating user', { existing, final })
    else console.log('creating user', { ...final })
    await updateUser({ ...final, modifiedAt: dateString, modifiedBy })
  }
  return final
}

export async function getUsername(event: Partial<APIGatewayProxyEvent>) {
  const user = await getOrCreateUserFromEvent(event)
  return user?.name ?? 'anonymous'
}

export const authorizeWithMemberOf = async (event: APIGatewayProxyEvent) => {
  const user = await authorize(event)
  if (!user) {
    return { res: response(401, 'Unauthorized', event) }
  }

  const memberOf = userIsMemberOf(user)
  if (!memberOf.length && !user?.admin) {
    console.error(`User ${user.id} is not admin or member of any organizations.`)
    return { user, res: response(403, 'Forbidden', event) }
  }

  console.log(`User ${user.id} is member of ['${memberOf.join("', '")}'].`)

  return { user, memberOf }
}
