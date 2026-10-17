import type { CollectionResponse, IncrementalCollectionResponse, JsonUser, User, UserRole } from '../types'
import { toCollection, toUser } from '../lib/wire'
import http, { withToken } from './http'

export const getUser = async (token: string, signal?: AbortSignal, coalesceRevision?: number) =>
  toUser(await http.get<JsonUser>('/user', withToken({ coalesceRevision, signal }, token)))

export function getUsers(token: string, signal?: AbortSignal): Promise<User[]>
export function getUsers(
  token: string,
  signal: AbortSignal | undefined,
  since: Date
): Promise<IncrementalCollectionResponse<User>>
export async function getUsers(token: string, signal?: AbortSignal, since?: Date): Promise<CollectionResponse<User>> {
  const query = since ? `?since=${since.getTime()}` : ''
  return toCollection(
    await http.get<CollectionResponse<JsonUser>>(`/admin/user${query}`, withToken({ signal }, token)),
    toUser
  )
}

export const putUser = async (user: User, token?: string, signal?: AbortSignal): Promise<User> =>
  toUser((await http.post<User, JsonUser>('/admin/user', user, withToken({ signal }, token))).data)

export const putAdmin = async (
  item: { userId: string; admin: boolean },
  token: string | undefined,
  signal?: AbortSignal
): Promise<User> =>
  toUser(
    (
      await http.post<{ userId: string; admin: boolean }, JsonUser>(
        '/admin/user/admin',
        item,
        withToken({ signal }, token)
      )
    ).data
  )

export interface RoleItem {
  userId: string
  orgId: string
  role: UserRole | 'none'
}

export const putRole = async (item: RoleItem, token: string | undefined, signal?: AbortSignal): Promise<User> =>
  toUser((await http.post<RoleItem, JsonUser>('/admin/user/role', item, withToken({ signal }, token))).data)

export const putUserName = async (
  name: string,
  token: string,
  signal?: AbortSignal
): Promise<Pick<User, 'name' | 'email' | 'id'>> =>
  (
    await http.post<{ name: string }, Pick<User, 'name' | 'email' | 'id'>>(
      '/user/name',
      { name },
      withToken({ signal }, token)
    )
  ).data
