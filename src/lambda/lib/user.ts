import type { JsonDogEvent, JsonUser, Official, Organizer, UserRole } from '../../types'
import type { PartialJsonJudge } from './judge'

import { diff } from 'deep-object-diff'
import { nanoid } from 'nanoid'

import { i18n } from '../../i18n/lambda'
import { validEmail } from '../../lib/email'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

import { sendTemplatedMail } from './email'
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
  if (!email) return undefined

  const users = await dynamoDB.query<JsonUser>({
    key: 'email = :email',
    values: { ':email': email },
    table: userTable,
    index: 'gsiEmail',
  })

  return users?.find((user) => user.email === email)
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
        roles,
        modifiedAt: timestamp,
        modifiedBy,
      },
    },
    userTable
  )

  const org = await dynamoDB.read<Organizer>({ id: orgId }, organizerTable)

  if (role !== 'none') {
    await sendTemplatedMail('access', 'fi', emailFrom, [user.email], {
      user: {
        firstName: (user.name ?? 'Nimetön').split(' ')[0],
        email: user.email,
      },
      link: `${origin}/login`,
      orgName: org?.name ?? 'Tuntematon',
      roleName: t(`user.roles.${role}`),
      admin: role === 'admin',
      secretary: role === 'secretary',
    })
  }

  return { ...user, roles }
}

const mergeEventTypes = (a?: string[], b?: string[]) => {
  const set = new Set<string>()
  for (const v of a ?? []) set.add(v)
  for (const v of b ?? []) set.add(v)
  return set.size ? [...set].sort() : undefined
}

const mergeRoles = (a?: Record<string, UserRole>, b?: Record<string, UserRole>) => {
  if (!a && !b) return undefined
  return { ...(a ?? {}), ...(b ?? {}) }
}

const pickCanonicalUser = (users: JsonUser[]): JsonUser => {
  const score = (u: JsonUser) => {
    const rolesCount = Object.keys(u.roles ?? {}).length
    const officerCount = Array.isArray(u.officer) ? u.officer.length : 0
    const judgeCount = Array.isArray(u.judge) ? u.judge.length : 0
    const admin = u.admin ? 1000 : 0
    return admin + rolesCount * 10 + officerCount + judgeCount
  }
  return [...users].sort((a, b) => {
    const ds = score(b) - score(a)
    if (ds !== 0) return ds
    const ta = a.modifiedAt ? Date.parse(a.modifiedAt) : 0
    const tb = b.modifiedAt ? Date.parse(b.modifiedAt) : 0
    return tb - ta
  })[0]
}

const preferCanonical = (a: JsonUser, b: JsonUser) => pickCanonicalUser([a, b])

const mergeUsersByKcId = (kcId: number, users: JsonUser[], nowIso: string): JsonUser[] => {
  if (users.length <= 1) return []

  const canonical = pickCanonicalUser(users)
  const duplicates = users.filter((u) => u.id !== canonical.id)

  const merged: JsonUser = {
    ...canonical,
    kcId,
    admin: users.some((u) => u.admin) || canonical.admin,
    roles: mergeRoles(...users.map((u) => u.roles)) as JsonUser['roles'],
    officer: mergeEventTypes(...users.map((u) => u.officer)) as JsonUser['officer'],
    judge: mergeEventTypes(...users.map((u) => u.judge)) as JsonUser['judge'],
    modifiedAt: nowIso,
    modifiedBy: 'system',
  }

  const write: JsonUser[] = [merged]

  // Make duplicates non-relevant (so they won't show up in officer/secretary lists),
  // while keeping the records for traceability.
  for (const dupe of duplicates) {
    write.push({
      ...dupe,
      admin: false,
      roles: undefined,
      officer: undefined,
      judge: undefined,
      modifiedAt: nowIso,
      modifiedBy: 'system',
    })
  }

  return write
}

const toEventUser = (user: JsonUser | undefined, fallback: Partial<{ id?: string; name?: string; email?: string; phone?: string; location?: string; kcId?: number }> | undefined) => {
  if (!user) return fallback ?? {}
  // Event stores a Partial<User>; keep it small but consistent.
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    location: user.location,
    kcId: user.kcId,
  }
}

