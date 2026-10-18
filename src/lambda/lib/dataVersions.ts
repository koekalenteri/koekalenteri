import type { DataVersion, DataVersions } from '../../types'
import type {
  Revision,
  VersionedCollection,
  VersionRecord,
  VersionRecordRef,
} from './repositories/dataVersionRepository'
import { nanoid } from 'nanoid'
import { logger } from './log'
import {
  readAllVersionRecords,
  readMigrationHashes,
  readVersionRecords,
  recordMigration,
  writeFingerprint,
  writeRevision,
} from './repositories/dataVersionRepository'

/** Every collection but `users` has a single version; see `userScopes()` in lib/user.ts. */
export const GLOBAL_SCOPE = '*'

/**
 * Version registry: one row per (collection, scope), holding an opaque revision token that is
 * reminted whenever the collection changes. Deriving the versions instead - counting rows and
 * taking max(modifiedAt) - meant five full table scans on every /user call, which is the hottest
 * lambda we have.
 *
 * The token is opaque on purpose. A counter cannot be maintained without drifting (a duplicated
 * write inflates it and every browser then refetches until something repairs the number), while a
 * needless remint costs exactly one extra fetch.
 */

/** Collections with a single global version. `users` is scoped per organization instead. */
const GLOBAL_VERSIONED_COLLECTIONS = [
  'emailTemplates',
  'eventTypes',
  'judges',
  'locations',
  'officials',
  'organizers',
] as const satisfies readonly VersionedCollection[]

/**
 * The version of a collection nothing has ever bumped. A stable value rather than an empty one, so
 * a collection that never changes stays fresh in the browser instead of refetching on every login.
 */
const INITIAL_REVISION = 'initial'

/** A new opaque revision token, stamped with the time it was minted. */
const mintRevision = (): Revision => ({ modifiedAt: new Date().toISOString(), revision: nanoid(10) })

const recordKey = (collection: string, scope: string) => `${collection}#${scope}`

/**
 * One comparable value per collection. Sorted so the same set of scopes always composes to the same
 * string, and scope-labelled so that a caller who joins or leaves an organization gets a different
 * value: their list is then a different list.
 */
const composeVersion = (records: Map<string, VersionRecord>, collection: VersionedCollection, scopes: string[]) => {
  const parts = [...scopes]
    .sort((a, b) => a.localeCompare(b))
    .map((scope) => ({ record: records.get(recordKey(collection, scope)), scope }))

  return {
    modifiedAt: parts.reduce<string | undefined>(
      (latest, { record }) =>
        record?.modifiedAt && (!latest || record.modifiedAt > latest) ? record.modifiedAt : latest,
      undefined
    ),
    revision: parts.map(({ record, scope }) => `${scope}:${record?.revision ?? INITIAL_REVISION}`).join('|'),
  } satisfies DataVersion
}

/**
 * @param userScopes the scopes the caller's user list is assembled from, from `callerScopes()`
 */
export async function getDataVersions(userScopes: string[]): Promise<DataVersions> {
  const records = await readVersionRecords([
    ...GLOBAL_VERSIONED_COLLECTIONS.map((collection) => ({ collection, scope: GLOBAL_SCOPE })),
    ...userScopes.map((scope): VersionRecordRef => ({ collection: 'users', scope })),
  ])
  const byKey = new Map(records.map((record) => [recordKey(record.collection, record.scope), record]))
  const global = (collection: VersionedCollection) => composeVersion(byKey, collection, [GLOBAL_SCOPE])

  return {
    emailTemplates: global('emailTemplates'),
    eventTypes: global('eventTypes'),
    judges: global('judges'),
    locations: global('locations'),
    officials: global('officials'),
    organizers: global('organizers'),
    users: composeVersion(byKey, 'users', userScopes),
  }
}

/**
 * Remints the revision of a collection. Never throws: a missed bump leaves browsers on a stale
 * cache until the next repair run, but failing the write that triggered it would be worse.
 */
export async function bumpDataVersion(collection: VersionedCollection, scopes: string[] = [GLOBAL_SCOPE]) {
  const unique = [...new Set(scopes)]
  if (!unique.length) return

  const revision = mintRevision()

  try {
    await Promise.all(unique.map((scope) => writeRevision(collection, scope, revision)))
  } catch (error) {
    logger.error('failed to bump data version', { collection, error, scopes: unique })
  }
}

/**
 * The stored code hash of each named migration that is recorded as applied. A row written before
 * hashes existed maps to undefined, as does one never written, and a caller compares the current hash
 * against the value so both read as pending.
 */
export const readAppliedMigrations = async (names: string[]) => readMigrationHashes(names)

/**
 * Records a migration unless a concurrent run already did: its mark, with the larger count, must
 * not be overwritten by a run that found nothing left to change.
 */
export const markMigrationApplied = async (name: string, count: number, hash: string) => {
  if (!(await recordMigration(name, count, hash, new Date().toISOString()))) {
    logger.info('migration already recorded', { name })
  }
}

/** The version rows the weekly repair measures against. */
export const readStoredDataVersions = async () => readAllVersionRecords()

/**
 * Records the fingerprint the weekly repair measured, reminting the revision when the data moved
 * without a bump. This is the backstop that keeps a forgotten bump from leaving a browser on a
 * stale cache forever.
 */
export const writeDataVersionFingerprint = async (
  collection: VersionedCollection,
  scope: string,
  fingerprint: Pick<VersionRecord, 'count' | 'fingerprintAt'>,
  remint: boolean
) => writeFingerprint(collection, scope, fingerprint, remint ? mintRevision() : undefined)
