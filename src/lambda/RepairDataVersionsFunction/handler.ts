import type { JsonUser } from '../../types'
import type { VersionedCollection, VersionRecord } from '../lib/repositories/dataVersionRepository'
import { GLOBAL_SCOPE, readStoredDataVersions, writeDataVersionFingerprint } from '../lib/dataVersions'
import { logger } from '../lib/log'
import { readEmailTemplates } from '../lib/repositories/emailTemplateRepository'
import { readEventTypes } from '../lib/repositories/eventTypeRepository'
import { readJudges } from '../lib/repositories/judgeRepository'
import { readLocationSnapshot } from '../lib/repositories/locationRepository'
import { readOfficials } from '../lib/repositories/officialRepository'
import { readOrganizers } from '../lib/repositories/organizerRepository'
import { getAllUsers, userScopes } from '../lib/user'

/**
 * The backstop for the version registry. Bumps are written by hand at every mutation site, so a
 * forgotten one would leave browsers on a stale cache indefinitely. Once a week this recomputes
 * what the versions would have been - the row count and the latest modifiedAt, per scope - and
 * remints the revision of anything that moved without being bumped.
 *
 * "Without being bumped" means no bump since the previous run: each row keeps the fingerprint and
 * the time of the check that measured it (`checkedAt`), and a revision `modifiedAt` later than that
 * is a bump made since. A fingerprint that moved with one is recorded and nothing else; only one
 * that moved without one is drift.
 *
 * The scans it needs are the ones that used to run on every /user call; here they run weekly.
 */

interface Fingerprint {
  count: number
  fingerprintAt?: string
}

type TimestampedItem = { modifiedAt?: string }

const fingerprintOf = <T extends object>(items: (T & TimestampedItem)[]): Fingerprint => ({
  count: items.length,
  fingerprintAt: items.reduce<string | undefined>(
    (latest, item) => (item.modifiedAt && (!latest || item.modifiedAt > latest) ? item.modifiedAt : latest),
    undefined
  ),
})

const key = (collection: string, scope: string) => `${collection}#${scope}`

const collectFingerprints = async (): Promise<Map<string, Fingerprint>> => {
  const [emailTemplates, eventTypes, judges, officials, locations, organizers, users] = await Promise.all([
    readEmailTemplates(),
    readEventTypes(),
    readJudges(),
    readOfficials(),
    // Locations live in a single snapshot row that carries its own count and modifiedAt.
    readLocationSnapshot(),
    readOrganizers(),
    getAllUsers(),
  ])

  const fingerprints = new Map<string, Fingerprint>([
    [key('emailTemplates', GLOBAL_SCOPE), fingerprintOf(emailTemplates ?? [])],
    [key('eventTypes', GLOBAL_SCOPE), fingerprintOf(eventTypes)],
    [key('judges', GLOBAL_SCOPE), fingerprintOf(judges)],
    [key('officials', GLOBAL_SCOPE), fingerprintOf(officials)],
    [key('locations', GLOBAL_SCOPE), { count: locations?.count ?? 0, fingerprintAt: locations?.modifiedAt }],
    // Organizer rows carry no timestamp, so the backstop only sees rows appearing or disappearing.
    // A renamed organizer is caught by the explicit bump at the two sites that can rename one.
    [key('organizers', GLOBAL_SCOPE), fingerprintOf(organizers)],
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

const differs = (stored: VersionRecord, fingerprint: Fingerprint) =>
  stored.count !== fingerprint.count || (stored.fingerprintAt ?? '') !== (fingerprint.fingerprintAt ?? '')

type Outcome = 'unchanged' | 'record' | 'remint'

/** What the run does with one row: leave it, record the new measurement, or remint as drift. */
const outcomeOf = (stored: VersionRecord | undefined, fingerprint: Fingerprint): Outcome => {
  // Nothing to compare against on the first run for a row, so record the fingerprint and leave
  // the revision alone rather than invalidating every cache for no reason.
  if (stored?.count === undefined) return 'record'
  // Transitional, for the release that introduced checkedAt: a row fingerprinted before it cannot
  // tell a bump from drift, and every collection that changed since the last run would alarm.
  // Record the check instead; from the next run on every row has one. Remove in the release after.
  if (!stored.checkedAt) return 'record'
  const bumped = (stored.modifiedAt ?? '') > stored.checkedAt
  if (differs(stored, fingerprint)) return bumped ? 'record' : 'remint'
  // A bump that moved nothing measurable (an organizer renamed) still moves the check forward, or a
  // later change without a bump would be taken for this one.
  return bumped ? 'record' : 'unchanged'
}

const repairDataVersions = async (): Promise<void> => {
  // Taken before the scans: a bump made while they run is later than the check, and so is not
  // mistaken for drift on the next run.
  const checkedAt = new Date().toISOString()
  const [fingerprints, stored] = await Promise.all([collectFingerprints(), readStoredDataVersions()])
  const storedByKey = new Map(stored.map((record) => [key(record.collection, record.scope), record]))
  // A scope whose last record disappeared keeps its row, and has to be measured as empty.
  for (const storedKey of storedByKey.keys()) {
    if (!fingerprints.has(storedKey)) fingerprints.set(storedKey, { count: 0 })
  }

  const reminted: string[] = []

  for (const [fingerprintKey, fingerprint] of fingerprints) {
    const outcome = outcomeOf(storedByKey.get(fingerprintKey), fingerprint)
    if (outcome === 'unchanged') continue

    const remint = outcome === 'remint'
    const { collection, scope } = parseKey(fingerprintKey)
    await writeDataVersionFingerprint(collection, scope, fingerprint, checkedAt, remint)
    if (remint) reminted.push(fingerprintKey)
  }

  if (reminted.length) {
    // The phrase is matched verbatim by the metric filter; keep it in the message.
    logger.info('data version drift repaired', { reminted })
  }
  logger.info('data versions checked', { checked: fingerprints.size, reminted: reminted.length })
}

export default repairDataVersions
