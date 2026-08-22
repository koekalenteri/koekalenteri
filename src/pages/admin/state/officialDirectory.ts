import type { SetStateAction } from 'jotai'
import type { Official } from '../../../types'
import i18next from 'i18next'
import { useAtomValue, useSetAtom } from 'jotai'
import { getUsers } from '../../../api/user'
import { compareByLocalizedString } from '../../../lib/client/sort'
import { validIdTokenAtom } from '../../state'
import { atomWithCachedRemoteCollection } from './cached/createCachedRemoteCollection'
import { adminUsersAtom } from './user'

interface OfficialDirectoryAtomOptions<T extends Official> {
  cacheKey: 'judges' | 'officials'
  fetch: (token: string) => Promise<T[]>
}

const sortOfficialDirectory = <T extends Official>(entries: T[]): T[] => {
  entries.sort(compareByLocalizedString('name'))
  return entries
}

export const atomWithOfficialDirectory = <T extends Official>({ cacheKey, fetch }: OfficialDirectoryAtomOptions<T>) =>
  atomWithCachedRemoteCollection({ cacheKey, fetch, sort: sortOfficialDirectory })

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
  setEntries: (update: SetStateAction<T[]>) => void,
  fetch: (token: string, refresh: true) => Promise<T[]>
) => {
  const token = useAtomValue(validIdTokenAtom)
  const setUsers = useSetAtom(adminUsersAtom)

  return async () => {
    if (!token) throw new Error('missing token')
    const entries = await fetch(token, true)
    const users = await getUsers(token)
    setEntries(sortOfficialDirectory([...entries]))
    setUsers(users)
  }
}
