import type { JsonUser, Organizer, UserRole } from 'koekalenteri-shared/model'

import { EMAIL_FROM, sendTemplatedMail } from '../handlers/email'
import { i18n } from '../i18n'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const USER_LINK_TABLE = process.env.USER_LINK_TABLE_NAME
const USER_TABLE = process.env.USER_TABLE_NAME

const dynamoDB = new CustomDynamoClient(USER_LINK_TABLE)

let cache: JsonUser[] | undefined

export async function getAllUsers() {
  if (!cache) {
    cache = await dynamoDB.readAll<JsonUser>(USER_TABLE)
  }
  return cache
}

export async function findUserByEmail(email: string) {
  const users = await getAllUsers()

  return users?.find((user) => user.email === email)
}

export async function updateUser(user: JsonUser) {
  await dynamoDB.write(user, USER_TABLE)

  if (cache) {
    const idx = cache?.findIndex((u) => u.id === user.id)
    if (idx >= 0) {
      cache[idx] = user
    } else {
      cache.push(user)
    }
  }
}

export async function setUserRole(
  user: JsonUser,
  orgId: string,
  role: UserRole | 'none',
  modifiedBy: string,
  origin?: string
) {
  const t = i18n.getFixedT('fi')
  const roles = user.roles || {}
  if (role === 'none') {
    delete roles[orgId]
  } else {
    roles[orgId] = role
  }

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
      ':modAt': new Date().toISOString(),
      ':modBy': modifiedBy,
    },
    USER_TABLE
  )

  const org = await dynamoDB.read<Organizer>({ id: orgId }, process.env.ORGANIZER_TABLE_NAME)

  if (role !== 'none') {
    await sendTemplatedMail('access', 'fi', EMAIL_FROM, [user.email], {
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
