import type { JsonUser, Official, Organizer, UserRole } from '../../types'
import type { PartialJsonJudge } from './judge'

import { diff } from 'deep-object-diff'
import { nanoid } from 'nanoid'

import { i18n } from '../../i18n/lambda'
import { validEmail } from '../../lib/email'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

import { sendTemplatedMail } from './email'
import { reverseName } from './string'

const { userTable, userLinkTable, organizerTable, emailFrom } = CONFIG

const dynamoDB = new CustomDynamoClient(userLinkTable)

export const userIsMemberOf = (user: Pick<JsonUser, 'roles'>): string[] =>
  Object.keys(user?.roles ?? {}).filter((orgId) => !!user?.roles?.[orgId])

export const filterRelevantUsers = (users: JsonUser[], user: JsonUser, orgs: string[]) => {
  const memberOf = userIsMemberOf(user)
  const filteredOrgs = orgs.filter((o) => memberOf.includes(o))

  return user.admin
    ? users
    : users.filter(
        (u) =>
          u.admin || // admins are always included
          u.judge?.length || // judges are always included
          u.officer?.length || // officers are always included
          Object.keys(u.roles ?? {}).some((orgId) => filteredOrgs.includes(orgId))
      )
}

export const getAllUsers = async (): Promise<JsonUser[]> => {
  const users = await dynamoDB.readAll<JsonUser>(userTable)

  return users ?? []
}

export const findUserByEmail = async (email?: string): Promise<JsonUser | undefined> => {
  if (!email) return undefined

  const users = await dynamoDB.query<JsonUser>('email = :email', { ':email': email }, userTable, 'gsiEmail')

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

const buildUserUpdates = (
  itemsWithEmail: Official[],
  newItems: Official[],
  existingUsers: JsonUser[],
  eventTypesFiled: 'officer' | 'judge'
) => {
  const write: JsonUser[] = []
  const modifiedBy = 'system'
  const dateString = new Date().toISOString()

  for (const item of newItems) {
    if (!validEmail(item.email)) {
      console.log(`skipping item due to invalid email: ${item.name}, email: ${item.email}`)
      continue
    }
    console.log(`creating user from item: ${item.name}, email: ${item.email}`)
    const newUser: JsonUser = {
      id: nanoid(10),
      createdAt: dateString,
      createdBy: modifiedBy,
      modifiedAt: dateString,
      modifiedBy,
      name: reverseName(item.name),
      email: item.email,
      kcId: item.id,
      [eventTypesFiled]: item.eventTypes,
    }

    if (item.location) newUser.location = item.location
    if (item.phone) newUser.phone = item.phone

    write.push(newUser)
  }

  for (const existing of existingUsers) {
    const item = itemsWithEmail.find((o) => o.email === existing.email.toLocaleLowerCase())
    if (!item) continue
    const updated: JsonUser = {
      ...existing,
      name: reverseName(item.name),
      email: item.email,
      kcId: item.id,
      location: item.location ?? existing.location,
      phone: item.phone ?? existing.phone,
      [eventTypesFiled]: item.eventTypes,
    }
    const changes = Object.keys(diff(existing, updated))
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

  const allUsers = (await dynamoDB.readAll<JsonUser>(userTable)) ?? []
  const allUsersWithEmail = allUsers.filter((u) => validEmail(u.email))
  const existingUsers = allUsersWithEmail.filter((u) => items.find((o) => o.email === u.email.toLocaleLowerCase()))
  const itemsWithEmail = items.filter((i) => validEmail(i.email))
  const newItems = itemsWithEmail.filter((i) => !allUsersWithEmail.find((u) => u.email.toLocaleLowerCase() === i.email))

  const write = buildUserUpdates(itemsWithEmail, newItems, existingUsers, eventTypesFiled)

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
