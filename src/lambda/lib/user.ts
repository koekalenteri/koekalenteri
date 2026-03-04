import type { JsonDogEvent, JsonUser, Official, Organizer, UserRole } from '../../types'
import type { UserLink } from './auth'
import type { EmailHistoryEntry } from './emailHistory'
import type { PartialJsonJudge } from './judge'
import { diff } from 'deep-object-diff'
import { nanoid } from 'nanoid'
import { i18n } from '../../i18n/lambda'
import { validEmail } from '../../lib/email'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { sendTemplatedMail } from './email'
import { appendEmailHistory } from './emailHistory'
import { reverseName } from './string'
import { pickCanonicalUserPreferLinked, preferCanonical } from './userCanonical'
import { compressCanonicalMap, normalizeUserId } from './userRefs'

const { userTable, userLinkTable, organizerTable, emailFrom, eventTable } = CONFIG

const dynamoDB = new CustomDynamoClient(userLinkTable)

export const userIsMemberOf = (user: Pick<JsonUser, 'roles'>): string[] =>
  Object.keys(user?.roles ?? {}).filter((orgId) => !!user?.roles?.[orgId])

export const filterRelevantUsers = (users: JsonUser[], user: JsonUser, orgs: string[]) => {
  const memberOf = userIsMemberOf(user)
  const filteredOrgs = new Set(orgs.filter((o) => memberOf.includes(o)))

  return user.admin
    ? users
    : users.filter(
        (u) =>
          u.admin || // admins are always included
          u.judge?.length || // judges are always included
          u.officer?.length || // officers are always included
          Object.keys(u.roles ?? {}).some((orgId) => filteredOrgs.has(orgId))
      )
}

export const getAllUsers = async (): Promise<JsonUser[]> => {
  const users = await dynamoDB.readAll<JsonUser>(userTable)

  return users ?? []
}

export const findUserByEmail = async (email?: string): Promise<JsonUser | undefined> => {
  if (!email) {
    console.warn('findUserByEmail called without email')
    return undefined
  }

  // Defensive normalization: DB emails are expected to be stored in lowercase.
  // Callers may pass mixed-case emails (e.g. from external IdPs).
  const normalizedEmail = email.toLocaleLowerCase().trim()

  const users = await dynamoDB.query<JsonUser>({
    index: 'gsiEmail',
    key: 'email = :email',
    table: userTable,
    values: { ':email': normalizedEmail },
  })

  const activeUsers = users?.filter((user) => !user.deletedAt)

  const exact = activeUsers?.find((user) => user.email === normalizedEmail)

  // Observability: a missing user is a meaningful condition in several flows.
  // Log a warning to make it visible in CloudWatch while keeping it non-fatal.
  if (!exact) {
    // If we got items back but none match exactly, highlight possible data-normalization issues.
    if (activeUsers?.length) {
      console.error('findUserByEmail: queried users but none matched normalized email', {
        normalizedEmail,
        returnedEmails: activeUsers.map((u) => u.email),
      })
    } else {
      console.warn('findUserByEmail: user not found', { normalizedEmail })
    }
  }

  return exact
}

export const updateUser = async (user: JsonUser) => dynamoDB.write(user, userTable)

export const setUserRole = async (
  user: JsonUser,
  orgId: string,
  role: UserRole | 'none',
  modifiedBy: string,
  origin?: string
): Promise<JsonUser> => {
  const t = i18n.getFixedT('fi')
  const roles = { ...user.roles }
  if (role === 'none') {
    delete roles[orgId]
  } else {
    roles[orgId] = role
  }

  const timestamp = new Date().toISOString()

  await dynamoDB.update(
    { id: user.id },
    {
      set: {
        modifiedAt: timestamp,
        modifiedBy,
        roles,
      },
    },
    userTable
  )

  const org = await dynamoDB.read<Organizer>({ id: orgId }, organizerTable)

  if (role !== 'none') {
    await sendTemplatedMail('access', 'fi', emailFrom, [user.email], {
      admin: role === 'admin',
      link: `${origin}/login`,
      orgName: org?.name ?? 'Tuntematon',
      roleName: t(`user.roles.${role}`),
      secretary: role === 'secretary',
      user: {
        email: user.email,
        firstName: (user.name ?? 'Nimetön').split(' ')[0],
      },
    })
  }

  return { ...user, roles }
}

const mergeEventTypes = (a?: string[], b?: string[]) => {
  const set = new Set<string>()
  for (const v of a ?? []) set.add(v)
  for (const v of b ?? []) set.add(v)
  return set.size ? [...set].sort((a, b) => a.localeCompare(b)) : undefined
}

const mergeRoles = (a?: Record<string, UserRole>, b?: Record<string, UserRole>) => {
  if (!a && !b) return undefined
  return { ...a, ...b }
}

