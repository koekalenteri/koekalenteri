import type { JsonUser, Organizer, UserRole } from '../../types'

import { i18n } from '../../i18n/lambda'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

import { sendTemplatedMail } from './email'

const { userTable, userLinkTable, organizerTable, emailFrom } = CONFIG

const dynamoDB = new CustomDynamoClient(userLinkTable)

export const userIsMemberOf = (user: JsonUser): string[] =>
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

export const findUserByEmail = async (email: string): Promise<JsonUser | undefined> => {
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
    'set #roles = :roles, #modAt = :modAt, #modBy = :modBy',
    {
      '#roles': 'roles',
      '#modAt': 'modifiedAt',
      '#modBy': 'modifiedBy',
    },
    {
      ':roles': roles,
      ':modAt': timestamp,
      ':modBy': modifiedBy,
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
