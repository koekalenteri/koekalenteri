// Stats repository contract and DynamoDB adapter.
//
// Methods are use-case oriented — callers describe what they want to persist,
// not how the underlying table is structured.

import type { JsonConfirmedEvent } from '../../types'
import type { StatDeltas } from './rules'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { bucketForCount } from './rules'

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface StatsRepository {
  /**
   * Atomically adds registration-count deltas to the organizer-event stats row.
   * Also sets denormalised `date` and `organizerId` for query convenience.
   */
  addOrganizerEventDeltas(event: JsonConfirmedEvent, deltas: StatDeltas): Promise<void>

  /**
   * Ensures the year is recorded in the YEARS index so it is discoverable.
   */
  recordYear(year: number): Promise<void>

  /**
   * Increments the per-entity participation counter for one stat dimension and
   * returns the previous count (undefined when this is the first occurrence).
   *
   * The caller is responsible for deciding whether to increment the TOTALS row
   * and whether bucket stats should be updated.
   */
  incrementEntityCount(year: number, type: string, entityId: string): Promise<{ previousCount: number | undefined }>

  /** Adds +1 to the TOTALS row for the given type/year. */
  incrementYearlyTotal(year: number, type: string): Promise<void>

  /**
   * Moves the bucket counter for a `dog#handler` entity when its count crosses
   * a bucket boundary.
   */
  updateDogHandlerBucket(year: number, oldCount: number | undefined, newCount: number): Promise<void>
}

// ---------------------------------------------------------------------------
// DynamoDB adapter
// ---------------------------------------------------------------------------

type StatsRepositoryDependencies = {
  db: Pick<CustomDynamoClient, 'update'>
}

export const createStatsRepository = ({ db }: StatsRepositoryDependencies): StatsRepository => ({
  async addOrganizerEventDeltas(event, deltas) {
    const key = {
      PK: `ORG#${event.organizer.id}`,
      SK: `${event.startDate}#${event.id}`,
    }

    await db.update(key, {
      add: {
        cancelledRegistrations: deltas.cancelledDelta,
        count: deltas.totalDelta,
        paidAmount: deltas.paidAmountDelta,
        paidRegistrations: deltas.paidDelta,
        refundedAmount: deltas.refundedAmountDelta,
        refundedRegistrations: deltas.refundedDelta,
      },
      set: {
        date: event.startDate,
        organizerId: event.organizer.id,
        updatedAt: new Date().toISOString(),
      },
    })
  },

  async incrementEntityCount(year, type, entityId) {
    const pk = `STAT#${year}#${type}`

    const result = await db.update({ PK: pk, SK: entityId }, { add: { count: 1 } }, undefined, 'UPDATED_OLD')

    return { previousCount: result?.Attributes?.count }
  },

  async incrementYearlyTotal(year, type) {
    await db.update({ PK: `TOTALS#${year}`, SK: type }, { add: { count: 1 } })
  },

  async recordYear(year) {
    await db.update(
      { PK: 'YEARS', SK: year.toString() },
      {
        set: { updatedAt: new Date().toISOString() },
      }
    )
  },

  async updateDogHandlerBucket(year, oldCount, newCount) {
    const prevCount = oldCount ?? 0
    const oldBucket = bucketForCount(prevCount)
    const newBucket = bucketForCount(newCount)

    if (oldBucket === newBucket) return

    if (oldBucket) {
      await db.update({ PK: `BUCKETS#${year}#dog#handler`, SK: oldBucket }, { add: { count: -1 } })
    }

    if (newBucket) {
      await db.update({ PK: `BUCKETS#${year}#dog#handler`, SK: newBucket }, { add: { count: 1 } })
    }
  },
})

// ---------------------------------------------------------------------------
// Singleton wired to the concrete DynamoDB table
// ---------------------------------------------------------------------------

const dynamoDB = new CustomDynamoClient(CONFIG.eventStatsTable)

export const statsRepository = createStatsRepository({ db: dynamoDB })
