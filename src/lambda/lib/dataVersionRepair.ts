import type { JsonUser } from '../../types'
import type { VersionedCollection, VersionRecord } from './dataVersions'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { readStoredDataVersions, writeDataVersionFingerprint } from './dataVersions'
import { GLOBAL_SCOPE, userScopes } from './userScopes'

/**
 * The backstop for the version registry. Bumps are written by hand at every mutation site, so a
 * forgotten one would leave browsers on a stale cache indefinitely. Once a week this recomputes
 * what the versions would have been - the row count and the latest modifiedAt, per scope - and
 * remints the revision of anything that moved without being bumped.
 *
 * The scans it needs are the ones that used to run on every /user call; here they run weekly.
 */
const dynamoDB = new CustomDynamoClient(CONFIG.dataVersionTable)

interface Fingerprint {
  count: number
  fingerprintAt?: string
}

type TimestampedItem = { modifiedAt?: string }

const fingerprintOf = (items: TimestampedItem[]): Fingerprint => ({
  count: items.length,
  fingerprintAt: items.reduce<string | undefined>(
    (latest, item) => (item.modifiedAt && (!latest || item.modifiedAt > latest) ? item.modifiedAt : latest),
    undefined
  ),
})

const key = (collection: string, scope: string) => `${collection}#${scope}`

const readTable = async (table: string) => (await dynamoDB.readAll<TimestampedItem>({ table })) ?? []

const collectFingerprints = async (): Promise<Map<string, Fingerprint>> => {
  const [emailTemplates, eventTypes, judges, officials, locations, users] = await Promise.all([
    readTable(CONFIG.emailTemplateTable),
    readTable(CONFIG.eventTypeTable),
    readTable(CONFIG.judgeTable),
    readTable(CONFIG.officialTable),
    // Locations live in a single snapshot row that carries its own count and modifiedAt.
    dynamoDB.read<{ count?: number; modifiedAt?: string }>({ id: 'fi' }, CONFIG.locationTable),
    readTable(CONFIG.userTable) as Promise<JsonUser[]>,
  ])

  const fingerprints = new Map<string, Fingerprint>([
    [key('emailTemplates', GLOBAL_SCOPE), fingerprintOf(emailTemplates)],
    [key('eventTypes', GLOBAL_SCOPE), fingerprintOf(eventTypes)],
    [key('judges', GLOBAL_SCOPE), fingerprintOf(judges)],
    [key('officials', GLOBAL_SCOPE), fingerprintOf(officials)],
    [key('locations', GLOBAL_SCOPE), { count: locations?.count ?? 0, fingerprintAt: locations?.modifiedAt }],
  ])

  // Users are fingerprinted per scope, the same way they are versioned.
  const usersByScope = new Map<string, JsonUser[]>()
  for (const user of users) {
    for (const scope of userScopes(user)) {
      const scoped = usersByScope.get(scope)
      if (scoped) scoped.push(user)
      else usersByScope.set(scope, [user])
    }
  }
  for (const [scope, scoped] of usersByScope) {
    fingerprints.set(key('users', scope), fingerprintOf(scoped))
  }

  return fingerprints
}

const parseKey = (value: string) => {
  const separator = value.indexOf('#')
  return { collection: value.slice(0, separator) as VersionedCollection, scope: value.slice(separator + 1) }
}

const differs = (stored: VersionRecord | undefined, fingerprint: Fingerprint) =>
  stored?.count !== fingerprint.count || (stored.fingerprintAt ?? '') !== (fingerprint.fingerprintAt ?? '')

export const repairDataVersions = async (): Promise<void> => {
  const [fingerprints, stored] = await Promise.all([collectFingerprints(), readStoredDataVersions()])
  const storedByKey = new Map(stored.map((record) => [key(record.collection, record.scope), record]))
  // A scope whose last record disappeared keeps its row, and has to be measured as empty.
  for (const storedKey of storedByKey.keys()) {
    if (!fingerprints.has(storedKey)) fingerprints.set(storedKey, { count: 0 })
  }

  const reminted: string[] = []

  for (const [fingerprintKey, fingerprint] of fingerprints) {
    const record = storedByKey.get(fingerprintKey)
    if (!differs(record, fingerprint)) continue

    // Nothing to compare against on the first run for a row, so record the fingerprint and leave
    // the revision alone rather than invalidating every cache for no reason.
    const remint = record?.count !== undefined
    const { collection, scope } = parseKey(fingerprintKey)
    await writeDataVersionFingerprint(collection, scope, fingerprint, remint)
    if (remint) reminted.push(fingerprintKey)
  }

  if (reminted.length) {
    console.log(`data version drift repaired: ${reminted.join(', ')}`)
  }
  console.log(`checked ${fingerprints.size} data versions, reminted ${reminted.length}`)
}
