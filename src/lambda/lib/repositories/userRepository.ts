import type { JsonUser } from '../../../types'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.userTable)

/** The user with this id, or undefined when there is none. */
export const readUser = async (id: string): Promise<JsonUser | undefined> => dynamoDB.read<JsonUser>({ id })

/**
 * Every live user the table holds. A full scan, kept on purpose for the user list and the judge and
 * official sync (KOE-1341).
 */
export const readAllUsers = async (): Promise<JsonUser[]> => (await dynamoDB.readAll<JsonUser>()) ?? []

/**
 * The users stored under this address in `gsiEmail`, deleted ones included. The address is matched
 * as given: each caller normalises it the way its own lookup needs.
 */
export const queryUsersByEmail = async (email: string): Promise<JsonUser[]> =>
  (await dynamoDB.query<JsonUser>({
    index: 'gsiEmail',
    key: 'email = :email',
    values: { ':email': email },
  })) ?? []

/** Stores the user record as given, replacing the stored one. */
export const writeUser = async (user: JsonUser) => dynamoDB.write(user)

/** Stores the user records as given, in batches. */
export const writeUsers = async (users: JsonUser[]) => {
  await dynamoDB.batchWrite(users)
}

/** Replaces the user's organization roles. */
export const writeUserRoles = async (
  id: string,
  roles: NonNullable<JsonUser['roles']>,
  modifiedAt: string,
  modifiedBy: string
) => {
  await dynamoDB.update({ id }, { set: { modifiedAt, modifiedBy, roles } })
}

/** Grants or takes away the user's admin rights. */
export const writeUserAdmin = async (id: string, admin: boolean, modifiedAt: string, modifiedBy: string) => {
  await dynamoDB.update({ id }, { set: { admin, modifiedAt, modifiedBy } })
}
