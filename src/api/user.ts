import type { User, UserRole } from '../types'
import http, { withToken } from './http'

export const getUser = async (token: string, signal?: AbortSignal) =>
  http.get<User>('/user', withToken({ signal }, token))

export const getUsers = async (token: string, signal?: AbortSignal) =>
  http.get<User[]>('/admin/user', withToken({ signal }, token))

export const putUser = async (user: User, token?: string, signal?: AbortSignal): Promise<User> =>
  http.post<User, User>('/admin/user', user, withToken({ signal }, token))

export const putAdmin = async (
  item: { userId: string; admin: boolean },
  token: string | undefined,
  signal?: AbortSignal
): Promise<User> =>
  http.post<{ userId: string; admin: boolean }, User>('/admin/user/admin', item, withToken({ signal }, token))

export interface RoleItem {
  userId: string
  orgId: string
  role: UserRole | 'none'
}

export const putRole = async (item: RoleItem, token: string | undefined, signal?: AbortSignal): Promise<User> =>
  http.post<RoleItem, User>('/admin/user/role', item, withToken({ signal }, token))

export const putUserName = async (
  name: string,
  token: string,
  signal?: AbortSignal
): Promise<Pick<User, 'name' | 'email' | 'id'>> =>
  http.post<{ name: string }, Pick<User, 'name' | 'email' | 'id'>>('/user/name', { name }, withToken({ signal }, token))