const buildUserUpdates = (
  itemsWithEmail: Official[],
  newItems: Official[],
  existingUsers: JsonUser[],
  eventTypesFiled: 'officer' | 'judge'
) => {
  const write: JsonUser[] = []
  const modifiedBy = 'system'
  const dateString = new Date().toISOString()

  const itemByEmail = new Map<string, Official>()
  const itemByKcId = new Map<number, Official>()
  for (const item of itemsWithEmail) {
    itemByEmail.set(item.email.toLocaleLowerCase(), item)
    if (typeof item.id === 'number') itemByKcId.set(item.id, item)
  }

  for (const item of newItems) {
    if (!validEmail(item.email)) {
      console.log(`skipping item due to invalid email: ${item.name}, email: ${item.email}`)
      continue
    }
    const normalizedEmail = item.email.toLocaleLowerCase()
    console.log(`creating user from item: ${item.name}, email: ${item.email}`)
    const newUser: JsonUser = {
      id: nanoid(10),
      createdAt: dateString,
      createdBy: modifiedBy,
      modifiedAt: dateString,
      modifiedBy,
      name: reverseName(item.name),
      email: normalizedEmail,
      kcId: item.id,
      [eventTypesFiled]: item.eventTypes,
    }

    if (item.location) newUser.location = item.location
    if (item.phone) newUser.phone = item.phone

    write.push(newUser)
  }

  for (const existing of existingUsers) {
    const item =
      (typeof existing.kcId === 'number' ? itemByKcId.get(existing.kcId) : undefined) ??
      itemByEmail.get(existing.email.toLocaleLowerCase())
    if (!item) continue
    const normalizedEmail = item.email.toLocaleLowerCase()
    const updated: JsonUser = {
      ...existing,
      name: reverseName(item.name),
      email: normalizedEmail,
      kcId: item.id,
      location: item.location ?? existing.location,
      phone: item.phone ?? existing.phone,
      [eventTypesFiled]: item.eventTypes,
    }
    const changes = Object.keys(diff(existing, updated))
    // Defensive: some equality edge cases (and/or upstream data quirks) can cause `diff` to miss
    // an email change. Ensure we still update when KL email differs.
    if (existing.email?.toLocaleLowerCase() !== normalizedEmail && !changes.includes('email')) {
      changes.push('email')
    }
    if (changes.length > 0) {
      console.log(`updating user from item: ${item.name}. changed props: ${changes.join(', ')}`)
      write.push({
        ...updated,
        modifiedAt: dateString,
        modifiedBy,
      })
    }
  }

  return write
}

export const updateUsersFromOfficialsOrJudges = async (
  dynamoDB: CustomDynamoClient,
  items: Official[] | PartialJsonJudge[],
  eventTypesFiled: 'officer' | 'judge'
) => {
  if (!items.length) return

  const dateString = new Date().toISOString()

  const allUsers = (await dynamoDB.readAll<JsonUser>(userTable)) ?? []
  const allUsersWithEmail = allUsers.filter((u) => validEmail(u.email))

  // Normalize incoming emails from KL to lowercase.
  const itemsWithEmail = items
    .filter((i) => validEmail(i.email))
    .map((i) => ({ ...i, email: i.email.toLocaleLowerCase() }))

  // 1) Merge existing duplicates in our DB by kcId (KL member id).
  //    KL users can change their email; kcId should remain stable.
  const userGroupsByKcId = new Map<number, JsonUser[]>()
  for (const u of allUsers) {
    if (typeof u.kcId !== 'number') continue
    userGroupsByKcId.set(u.kcId, [...(userGroupsByKcId.get(u.kcId) ?? []), u])
  }

  const duplicateIdToCanonicalId = new Map<string, string>()
  const mergeWrites: JsonUser[] = []
  for (const [kcId, group] of userGroupsByKcId) {
    if (group.length <= 1) continue

    const canonical = pickCanonicalUser(group)
    for (const dupe of group) {
      if (dupe.id !== canonical.id) duplicateIdToCanonicalId.set(dupe.id, canonical.id)
    }

    mergeWrites.push(...mergeUsersByKcId(kcId, group, dateString))
  }

  // Apply merge writes on top of the original user list so subsequent matching/upserts
  // see the canonical user with merged roles/officer/judge etc.
  const effectiveUsersById = new Map<string, JsonUser>()
  for (const u of allUsers) effectiveUsersById.set(u.id, u)
  for (const u of mergeWrites) effectiveUsersById.set(u.id, u)
  const effectiveUsers = [...effectiveUsersById.values()]
  const effectiveUsersWithEmail = effectiveUsers.filter((u) => validEmail(u.email))

  // If we merged users, also update any stored event references (official/secretary) to the canonical user id.
  if (duplicateIdToCanonicalId.size) {
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

      if (!newOfficialId && !newSecretaryId) continue

      const updatedOfficial = newOfficialId
        ? toEventUser(mergedUserMap.get(newOfficialId), evt.official)
        : evt.official
      const updatedSecretary = newSecretaryId
        ? toEventUser(mergedUserMap.get(newSecretaryId), evt.secretary)
        : evt.secretary

      await eventsDb.update(
        { id: evt.id },
        {
          set: {
            official: updatedOfficial,
            secretary: updatedSecretary,
            modifiedAt: dateString,
            modifiedBy: 'system',
          },
        },
        eventTable
      )
    }
  }

  // 2) Upsert users from KL data: match by kcId first, fallback to email.
  const existingByKcId = new Map<number, JsonUser>()
  for (const u of effectiveUsers) {
    if (typeof u.kcId !== 'number') continue
    const prev = existingByKcId.get(u.kcId)
    existingByKcId.set(u.kcId, prev ? preferCanonical(prev, u) : u)
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

  // Merge + upsert may both produce writes for the same user id.
  // Ensure we only write one item per id, and that the upsert version wins.
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
  pickCanonicalUser,
  mergeUsersByKcId,
  toEventUser,
  preferCanonical,
}