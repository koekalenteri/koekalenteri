import type { RegistrationClass } from '@/types'

export type FilterProps = {
  start: Date | null
  end: Date | null
  withOpenEntry?: boolean
  withClosingEntry?: boolean
  withUpcomingEntry?: boolean
  withFreePlaces?: boolean
  withResults?: boolean
  eventType: string[]
  eventClass: RegistrationClass[]
  judge: string[]
  organizer: string[]
}

export type EventMetadata = {
  /**
   * When this client last synced a range, by its own clock. Only the sync throttle reads it.
   */
  lastSyncAt?: number // epoch ms

  /**
   * The server's watermark from the last sync: the next range fetch asks only for events
   * modified after it (via `/event/?since=...`). The server's stamps are what `since` is
   * compared with, so the client's clock has no say in it (KOE-1501).
   */
  cursor?: number // epoch ms, server time

  /**
   * The last successfully fetched range parameters for the list view.
   *
   * Used to decide whether an incremental sync can be skipped (throttled)
   * without risking an empty/incorrect list when the requested range changes.
   */
  lastRangeStart?: number // epoch ms
  lastRangeEnd?: number | null // epoch ms; null means open-ended

  /**
   * The current start boundary of the retained in-memory cache.
   * Events that end before this boundary should be pruned.
   */
  retainedStart?: number // epoch ms (zoned start-of-day)

  /**
   * Per-event fetch freshness for detail views.
   */
  singles: Record<string, number> // event id to lastFetched timestamp
}
