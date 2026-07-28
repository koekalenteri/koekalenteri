import type { CollectionResponse, IncrementalCollectionResponse, User, UserRole } from '../types'
import http, { withToken } from './http'

export const getUser = async (token: string, signal?: AbortSignal, coalesceRevision?: number) =>
  http.get<User>('/user', withToken({ coalesceRevision, signal }, token))

export function getUsers(token: string, signal?: AbortSignal): Promise<User[]>
export function getUsers(
  token: string,
  signal: AbortSignal | undefined,
  since: Date
): Promise<IncrementalCollectionResponse<User>>
export function getUsers(token: string, signal?: AbortSignal, since?: Date): Promise<CollectionResponse<User>> {
  const query = since ? `?since=${since.getTime()}` : ''
  return http.get<CollectionResponse<User>>(`/admin/user${query}`, withToken({ signal }, token))
}

export const putUser = async (user: User, token?: string, signal?: AbortSignal): Promise<User> =>
  (await http.post<User, User>('/admin/user', user, withToken({ signal }, token))).data

export const putAdmin = async (
  item: { userId: string; admin: boolean },
  token: string | undefined,
  signal?: AbortSignal
): Promise<User> =>
  (await http.post<{ userId: string; admin: boolean }, User>('/admin/user/admin', item, withToken({ signal }, token)))
    .data

export interface RoleItem {
  userId: string
  orgId: string
  role: UserRole | 'none'
}

export const putRole = async (item: RoleItem, token: string | undefined, signal?: AbortSignal): Promise<User> =>
  (await http.post<RoleItem, User>('/admin/user/role', item, withToken({ signal }, token))).data

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
