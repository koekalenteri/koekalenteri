import type { DataVersion, DataVersions, JsonUser } from '../../types'
import { CONFIG } from '../config'
import { dedupeUsersByEmail } from '../GetUsersFunction/handler'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { filterRelevantUsers, getAllUsers, userIsMemberOf } from './user'

type VersionRecord = { modifiedAt?: string }

const client = new CustomDynamoClient(CONFIG.userTable)

function dataVersionFromItems(items: VersionRecord[]): DataVersion {
  const modifiedAt = items.reduce<string | undefined>((latest, item) => {
    if (!item.modifiedAt) return latest
    if (!latest) return item.modifiedAt
    return item.modifiedAt > latest ? item.modifiedAt : latest
  }, undefined)

  return { count: items.length, modifiedAt }
}

async function getTableDataVersion(table: string): Promise<DataVersion> {
  const items = (await client.readAll<VersionRecord>(table)) ?? []
  return dataVersionFromItems(items)
}

async function getRelevantUsersDataVersion(user: JsonUser): Promise<DataVersion> {
  const allUsers = await getAllUsers()
  const memberOf = userIsMemberOf(user)
  const relevant = filterRelevantUsers(allUsers, user, memberOf)
  const deduped = dedupeUsersByEmail(relevant)

  return dataVersionFromItems(deduped)
}

export async function getDataVersions(user: JsonUser): Promise<DataVersions> {
  const [eventTypes, judges, officials, users] = await Promise.all([
    getTableDataVersion(CONFIG.eventTypeTable),
    getTableDataVersion(CONFIG.judgeTable),
    getTableDataVersion(CONFIG.officialTable),
    getRelevantUsersDataVersion(user),
  ])

  return { eventTypes, judges, officials, users }
}
