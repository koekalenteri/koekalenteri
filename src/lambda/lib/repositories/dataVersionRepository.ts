import type { DataVersion, DataVersions } from '../../../types'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { isConditionalCheckFailure } from '../api-gw'

const dynamoDB = new CustomDynamoClient(CONFIG.dataVersionTable)

export type VersionedCollection = keyof DataVersions

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
export interface VersionRecord extends DataVersion {
  collection: VersionedCollection
  scope: string
  /**
   * Fingerprint of the data as of the last repair run. Only the weekly repair reads or writes
   * these: an ordinary bump does not know the row count, which is the whole point of the token.
   */
  count?: number
  fingerprintAt?: string
}

/** A collection's row to read: `scope` is `*` for a global collection, an organization for users. */
export type VersionRecordRef = Pick<VersionRecord, 'collection' | 'scope'>

/** A freshly minted revision token and the time it was minted. */
export type Revision = Required<Pick<DataVersion, 'modifiedAt' | 'revision'>>

/**
 * The registry of applied data migrations shares this table: `scope` is the migration's name, and
 * the row says when it ran and how many rows it changed. They are not versions, so the weekly
 * repair must not measure them (`readAllVersionRecords` leaves them out).
 */
const MIGRATIONS_COLLECTION = 'migrations'

interface MigrationRecord {
  appliedAt: string
  collection: typeof MIGRATIONS_COLLECTION
  count: number
  /** Digest of the migration's code when it ran; absent on rows from before hashes existed. */
  hash?: string
  scope: string
}

/** The stored rows of the given collections and scopes, in one batchGet; a row never written is absent. */
export const readVersionRecords = async (refs: VersionRecordRef[]) =>
  dynamoDB.batchGet<VersionRecord>(refs.map(({ collection, scope }) => ({ collection, scope })))

/** Every version row, the migration registry left out. */
export const readAllVersionRecords = async () =>
  ((await dynamoDB.readAll<VersionRecord | MigrationRecord>()) ?? []).filter(isVersionRecord)

const isVersionRecord = (record: VersionRecord | MigrationRecord): record is VersionRecord =>
  record.collection !== MIGRATIONS_COLLECTION

/** Stores a new revision for the scope of the collection. */
export const writeRevision = async (collection: VersionedCollection, scope: string, revision: Revision) => {
  await dynamoDB.update({ collection, scope }, { set: { ...revision } })
}

/** Stores the fingerprint the weekly repair measured, and a new revision with it when given one. */
export const writeFingerprint = async (
  collection: VersionedCollection,
  scope: string,
  fingerprint: Pick<VersionRecord, 'count' | 'fingerprintAt'>,
  revision?: Revision
) => {
  await dynamoDB.update(
    { collection, scope },
    {
      set: {
        count: fingerprint.count,
        fingerprintAt: fingerprint.fingerprintAt ?? '',
        ...revision,
      },
    }
  )
}

/**
 * The stored code hash of each named migration that is recorded as applied; one batchGet, whatever
 * the number. A row written before hashes existed maps to undefined, as does one never written.
 */
export const readMigrationHashes = async (names: string[]): Promise<Map<string, string | undefined>> => {
  const records = await dynamoDB.batchGet<MigrationRecord>(
    names.map((scope) => ({ collection: MIGRATIONS_COLLECTION, scope }))
  )
  return new Map(records.map((record) => [record.scope, record.hash]))
}

/**
 * Records a migration unless the row already holds the same hash, and says whether it did. The mark
 * lands when the row has no hash (no row at all, or one from before hashes existed) or a different
 * one (the migration's code changed); an equal hash is "someone already recorded it", and a
 * concurrent run's mark with the larger count stays. The four row states run against DynamoDB-local
 * in `dataVersions.integration.test.ts`.
 */
export const recordMigration = async (name: string, count: number, hash: string, appliedAt: string) => {
  try {
    await dynamoDB.update(
      { collection: MIGRATIONS_COLLECTION, scope: name },
      { set: { appliedAt, count, hash } },
      undefined,
      {
        expression: 'attribute_not_exists(#hash) OR #hash <> :hash',
        names: { '#hash': 'hash' },
        values: { ':hash': hash },
      }
    )
    return true
  } catch (error) {
    if (!isConditionalCheckFailure(error)) throw error
    return false
  }
}
