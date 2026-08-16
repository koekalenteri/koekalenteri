import type { AtomEffect, SetterOrUpdater } from 'recoil'
import type { Official } from '../../../types'
import i18next from 'i18next'
import { useRecoilValue, useSetRecoilState } from 'recoil'
import { getUsers } from '../../../api/user'
import { validIdTokenSelector } from '../../recoil'
import { createCachedRemoteCollectionEffect } from './cached/createCachedRemoteCollection'
import { adminUsersAtom } from './user'

interface OfficialDirectoryEffectOptions<T extends Official> {
  cacheKey: 'judges' | 'officials'
  fetch: (token: string) => Promise<T[]>
}

const sortOfficialDirectory = <T extends Official>(entries: T[]): T[] =>
  entries.sort((a, b) => a.name.localeCompare(b.name, i18next.language))

export const createOfficialDirectoryEffect = <T extends Official>({
  cacheKey,
  fetch,
}: OfficialDirectoryEffectOptions<T>): AtomEffect<T[]> =>
  createCachedRemoteCollectionEffect({ cacheKey, fetch, sort: sortOfficialDirectory })

export const filterOfficialDirectory = <T extends Official>(
  entries: T[],
  filter: string,
  includeEventTypes = false
): T[] => {
  const normalized = filter.toLocaleLowerCase(i18next.language)
  if (!normalized) return entries

  return entries.filter((entry) =>
    [
      entry.id,
      entry.email,
      entry.name,
      entry.location,
      entry.phone,
      entry.district,
      ...(includeEventTypes ? entry.eventTypes : []),
    ]
      .join(' ')
      .toLocaleLowerCase(i18next.language)
      .includes(normalized)
  )
}

export const useOfficialDirectoryRefresh = <T extends Official>(
  setEntries: SetterOrUpdater<T[]>,
  fetch: (token: string, refresh: true) => Promise<T[]>
) => {
  const token = useRecoilValue(validIdTokenSelector)
  const setUsers = useSetRecoilState(adminUsersAtom)

  return async () => {
    if (!token) throw new Error('missing token')
    const entries = await fetch(token, true)
    const users = await getUsers(token)
    setEntries(sortOfficialDirectory([...entries]))
    setUsers(users)
  }
}
