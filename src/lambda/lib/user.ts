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

  const exact = users?.find((user) => user.email === normalizedEmail)

  // Observability: a missing user is a meaningful condition in several flows.
  // Log a warning to make it visible in CloudWatch while keeping it non-fatal.
  if (!exact) {
    // If we got items back but none match exactly, highlight possible data-normalization issues.
    if (users?.length) {
      console.error('findUserByEmail: queried users but none matched normalized email', {
        normalizedEmail,
        returnedEmails: users.map((u) => u.email),
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
  const roles = user.roles || {}
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

const pickCanonicalUser = (users: JsonUser[]): JsonUser => {
  return pickCanonicalUserPreferLinked(users)
}

const pickCanonicalUserPreferLinked = (users: JsonUser[], linkedUserIds?: Set<string>): JsonUser => {
  const score = (u: JsonUser) => {
    // Strongly prefer user records that have actually been used to log in (i.e. have a user-link).
    // This keeps Cognito subject -> userId links stable when KL-driven email changes cause duplicates.
    const linkedBonus = linkedUserIds?.has(u.id) ? 2000 : 0
    const rolesCount = Object.keys(u.roles ?? {}).length
    const officerCount = Array.isArray(u.officer) ? u.officer.length : 0
    const judgeCount = Array.isArray(u.judge) ? u.judge.length : 0
    const admin = u.admin ? 1000 : 0
    return linkedBonus + admin + rolesCount * 10 + officerCount + judgeCount
  }
  return [...users].sort((a, b) => {
    const ds = score(b) - score(a)
    if (ds !== 0) return ds
    const ta = a.modifiedAt ? Date.parse(a.modifiedAt) : 0
    const tb = b.modifiedAt ? Date.parse(b.modifiedAt) : 0
    return tb - ta
  })[0]
}

const preferCanonical = (a: JsonUser, b: JsonUser, linkedUserIds?: Set<string>) =>
  pickCanonicalUserPreferLinked([a, b], linkedUserIds)

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
  eventTypesFiled: 'officer' | 'judge'
): JsonUser | null => {
  const modifiedBy = 'system'
  const normalizedEmail = item.email.toLocaleLowerCase()
  const emailHistory = appendEmailHistory(existing, existing.email, normalizedEmail, dateString, 'kl')

  const updated: JsonUser = {
    ...existing,
    email: normalizedEmail,
    kcId: item.id,
    location: item.location ?? existing.location,
    name: reverseName(item.name),
    phone: item.phone ?? existing.phone,
    [eventTypesFiled]: item.eventTypes,
    ...(emailHistory ? { emailHistory } : {}),
  }
  const changes = Object.keys(diff(existing, updated))
  // Defensive: some equality edge cases (and/or upstream data quirks) can cause `diff` to miss
  // an email change. Ensure we still update when KL email differs.
  if (existing.email?.toLocaleLowerCase() !== normalizedEmail && !changes.includes('email')) {
    changes.push('email')
  }
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
  eventTypesFiled: 'officer' | 'judge'
) => {
  const write: JsonUser[] = []
  const dateString = new Date().toISOString()

  const { itemByEmail, itemByKcId } = buildItemIndexMaps(itemsWithEmail)

  for (const item of newItems) {
    if (!validEmail(item.email)) {
      console.log(`skipping item due to invalid email: ${item.name}, email: ${item.email}`)
      continue
    }
    console.log(`creating user from item: ${item.name}, email: ${item.email}`)
    write.push(createNewUserFromItem(item, dateString, eventTypesFiled))
  }

  for (const existing of existingUsers) {
    const item =
      (typeof existing.kcId === 'number' ? itemByKcId.get(existing.kcId) : undefined) ??
      itemByEmail.get(existing.email.toLocaleLowerCase())
    if (!item) continue

    const updated = updateExistingUserFromItem(existing, item, dateString, eventTypesFiled)
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

  return { duplicateIdToCanonicalId, mergeWrites }
}

const applyMergeWrites = (allUsers: JsonUser[], mergeWrites: JsonUser[]) => {
  const effectiveUsersById = new Map<string, JsonUser>()
  for (const u of allUsers) effectiveUsersById.set(u.id, u)
  for (const u of mergeWrites) effectiveUsersById.set(u.id, u)
  const effectiveUsers = [...effectiveUsersById.values()]
  const effectiveUsersWithEmail = effectiveUsers.filter((u) => validEmail(u.email))
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

  const eventsDb = new CustomDynamoClient(eventTable)
  const events = (await eventsDb.readAll<JsonDogEvent>(eventTable)) ?? []

  for (const evt of events) {
    const oldOfficialId = evt.official?.id
    const oldSecretaryId = evt.secretary?.id
    const newOfficialId = oldOfficialId ? duplicateIdToCanonicalId.get(String(oldOfficialId)) : undefined
    const newSecretaryId = oldSecretaryId ? duplicateIdToCanonicalId.get(String(oldSecretaryId)) : undefined

    if (newOfficialId || newSecretaryId) {
      const updatedOfficial = newOfficialId ? toEventUser(mergedUserMap.get(newOfficialId), evt.official) : evt.official
      const updatedSecretary = newSecretaryId
        ? toEventUser(mergedUserMap.get(newSecretaryId), evt.secretary)
        : evt.secretary

      await eventsDb.update(
        { id: evt.id },
        {
          set: {
            modifiedAt: dateString,
            modifiedBy: 'system',
            official: updatedOfficial,
            secretary: updatedSecretary,
          },
        },
        eventTable
      )
    }
  }
}

const matchItemsToUsers = (
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

export const updateUsersFromOfficialsOrJudges = async (
  dynamoDB: CustomDynamoClient,
  items: Official[] | PartialJsonJudge[],
  eventTypesFiled: 'officer' | 'judge'
) => {
  if (!items.length) return

  const dateString = new Date().toISOString()
  const allUsers = (await dynamoDB.readAll<JsonUser>(userTable)) ?? []

  // Prefer keeping user records that have actually been used to log in.
  const userLinksDb = new CustomDynamoClient(userLinkTable)
  const userLinks = (await userLinksDb.readAll<UserLink>(userLinkTable)) ?? []
  const linkedUserIds = new Set<string>(userLinks.map((l) => String(l.userId)))

  // 1) Normalize incoming emails from KL to lowercase.
  const itemsWithEmail = normalizeItemsWithEmail(items)

  // 2) Merge existing duplicates in our DB by kcId (KL member id).
  const { duplicateIdToCanonicalId, mergeWrites } = mergeDuplicateUsersByKcId(allUsers, linkedUserIds, dateString)

  // 3) Apply merge writes to get effective user list.
  const { effectiveUsers, effectiveUsersWithEmail } = applyMergeWrites(allUsers, mergeWrites)

  // 4) Update event references if we merged users.
  if (duplicateIdToCanonicalId.size) {
    await updateEventReferences(duplicateIdToCanonicalId, allUsers, mergeWrites, dateString)
  }

  // 5) Upsert users from KL data: match by kcId first, fallback to email.
  const { matchedExisting, newItems } = matchItemsToUsers(
    itemsWithEmail,
    effectiveUsers,
    effectiveUsersWithEmail,
    linkedUserIds
  )

  // 6) Merge + upsert may both produce writes for the same user id.
  const writeById = new Map<string, JsonUser>()
  for (const u of mergeWrites) writeById.set(u.id, u)
  for (const u of buildUserUpdates(itemsWithEmail, newItems, matchedExisting, eventTypesFiled)) writeById.set(u.id, u)
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

// Expose internal helpers for unit testing (no runtime usage elsewhere)
export const __testables = {
  mergeEventTypes,
  mergeRoles,
  mergeUsersByKcId,
  pickCanonicalUser,
  pickCanonicalUserPreferLinked,
  preferCanonical,
  toEventUser,
}