const mergeEmailHistory = (
  ...all: Array<JsonUser['emailHistory'] | undefined>
): JsonUser['emailHistory'] | undefined => {
  const merged: EmailHistoryEntry[] = []
  const seen = new Set<string>()
  for (const list of all) {
    for (const e of list ?? []) {
      // De-dupe by (email, changedAt, source) to avoid runaway growth during merges.
      const key = `${e.email}|${e.changedAt}|${e.source}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(e)
    }
  }
  if (!merged.length) return undefined
  // Keep at most 10 entries, newest last.
  return merged.slice(-10)
}

const mergeUsersByKcId = (kcId: number, users: JsonUser[], nowIso: string, linkedUserIds?: Set<string>): JsonUser[] => {
  if (users.length <= 1) return []

  const canonical = pickCanonicalUserPreferLinked(users, linkedUserIds)
  const duplicates = users.filter((u) => u.id !== canonical.id)

  const merged: JsonUser = {
    ...canonical,
    admin: users.some((u) => u.admin) || canonical.admin,
    emailHistory: mergeEmailHistory(...users.map((u) => u.emailHistory)),
    judge: mergeEventTypes(...users.map((u) => u.judge)),
    kcId,
    modifiedAt: nowIso,
    modifiedBy: 'system',
    officer: mergeEventTypes(...users.map((u) => u.officer)),
    roles: mergeRoles(...users.map((u) => u.roles)),
  }

  const write: JsonUser[] = [merged]

  // Mark duplicates deleted, while keeping the records for traceability.
  for (const dupe of duplicates) {
    write.push({
      ...dupe,
      deletedAt: nowIso,
      modifiedAt: nowIso,
      modifiedBy: 'system',
    })
  }

  return write
}

const toEventUser = (
  user: JsonUser | undefined,
  fallback:
    | Partial<{ id?: string; name?: string; email?: string; phone?: string; location?: string; kcId?: number }>
    | undefined
) => {
  if (!user) return fallback ?? {}
  // Event stores a Partial<User>; keep it small but consistent.
  return {
    email: user.email,
    id: user.id,
    kcId: user.kcId,
    location: user.location,
    name: user.name,
    phone: user.phone,
  }
}

const buildItemIndexMaps = (itemsWithEmail: Official[]) => {
  const itemByEmail = new Map<string, Official>()
  const itemByKcId = new Map<number, Official>()
  for (const item of itemsWithEmail) {
    itemByEmail.set(item.email.toLocaleLowerCase(), item)
    if (typeof item.id === 'number') itemByKcId.set(item.id, item)
  }
  return { itemByEmail, itemByKcId }
}

const createNewUserFromItem = (item: Official, dateString: string, eventTypesFiled: 'officer' | 'judge'): JsonUser => {
  const modifiedBy = 'system'
  const normalizedEmail = item.email.toLocaleLowerCase()
  const newUser: JsonUser = {
    createdAt: dateString,
    createdBy: modifiedBy,
    email: normalizedEmail,
    id: nanoid(10),
    kcEmail: normalizedEmail,
    kcId: item.id,
    modifiedAt: dateString,
    modifiedBy,
    name: reverseName(item.name),
    [eventTypesFiled]: item.eventTypes,
  }

  if (item.location) newUser.location = item.location
  if (item.phone) newUser.phone = item.phone

  return newUser
}

const updateExistingUserFromItem = (
  existing: JsonUser,
  item: Official,
  dateString: string,
  eventTypesFiled: 'officer' | 'judge',
  linkedUserIds?: Set<string>
): JsonUser | null => {
  const modifiedBy = 'system'
  const normalizedEmail = item.email.toLocaleLowerCase()
  const keepExistingEmail = linkedUserIds?.has(existing.id) ?? false
  const nextEmail = keepExistingEmail ? existing.email : normalizedEmail
  const emailHistory = keepExistingEmail
    ? undefined
    : appendEmailHistory(existing, existing.email, normalizedEmail, dateString, 'kl')

  const updated: JsonUser = {
    ...existing,
    email: nextEmail,
    kcEmail: normalizedEmail,
    kcId: item.id,
    location: item.location ?? existing.location,
    name: reverseName(item.name),
    phone: item.phone ?? existing.phone,
    [eventTypesFiled]: item.eventTypes,
    ...(emailHistory ? { emailHistory } : {}),
  }
  const changes = Object.keys(diff(existing, updated))
  if (changes.length > 0) {
    console.log(`updating user from item: ${item.name}. changed props: ${changes.join(', ')}`)
    return {
      ...updated,
      modifiedAt: dateString,
      modifiedBy,
    }
  }
  return null
}

const buildUserUpdates = (
  itemsWithEmail: Official[],
  newItems: Official[],
  existingUsers: JsonUser[],
  eventTypesFiled: 'officer' | 'judge',
  linkedUserIds: Set<string>
) => {
  const write: JsonUser[] = []
  const dateString = new Date().toISOString()

  const { itemByEmail, itemByKcId } = buildItemIndexMaps(itemsWithEmail)

  for (const item of newItems) {
    console.log(`creating user from item: ${item.name}, email: ${item.email}`)
    write.push(createNewUserFromItem(item, dateString, eventTypesFiled))
  }

  for (const existing of existingUsers) {
    const item =
      (typeof existing.kcId === 'number' ? itemByKcId.get(existing.kcId) : undefined) ??
      itemByEmail.get(existing.email.toLocaleLowerCase())
    if (!item) continue

    const updated = updateExistingUserFromItem(existing, item, dateString, eventTypesFiled, linkedUserIds)
    if (updated) write.push(updated)
  }

  return write
}

const normalizeItemsWithEmail = (items: Official[] | PartialJsonJudge[]): Official[] => {
  return items.filter((i) => validEmail(i.email)).map((i) => ({ ...i, email: i.email.toLocaleLowerCase() }))
}

const mergeDuplicateUsersByKcId = (allUsers: JsonUser[], linkedUserIds: Set<string>, dateString: string) => {
  const userGroupsByKcId = new Map<number, JsonUser[]>()
  for (const u of allUsers) {
    if (typeof u.kcId !== 'number') continue
    userGroupsByKcId.set(u.kcId, [...(userGroupsByKcId.get(u.kcId) ?? []), u])
  }

  const duplicateIdToCanonicalId = new Map<string, string>()
  const mergeWrites: JsonUser[] = []

  for (const [kcId, group] of userGroupsByKcId) {
    if (group.length <= 1) continue

    const canonical = pickCanonicalUserPreferLinked(group, linkedUserIds)
    for (const dupe of group) {
      if (dupe.id !== canonical.id) duplicateIdToCanonicalId.set(dupe.id, canonical.id)
    }

    mergeWrites.push(...mergeUsersByKcId(kcId, group, dateString, linkedUserIds))
  }

  // Canonical-id path compression:
  // if A -> B and B -> C, collapse to A -> C before rewriting references.
  // This defends against any ordering/tie edge cases where an intermediate canonical
  // may itself be superseded within the same sync run.
  compressCanonicalMap(duplicateIdToCanonicalId)

  return { duplicateIdToCanonicalId, mergeWrites }
}

const applyMergeWrites = (allUsers: JsonUser[], mergeWrites: JsonUser[]) => {
  const effectiveUsersById = new Map<string, JsonUser>()
  for (const u of allUsers) effectiveUsersById.set(u.id, u)
  for (const u of mergeWrites) effectiveUsersById.set(u.id, u)
  const effectiveUsers = [...effectiveUsersById.values()]
  const effectiveUsersWithEmail = effectiveUsers.filter((u) => !u.deletedAt && validEmail(u.email))
  return { effectiveUsers, effectiveUsersWithEmail }
}

const updateEventReferences = async (
  duplicateIdToCanonicalId: Map<string, string>,
  allUsers: JsonUser[],
  mergeWrites: JsonUser[],
  dateString: string
) => {
  const mergedUserMap = new Map<string, JsonUser>()
  for (const u of allUsers) mergedUserMap.set(u.id, u)
  for (const u of mergeWrites) mergedUserMap.set(u.id, u)

  const events = (await dynamoDB.readAll<JsonDogEvent>(eventTable)) ?? []

  const mapEventUserRefs = (evt: JsonDogEvent) => {
    const oldOfficialId = normalizeUserId(evt.official?.id)
    const oldSecretaryId = normalizeUserId(evt.secretary?.id)
    const newOfficialId = oldOfficialId ? duplicateIdToCanonicalId.get(oldOfficialId) : undefined
    const newSecretaryId = oldSecretaryId ? duplicateIdToCanonicalId.get(oldSecretaryId) : undefined

    if (!newOfficialId && !newSecretaryId) return undefined

    const updatedOfficial = newOfficialId ? toEventUser(mergedUserMap.get(newOfficialId), evt.official) : evt.official
    const updatedSecretary = newSecretaryId
      ? toEventUser(mergedUserMap.get(newSecretaryId), evt.secretary)
      : evt.secretary

    return { updatedOfficial, updatedSecretary }
  }

  for (const evt of events) {
    const mapped = mapEventUserRefs(evt)
    if (!mapped) continue

    await dynamoDB.update(
      { id: evt.id },
      {
        set: {
          modifiedAt: dateString,
          modifiedBy: 'system',
          official: mapped.updatedOfficial,
          secretary: mapped.updatedSecretary,
        },
      },
      eventTable
    )
  }
}

const matchIncomingItems = (
  itemsWithEmail: Official[],
  effectiveUsers: JsonUser[],
  effectiveUsersWithEmail: JsonUser[],
  linkedUserIds: Set<string>
) => {
  const existingByKcId = new Map<number, JsonUser>()
  for (const u of effectiveUsers) {
    if (typeof u.kcId !== 'number') continue
    const prev = existingByKcId.get(u.kcId)
    existingByKcId.set(u.kcId, prev ? preferCanonical(prev, u, linkedUserIds) : u)
  }

  const existingByEmail = new Map<string, JsonUser>()
  for (const u of effectiveUsersWithEmail) {
    existingByEmail.set(u.email.toLocaleLowerCase(), u)
  }

  const matchedExisting: JsonUser[] = []
  const newItems: Official[] = []
  for (const item of itemsWithEmail) {
    const byKcId = typeof item.id === 'number' ? existingByKcId.get(item.id) : undefined
    const byEmail = existingByEmail.get(item.email)
    const existing = byKcId ?? byEmail
    if (existing) {
      matchedExisting.push(existing)
    } else {
      newItems.push(item)
    }
  }

  return { matchedExisting, newItems }
}

type UserSyncContext = {
  dateString: string
  allUsers: JsonUser[]
  linkedUserIds: Set<string>
  itemsWithEmail: Official[]
}

type UserSyncPlan = {
  duplicateIdToCanonicalId: Map<string, string>
  mergeWrites: JsonUser[]
  upsertWrites: JsonUser[]
}

const loadSyncContext = async (
  dynamoDB: CustomDynamoClient,
  items: Official[] | PartialJsonJudge[]
): Promise<UserSyncContext> => {
  const dateString = new Date().toISOString()
  const allUsers = (await dynamoDB.readAll<JsonUser>(userTable)) ?? []

  // Prefer keeping user records that have actually been used to log in.
  const userLinksDb = new CustomDynamoClient(userLinkTable)
  const userLinks = (await userLinksDb.readAll<UserLink>(userLinkTable)) ?? []
  const linkedUserIds = new Set<string>(userLinks.map((l) => String(l.userId)))

  const itemsWithEmail = normalizeItemsWithEmail(items)
  return { allUsers, dateString, itemsWithEmail, linkedUserIds }
}

const planUserSync = (ctx: UserSyncContext, eventTypesFiled: 'officer' | 'judge'): UserSyncPlan => {
  const { duplicateIdToCanonicalId, mergeWrites } = mergeDuplicateUsersByKcId(
    ctx.allUsers,
    ctx.linkedUserIds,
    ctx.dateString
  )
  const { effectiveUsers, effectiveUsersWithEmail } = applyMergeWrites(ctx.allUsers, mergeWrites)

  const { matchedExisting, newItems } = matchIncomingItems(
    ctx.itemsWithEmail,
    effectiveUsers,
    effectiveUsersWithEmail,
    ctx.linkedUserIds
  )

  const upsertWrites = buildUserUpdates(
    ctx.itemsWithEmail,
    newItems,
    matchedExisting,
    eventTypesFiled,
    ctx.linkedUserIds
  )
  return { duplicateIdToCanonicalId, mergeWrites, upsertWrites }
}

const applyUserSyncPlan = async (dynamoDB: CustomDynamoClient, ctx: UserSyncContext, plan: UserSyncPlan) => {
  if (plan.duplicateIdToCanonicalId.size) {
    await updateEventReferences(plan.duplicateIdToCanonicalId, ctx.allUsers, plan.mergeWrites, ctx.dateString)
  }

  // Merge + upsert may both produce writes for the same user id.
  const writeById = new Map<string, JsonUser>()
  for (const u of plan.mergeWrites) writeById.set(u.id, u)
  for (const u of plan.upsertWrites) writeById.set(u.id, u)
  const write = [...writeById.values()]

  if (write.length) {
    try {
      await dynamoDB.batchWrite(write, userTable)
    } catch (e) {
      console.error(e)
      console.log('write:')
      for (const user of write) {
        console.log(user)
      }
      throw e
    }
  }
}

export const updateUsersFromOfficialsOrJudges = async (
  dynamoDB: CustomDynamoClient,
  items: Official[] | PartialJsonJudge[],
  eventTypesFiled: 'officer' | 'judge'
) => {
  if (!items.length) return

  const context = await loadSyncContext(dynamoDB, items)
  const plan = planUserSync(context, eventTypesFiled)
  await applyUserSyncPlan(dynamoDB, context, plan)
}

// Expose internal helpers for unit testing (no runtime usage elsewhere)
export const __testables = {
  loadSyncContext,
  matchIncomingItems,
  mergeEventTypes,
  mergeRoles,
  mergeUsersByKcId,
  planUserSync,
  toEventUser,
}
