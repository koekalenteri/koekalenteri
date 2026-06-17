import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonUser } from '../../types'
import { diff } from 'deep-object-diff'
import { nanoid } from 'nanoid'
import { CONFIG } from '../config'
import { response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { normalizeEmail } from './email'
import { appendEmailHistory } from './emailHistory'
import { findUserByEmail, updateUser, userIsMemberOf } from './user'

export interface UserLink {
  cognitoUser: string
  userId: string
}

const { userTable, userLinkTable } = CONFIG

const dynamoDB = new CustomDynamoClient(userLinkTable)

export async function authorize(event?: Partial<APIGatewayProxyEvent>, updateLastSeen?: boolean) {
  const user = await getOrCreateUserFromEvent(event, updateLastSeen)

  return user
}

const getAuthorizerClaims = (event?: Partial<APIGatewayProxyEvent>): Record<string, any> | undefined => {
  const rawClaims = event?.requestContext?.authorizer?.claims as unknown

  if (!rawClaims) return undefined

  if (typeof rawClaims === 'string') {
    try {
      const parsed = JSON.parse(rawClaims)
      return parsed && typeof parsed === 'object' ? parsed : undefined
    } catch {
      console.warn('authorizer.claims was a non-JSON string')
      return undefined
    }
  }

  return typeof rawClaims === 'object' ? rawClaims : undefined
}

async function updateExistingUser(
  existing: JsonUser,
  props: Omit<Partial<JsonUser>, 'id' | 'email'>,
  updateName?: boolean,
  updateLastSeen?: boolean
): Promise<JsonUser> {
  const modifiedBy = 'system'
  const dateString = new Date().toISOString()

  const changes = { ...props }

  // lets not change a stored name or use a non-string value as name
  if ('name' in changes && ((existing?.name && !updateName) || typeof changes.name !== 'string')) {
    delete changes.name
  }
  // if for some reason we have a non-string name in database, replace it
  if ('name' in existing && typeof existing.name !== 'string') {
    existing.name = changes.name ?? ''
  }

  const final: JsonUser = {
    ...existing,
    ...changes,
    ...(updateLastSeen ? { lastSeen: dateString } : {}),
  }

  const changedKeys = Object.keys(diff(existing, final))
  if (changedKeys.length > 0) {
    console.log('updating user', { existing, final, userId: existing.id })
    // Only bump modifiedAt when something meaningful changed (not just lastSeen).
    // lastSeen updates on every login and must not invalidate dataVersions caches.
    const onlyLastSeenChanged = changedKeys.every((k) => k === 'lastSeen')
    const writeModifiedAt = onlyLastSeenChanged ? (existing.modifiedAt ?? dateString) : dateString
    await updateUser({ ...final, modifiedAt: writeModifiedAt, modifiedBy })
  }

  return final
}

async function getOrCreateUserFromEvent(event?: Partial<APIGatewayProxyEvent>, updateLastSeen?: boolean) {
  let user: JsonUser | undefined
  const claims = getAuthorizerClaims(event)

  if (!claims) {
    console.log('no authorizer in requestContext', event?.requestContext)
    return null
  }

  const cognitoUser = claims.sub
  if (!cognitoUser) {
    console.log('no claims.sub in requestContext.autorizer', event?.requestContext?.authorizer)
    return null
  }

  console.log('claims', claims)

  const link = await dynamoDB.read<UserLink>({ cognitoUser: String(cognitoUser) })
  const { name, email } = claims

  if (link) {
    // IMPORTANT: When the cognito user is already linked, honor the link.
    // Do not re-resolve the user by email, as email may change in KL / IdP claims.
    user = await dynamoDB.read<JsonUser>({ id: link.userId }, userTable)
    if (user) {
      user = await updateExistingUser(user, { name }, false, updateLastSeen)
    }
  } else {
    // no user link found for the cognitoUser

    // Mitigation for email changes (e.g. user changes email in KL while staying logged in):
    // If a user record already exists by email, link this cognito user to that record instead
    // of creating a new user (or failing later due to mismatched identities).
    const normalizedEmail = typeof email === 'string' ? normalizeEmail(email) : ''
    const existingByEmail = await findUserByEmail(normalizedEmail)

    if (existingByEmail) {
      console.warn('no user link found; linking cognito user to existing user by email', {
        cognitoUser,
        email: normalizedEmail,
        userId: existingByEmail.id,
      })

      // Update lastSeen/name on the existing user record.
      user = await updateExistingUser(existingByEmail, { name }, false, updateLastSeen)
      await dynamoDB.write({ cognitoUser, userId: existingByEmail.id }, userLinkTable)
      console.log('added user link', { cognitoUser, userId: existingByEmail.id })
    } else {
      user = await getAndUpdateUserByEmail(email, { name }, false, updateLastSeen)
      await dynamoDB.write({ cognitoUser, userId: user.id }, userLinkTable)
      console.log('added user link', { cognitoUser, userId: user.id })
    }
  }
  return user
}

const shouldSkipNameUpdate = (
  existing: JsonUser | undefined,
  changes: Omit<Partial<JsonUser>, 'id' | 'email'>,
  updateName?: boolean
) => 'name' in changes && ((existing?.name && !updateName) || typeof changes.name !== 'string')

const applyNameUpdatePolicy = (
  existing: JsonUser | undefined,
  changes: Omit<Partial<JsonUser>, 'id' | 'email'>,
  updateName?: boolean
) => {
  if (shouldSkipNameUpdate(existing, changes, updateName)) {
    delete changes.name
  }

  if (existing && 'name' in existing && typeof existing.name !== 'string') {
    existing.name = changes.name ?? ''
  }
}

export async function getAndUpdateUserByEmail(
  rawEmail: string,
  props: Omit<Partial<JsonUser>, 'id' | 'email'>,
  updateName?: boolean,
  updateLastSeen?: boolean
) {
  const modifiedBy = 'system'
  const dateString = new Date().toISOString()
  const email = normalizeEmail(rawEmail)
  const existing = await findUserByEmail(email)

  if (existing && existing.email !== email) {
    console.warn('getAndUpdateUserByEmail: existing user email differs from claims email', {
      claimsEmail: email,
      existingEmail: existing.email,
      userId: existing.id,
    })
  }
  const newUser: JsonUser = {
    createdAt: dateString,
    createdBy: modifiedBy,
    email,
    id: nanoid(10),
    modifiedAt: dateString,
    modifiedBy,
    name: '',
  }

  const changes = { ...props }
  applyNameUpdatePolicy(existing, changes, updateName)

  const final: JsonUser = {
    ...newUser,
    ...existing,
    ...changes,
    // Do NOT overwrite stored email on login. Email is a mutable external attribute (IdP/KL)
    // and must not be treated as the stable user identity.
    email: existing?.email ?? email,
    ...(existing?.email && existing.email !== email
      ? { emailHistory: appendEmailHistory(existing, existing.email, email, dateString, 'login') }
      : {}),
    ...(updateLastSeen ? { lastSeen: dateString } : {}),
  }
  const changedKeys = Object.keys(diff(existing ?? {}, final))
  if (changedKeys.length > 0) {
    if (existing) console.log('updating user', { existing, final })
    else console.log('creating user', { ...final })
    // Only bump modifiedAt when something meaningful changed (not just lastSeen).
    // lastSeen updates on every login and must not invalidate dataVersions caches.
    const onlyLastSeenChanged = existing !== undefined && changedKeys.every((k) => k === 'lastSeen')
    const writeModifiedAt = onlyLastSeenChanged ? (existing.modifiedAt ?? dateString) : dateString
    await updateUser({ ...final, modifiedAt: writeModifiedAt, modifiedBy })
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
    return { res: response(403, 'Forbidden', event), user }
  }

  console.log(`User ${user.id} is member of ['${memberOf.join("', '")}'].`)

  return { memberOf, user }
}
